/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplaceOrdersDB } from "@/lib/db/marketplace.db";
import { MarketplaceAdminDB } from "@/lib/db/marketplace-public.db";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { sendWhatsAppNotificationWithRetry, sendWhatsAppQueued } from "@/lib/whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";
import { createNotification } from "@/lib/create-notification";
import { applyRateLimit } from "@/lib/rate-limit";
import { cacheStore } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { verifyProofToken } from "@/app/api/marketplace/checkout/payment-proof/route";
import {
  getCustomerPayload,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";
import { randomBytes } from "crypto";

// ── Helpers ────────────────────────────────────────────────────────────────────

function redactPII(body: unknown): string {
  if (!body || typeof body !== "object") return "[non-object body]";
  const b = body as Record<string, unknown>;
  return JSON.stringify({
    ...b,
    customerPhone: typeof b.customerPhone === "string" ? `***${b.customerPhone.slice(-4)}` : undefined,
    customerName: b.customerName ? "[REDACTED]" : undefined,
    customerAddress: b.customerAddress ? "[REDACTED]" : undefined,
    customer: b.customer ? "[REDACTED-OBJ]" : undefined,
  }).slice(0, 600);
}

// ── GET /api/marketplace/orders — órdenes del marketplace para el admin ─────
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const orders = await MarketplaceAdminDB.getOrdersForAdmin(auth.tenantId);

    // F7: enmascarar teléfono en listado masivo — solo últimos 4 dígitos
    const result = orders.map((o) => {
      const rawPhone = o.customerPhone ?? null;
      const maskedPhone = rawPhone && rawPhone.length > 4
        ? `***${rawPhone.slice(-4)}`
        : rawPhone;
      return {
        id:                o.id,
        customerName:      o.customerName,
        customerPhone:     maskedPhone,
        customerLocation:  o.customerLocation ?? "",
        customerReference: o.customerReference ?? "",
        total:             Number(o.total),
        status:            o.status,
        createdAt:         o.createdAt.toISOString(),
        itemsCount:        o._count.items,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── Schemas ────────────────────────────────────────────────────────────────────

// Schema MUY tolerante — el checkout nunca debe rechazarse por un campo
// mock o un id numérico vs string. La validación real (producto existe,
// precio correcto, etc.) ocurre en MarketplaceOrdersDB.createFromCart.
//
// Coerce helpers: algunos items del cart legacy persisten valores como
// strings (`"3.9"` en vez de `3.9`). Los aceptamos y convertimos.
const coerceNumber = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? Number(v) || 0 : v))
  .pipe(z.number().nonnegative());

const coerceInt = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? parseInt(v, 10) || 0 : Math.trunc(v)))
  .pipe(z.number().int().nonnegative());

const CartItemSchema = z.object({
  storeProductId: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => v.length > 0, { message: "storeProductId requerido" }),
  productId:      coerceInt,
  name:           z.string().min(1).max(200),
  quantity:       coerceInt.pipe(z.number().int().min(1).max(9999)),
  retailPrice:    coerceNumber.optional().default(0),
  unit:           z.string().max(20).optional().default("unidad"),
});

const PaymentProofSchema = z.object({
  proofUrl: z.string().url().max(500),
  proofToken: z.string().min(20).max(300),
  reference: z.string().max(40).optional(),
  amountPEN: z.number().min(0).max(100000),
});

const CheckoutBodySchema = z.object({
  storeSlug:       z.string().min(1).max(100),
  customerName:    z.string().min(2).max(100),
  customerPhone:   z.string().min(6).max(20),
  customerAddress: z.string().min(5).max(300),
  notes:           z.string().max(500).optional(),
  // paymentMethod: aceptar cualquier string — el DB soporta free-form
  paymentMethod:   z.string().max(40).optional(),
  couponCode:      z.string().max(30).optional(),
  loyaltyRedeemPoints: z.number().int().min(0).max(100000).optional(),
  items:           z.array(CartItemSchema).min(1).max(50),
  /** ISO timestamp opcional para reservar la entrega cuando la tienda
   *  está cerrada. Validado contra hoursJson de la tienda. Max 7 días futuro. */
  scheduledFor:    z.string().datetime().optional(),
  /** Comprobante de pago (Yape/Plin/Transferencia). Cuando el cliente
   *  paga manualmente, el frontend sube la captura via
   *  /api/marketplace/checkout/payment-proof y recibe { proofUrl, proofToken }.
   *  El token va firmado con HMAC para anti-tampering. Persistimos en
   *  PaymentApproval.imageUrl y linkamos Order.paymentApprovalId. */
  paymentProof:    PaymentProofSchema.optional(),
});

// ── POST /api/marketplace/orders — checkout del carrito del marketplace ─────────
// Endpoint público: el comprador no necesita ser admin.
// El precio real siempre se calcula server-side desde la DB.

export async function POST(req: NextRequest) {
  // Rate limit: prevent order spam (10 per 15 min per IP)
  const rateLimitResponse = applyRateLimit(req, "STRICT", "marketplace-orders");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    // F2: Idempotency-Key — evita doble pedido + doble cupón por doble click.
    // TTL 300s (5 min): si la misma combinación key+phone llega de nuevo,
    // devolvemos el orderId cacheado en vez de crear otra orden.
    const idemKey = req.headers.get("Idempotency-Key") ?? null;

    const body = await req.json().catch(() => ({}));
    const parsed = CheckoutBodySchema.safeParse(body);
    if (!parsed.success) {
      // Log EXPLÍCITO en consola del server — sale en la terminal de `npm run dev`.
      // Si el user reporta 400, aquí vemos el campo exacto que falla.
      const issuesSummary = parsed.error.issues
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; ");
      console.error(
        `\n[orders 400] Validation failed\n   traceId: ${traceId}\n   issues: ${issuesSummary}\n   body: ${redactPII(body)}\n`,
      );
      logger.warn("[marketplace/orders] Validation failed", {
        traceId,
        issues: parsed.error.issues,
      });
      return NextResponse.json(
        {
          error: "Datos inválidos",
          message: issuesSummary,
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const {
      storeSlug,
      customerName,
      customerPhone,
      customerAddress,
      notes,
      paymentMethod,
      couponCode,
      loyaltyRedeemPoints,
      items,
      scheduledFor,
      paymentProof,
    } = parsed.data;

    // ── Validación de comprobante (Yape/Plin/Transfer) ───────────────
    // Si el cliente envió un paymentProof, requiere sesión de customer
    // + token HMAC válido emitido por /api/marketplace/checkout/payment-proof.
    // Sin esto, un atacante podría reusar un proofUrl ajeno.
    let proofCustomerId: string | null = null;
    if (paymentProof) {
      const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
      const session = token ? await getCustomerPayload(token) : null;
      if (!session) {
        return NextResponse.json(
          { error: "Necesitas iniciar sesión para subir un comprobante" },
          { status: 401 },
        );
      }
      proofCustomerId = session.customerId ?? session.email;
      const method = (paymentMethod ?? "").toLowerCase();
      if (method !== "yape" && method !== "plin" && method !== "transfer") {
        return NextResponse.json(
          { error: "paymentMethod debe ser yape/plin/transfer cuando se envía comprobante" },
          { status: 400 },
        );
      }
      const expectedCents = Math.round(paymentProof.amountPEN * 100);
      const verify = verifyProofToken(paymentProof.proofToken, {
        customerId: proofCustomerId,
        storeSlug,
        method,
        amountCents: expectedCents,
      });
      if (!verify.ok) {
        logger.warn("[marketplace/orders] proof token invalid", {
          reason: verify.reason,
          customerId: proofCustomerId,
          storeSlug,
        });
        return NextResponse.json(
          { error: "Comprobante inválido. Sube la captura nuevamente." },
          { status: 400 },
        );
      }
    }

    // F2: Idempotency-Key — revisar caché antes de procesar para evitar doble pedido.
    // Round 21 P0-3 fix (Bug Hunter): cubrir también pedidos anónimos.
    if (idemKey) {
      const idemCacheKey = `idem:order:${customerPhone || "anon"}:${idemKey}`;
      const cached = cacheStore.get<{ orderId: string }>(idemCacheKey);
      if (cached && cached.orderId) {
        logger.info("[marketplace/orders] idempotent replay", { idemKey, customerPhone: customerPhone ?? "anon" });
        return NextResponse.json(
          { data: { orderId: cached.orderId }, message: "Pedido ya registrado." },
          { status: 200 },
        );
      }
    }

    // Block orders to stores in vacation mode
    let targetStore: { id: string; vacationMode: boolean; vacationMessage: string | null } | null = null;
    try {
      targetStore = await prisma.store.findUnique({
        where: { slug: storeSlug },
        select: { id: true, vacationMode: true, vacationMessage: true },
      });
    } catch {
      // Store table may not exist yet — skip vacation check
    }
    if (targetStore?.vacationMode) {
      return NextResponse.json(
        { error: targetStore.vacationMessage || "Esta tienda está en vacaciones y no recibe pedidos en este momento." },
        { status: 422 },
      );
    }

    // ── Reserva: validar scheduledFor contra hoursJson de la tienda ──
    // Si la tienda está cerrada AHORA y el cliente no envió scheduledFor,
    // el frontend debe haberlo seteado al `nextOpening`. Si tampoco vino,
    // dejamos pasar (el dueño verá la orden y la confirmará al abrir —
    // comportamiento "best effort" para clientes legacy).
    let resolvedScheduledFor: Date | null = null;
    if (scheduledFor && targetStore?.id) {
      const when = new Date(scheduledFor);
      if (Number.isNaN(when.getTime())) {
        return NextResponse.json(
          { error: "scheduledFor debe ser ISO 8601 válido" },
          { status: 400 },
        );
      }
      try {
        const rows = await prisma.$queryRaw<Array<{ hoursJson: unknown }>>`
          SELECT "hoursJson" FROM "Store" WHERE id = ${targetStore.id} LIMIT 1
        `;
        const hoursJson = rows[0]?.hoursJson ?? null;
        if (hoursJson && typeof hoursJson === "object") {
          const { isValidReservationSlot } = await import("@/lib/marketplace-store-hours");
          const check = isValidReservationSlot(hoursJson as never, when, new Date(), 7);
          if (!check.ok) {
            return NextResponse.json(
              { error: `Reserva inválida: ${check.reason}` },
              { status: 422 },
            );
          }
        }
      } catch (err) {
        logger.warn("[marketplace/orders] hoursJson lookup failed for reservation", {
          error: String(err),
        });
      }
      resolvedScheduledFor = when;
    }

    // Round 10 M004: audit log de Order/Customer create con phone+IP. Si el
    // checkout es anónimo (sin phone), el actor queda como "anonymous".
    const order = await runWithAuditContext(
      req,
      customerPhone || "anonymous",
      () =>
        MarketplaceOrdersDB.createFromCart({
          storeSlug,
          customerName,
          customerPhone,
          customerAddress,
          notes,
          paymentMethod,
          couponCode,
          loyaltyRedeemPoints,
          items,
        }),
    );

    // ── Persistir PaymentApproval con la captura del comprobante ─────
    // Yape/Plin/Transfer pagos manuales: el cliente subió la foto antes
    // de confirmar. Acá la asociamos a la Order recién creada. El admin
    // la revisa en /admin?tab=pedidos / /admin?tab=marketplace / superadmin.
    if (paymentProof) {
      try {
        const method = (paymentMethod ?? "").toLowerCase();
        const approvalId = `pa_${Date.now()}_${randomBytes(6).toString("hex")}`;
        await prisma.paymentApproval.create({
          data: {
            id: approvalId,
            tenantId: order.sellerTenantId,
            customerPhone: order.customerPhone ?? customerPhone,
            expectedAmount: order.total,
            imageUrl: paymentProof.proofUrl,
            yapeOpCode:
              method === "yape" || method === "plin"
                ? (paymentProof.reference ?? null)
                : null,
            status: "pending",
          },
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentApprovalId: approvalId },
        });
      } catch (err) {
        // No bloqueamos la orden — el pago manual igual quedó como
        // "pendiente" y el admin puede verlo en el detalle. Logueamos
        // duro para que el equipo Buleje lo cierre manualmente.
        logger.error("[marketplace/orders] paymentApproval persist failed", {
          error: String(err),
          orderId: order.id,
        });
      }
    }

    // F2: persistir idempotency en cache — doble-click en los próximos 300s devuelve este orderId.
    // Round 21 P0-3 fix (Bug Hunter): el guard exigía phone, lo que dejaba
    // pedidos anónimos sin protección — doble-click creaba 2 pedidos + 2
    // decrements de stock + 2 commissions. Idempotency-Key del cliente es
    // UUIDv4 → colisión despreciable con prefijo "anon".
    if (idemKey) {
      const idemCacheKey = `idem:order:${customerPhone || "anon"}:${idemKey}`;
      cacheStore.set(idemCacheKey, { orderId: order.id }, 300);
    }

    // Persist scheduledFor via raw query (columna fuera del schema Prisma).
    if (resolvedScheduledFor) {
      try {
        await prisma.$executeRaw`
          UPDATE "Order" SET "scheduledFor" = ${resolvedScheduledFor} WHERE id = ${order.id}
        `;
      } catch (err) {
        logger.warn("[marketplace/orders] failed to persist scheduledFor", {
          error: String(err),
          orderId: order.id,
        });
      }
    }

    // Fire-and-forget: dispara la primera DeliveryOffer al repartidor más cercano
    // (geocoding + matchmaking). Si falla o no hay partners, el cron
    // `delivery-offer-cascade` actúa como red de seguridad cada 30s.
    void (async () => {
      try {
        const { triggerDeliveryOfferOnOrder } = await import(
          "@/lib/delivery/trigger-offer-on-order"
        );
        await triggerDeliveryOfferOnOrder({
          orderId: order.id,
          tenantId: order.sellerTenantId,
          customerLocation: order.customerAddress ?? null,
        });
      } catch (err) {
        logger.error("[marketplace/orders] trigger delivery offer failed", {
          error: String(err),
        });
      }
    })();

    // Fire-and-forget: notify customer via WhatsApp (with retries)
    sendWhatsAppNotificationWithRetry({
      id:            order.id,
      customerName:  order.customerName,
      customerPhone: order.customerPhone,
      total:         order.total,
      status:        "pendiente",
    }).catch((err) => logger.error("[marketplace/orders] operation failed", { error: String(err) }));

    // Fire-and-forget: notify store owner via push + in-app notification
    (async () => {
      try {
        const store = await prisma.store.findFirst({
          where: { slug: storeSlug },
          select: { tenantId: true, name: true },
        });
        if (!store) return;

        // In-app notification for the admin panel
        createNotification({
          tenantId: store.tenantId,
          type: "marketplace_order",
          severity: "HIGH",
          title: `Nuevo pedido marketplace — S/${order.total.toFixed(2)}`,
          body: `${customerName} hizo un pedido de ${items.length} producto(s) por S/${order.total.toFixed(2)}`,
          actionUrl: `/admin?module=marketplace&tab=ordenes`,
          actionLabel: "Ver pedido",
          entityId: order.id,
        }).catch((err) => logger.error("[marketplace/orders] create notification failed", { error: String(err), tenantId: store.tenantId }));

        // Push notification to store owner's phone
        // ownerPhone pertenece al modelo Tenant, no a Settings
        const tenant = await prisma.tenant.findUnique({
          where: { slug: store.tenantId },
          select: { ownerPhone: true },
        });
        const ownerPhone = tenant?.ownerPhone ?? null;
        if (ownerPhone) {
          sendPushToPhone(ownerPhone, {
            title: `Nuevo pedido — ${store.name}`,
            body: `${customerName} pidió ${items.length} producto(s) por S/${order.total.toFixed(2)}`,
            url: `/admin?module=marketplace&tab=ordenes`,
          }).catch((err) => logger.error("[marketplace/orders] push notification failed", { error: String(err), tenantId: store.tenantId }));

          // WhatsApp notification to vendor (with retries)
          const itemList = items.slice(0, 5).map((i: { name: string; quantity: number }) => `  • ${i.quantity}x ${i.name}`).join("\n");
          const moreItems = items.length > 5 ? `\n  + ${items.length - 5} más...` : "";
          sendWhatsAppQueued(
            ownerPhone,
            `*Nuevo pedido en ${store.name}*\n\n` +
            `Cliente: ${customerName}\n` +
            `Tel: ${customerPhone}\n` +
            `Direccion: ${customerAddress || "No especificada"}\n\n` +
            `Productos:\n${itemList}${moreItems}\n\n` +
            `Total: S/ ${order.total.toFixed(2)}\n\n` +
            `Entra a tu panel para confirmar el pedido`,
            { tenantId: store.tenantId, context: "marketplace-order-vendor-notify" },
          ).catch((err) => logger.error("[marketplace/orders] vendor whatsapp failed", { error: String(err), tenantId: store.tenantId }));
        }
      } catch { /* silencioso */ }
    })();

    // Fire-and-forget: earn loyalty points (1 point per S/1 spent)
    // TODO Sprint C Wave 4: el modelo LoyaltyTransaction no existe en schema.prisma aún.
    // SECURITY 2026-05-06 (audit team H014): scope (phone, tenantId) para
    // que el primer customer con ese phone NO gane los puntos del orden de
    // OTRO tenant. Antes update where:{phone} ganaba el primer match
    // global porque phone es @unique cross-tenant.
    (async () => {
      try {
        if (!customerPhone) return;
        const tenantIdForLoyalty = order.sellerTenantId;
        const exists = await prisma.customer.findFirst({
          where: { phone: customerPhone, tenantId: tenantIdForLoyalty },
          select: { phone: true },
        });
        if (!exists) return;
        const pointsToEarn = Math.floor(order.total);
        if (pointsToEarn <= 0) return;
        await prisma.customer.updateMany({
          where: { phone: customerPhone, tenantId: tenantIdForLoyalty },
          data: { loyaltyPoints: { increment: pointsToEarn } },
        });
      } catch (err) {
        logger.warn("[marketplace/orders] loyalty earn failed", { err: String(err) });
      }
    })();

    // Fire-and-forget: create welcome coupon for first-time buyer on this store
    (async () => {
      try {
        if (!customerPhone) return;
        const store = await prisma.store.findFirst({
          where: { slug: storeSlug },
          select: { id: true, tenantId: true, name: true },
        });
        if (!store) return;
        // Check if this is the first order from this phone on this store
        const prevOrders = await prisma.order.count({
          where: {
            customerPhone,
            tenantId: store.tenantId,
            source: "marketplace",
            deletedAt: null,
          },
        });
        // If this is their first order (count=1 means just the one we created)
        if (prevOrders <= 1) {
          const welcomeCode = `BIENVENIDO${customerPhone.slice(-4)}`;
          // Don't create if already exists
          // Coupon no tiene campo storeId — se discrimina por tenantId + code
          // TODO Sprint C Wave 4: agregar storeId a Coupon si se necesita por-tienda
          const exists = await prisma.coupon.findFirst({
            where: { tenantId: store.tenantId, code: welcomeCode },
          });
          if (!exists) {
            await prisma.coupon.create({
              data: {
                code: welcomeCode,
                tenantId: store.tenantId,
                description: `Bienvenido a ${store.name}! 10% de descuento en tu proxima compra`,
                discountType: "percent",
                discountValue: 10,
                maxUses: 1,
                active: true,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              },
            });
            // Send welcome coupon via WhatsApp (with retries)
            sendWhatsAppQueued(
              customerPhone,
              `🎉 ¡Gracias por tu primera compra en *${store.name}*!\n\n` +
              `Te regalamos un cupón de *10% de descuento* para tu próxima compra:\n\n` +
              `🏷️ Código: *${welcomeCode}*\n` +
              `📅 Válido por 30 días\n\n` +
              `¡Úsalo en tu próximo pedido! 🛒`,
              { tenantId: store.tenantId, context: "marketplace-welcome-coupon" },
            ).catch((err) => logger.error("[marketplace/orders] welcome coupon whatsapp failed", { error: String(err), tenantId: store.tenantId }));
          }
        }
      } catch { /* silencioso */ }
    })();

    return NextResponse.json(
      {
        data: {
          orderId:    order.id,
          storeName:  order.storeName,
          storeSlug:  order.storeSlug,
          total:      order.total,
          status:     order.status,
          createdAt:  order.createdAt,
        },
        message: "Pedido creado exitosamente. El vendedor se comunicará contigo pronto.",
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Errores de negocio conocidos → 409/422 (no 500)
    if (msg.startsWith("Stock insuficiente para ") || msg.startsWith("Producto no disponible: ")) {
      // Parsear el nombre del producto y stock disponible para que el
      // frontend pueda mostrar UI clara y permitir al cliente ajustar.
      // Formato del error: "Stock insuficiente para X (quedan N, pediste M)"
      // o el formato legacy sin números: "Stock insuficiente para X".
      const match = msg.match(/Stock insuficiente para (.+?)(?:\s*\(quedan (\d+),\s*pediste (\d+)\))?$/);
      const productName = match?.[1] ?? null;
      const available = match?.[2] ? Number(match[2]) : null;
      const requested = match?.[3] ? Number(match[3]) : null;
      return NextResponse.json(
        {
          error: msg,
          code: "STOCK_INSUFFICIENT",
          productName,
          available,
          requested,
        },
        { status: 409 },
      );
    }
    if (msg === "Cupón inválido o expirado" || msg === "Cupón ya alcanzó el límite de usos" || msg === "Cupón ya consumido") {
      return NextResponse.json({ error: msg, code: "COUPON_INVALID" }, { status: 422 });
    }
    if (msg === "Puntos de fidelidad insuficientes") {
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    // Log full stack al terminal del dev server — sin esto, toErrorPayload
    // devuelve un 500 anonimo al cliente pero el server no imprime nada util.
    console.error(
      `\n[orders 500] Unhandled error\n   traceId: ${traceId}\n   message: ${msg}\n   stack: ${err instanceof Error ? err.stack : "(no stack)"}\n`,
    );
    logger.error("[marketplace/orders] unhandled error", {
      traceId,
      err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
