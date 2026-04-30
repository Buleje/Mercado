import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { prismaForTenant } from "@/lib/tenant";
import { resolveTenantSlug, resolveTenantSlugToId } from "@/lib/resolve-tenant";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { GuestOrderSchema } from "@/lib/validators/guest-order";

/**
 * POST /api/guest/orders/create
 *
 * Guest Checkout — compra sin login. Persiste el pedido en `Order` real
 * con `source = "guest"` y vincula al `Customer` (creándolo si no existe).
 *
 * Auth: público (sin requireAdmin / requireCustomer). Rate-limit STRICT
 * y validación tenant + trial vivo (ADR-084) protegen del abuso.
 *
 * Idempotency: hash determinístico de `phone + items signature + date(YYYY-MM-DD)`.
 * El doble-click del cliente devuelve la orden existente en vez de crear duplicado.
 *
 * Reglas de zona checkout (skill checkout-flow):
 *   - Totales calculados server-side (regla #6)
 *   - safeParse Zod (regla #2)
 *   - tenantId resuelto desde header `x-tenant-id` (regla #3)
 *   - Tenant suspendido / trial expirado → 402 (ADR-084)
 */
export async function POST(req: NextRequest) {
  // 1. Rate limit STRICT — mismo preset que POST /api/orders.
  const rateLimitResponse = applyRateLimit(req, "STRICT", "guest-orders-create");
  if (rateLimitResponse) return rateLimitResponse;

  // 2. Validar body.
  const body = await req.json().catch((err) => {
    logger.warn("[guest/orders/create] invalid body", { err: String(err) });
    return null;
  });
  const parsed = GuestOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // 3. Resolver tenant desde header.
  const rawTenantId = req.headers.get("x-tenant-id") ?? "main";
  const slugOrId = (await resolveTenantSlug(rawTenantId)) ?? "main";
  const tenantId = await resolveTenantSlugToId(slugOrId);

  // 4. ADR-084 guard — bloquea pedidos a tenants con trial expirado.
  const trialBlocked = await requireActiveSubscription(tenantId);
  if (trialBlocked) return trialBlocked;

  const data = parsed.data;
  const normalizedPhone = data.phone.replace(/\D/g, "").slice(-9);

  // 5. Idempotency determinística (no requiere header del cliente).
  //    phone + items hash + fecha YYYY-MM-DD → mismo body en mismo día = misma key.
  const itemsSig = createHash("sha256")
    .update(
      JSON.stringify(
        data.items
          .map((i) => [i.productId, i.quantity, i.unitPrice])
          .sort((a, b) => a[0] - b[0]),
      ),
    )
    .digest("hex")
    .slice(0, 16);
  const dateKey = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `guest_${normalizedPhone}_${itemsSig}_${dateKey}`;

  // 6. Check duplicado — si ya existe, devolver la orden original.
  // eslint-disable-next-line no-restricted-properties -- lookup público scoped por tenantId+idempotencyKey, no requiere wrapper.
  const existing = await prisma.order.findFirst({
    where: { idempotencyKey, tenantId },
    select: { id: true, status: true, total: true, createdAt: true },
  }).catch((err) => {
    logger.warn("[guest/orders/create] idempotency lookup failed", { idempotencyKey, err: String(err) });
    return null;
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      order: {
        id: existing.id,
        status: existing.status,
        total: Number(existing.total),
        createdAt: existing.createdAt.toISOString(),
      },
    });
  }

  // 7. Resolver names + units reales de productos (regla #6: nombres del backend).
  const productIds = data.items.map((i) => i.productId);
  const tx = prismaForTenant(tenantId);
  const productRows = await tx.product.findMany({
    where: { id: { in: productIds }, tenantId },
    select: { id: true, name: true, unit: true, price: true },
  });
  const productMap = new Map(productRows.map((p) => [p.id, p]));

  // 8. Totales backend (regla #6 — nunca confiar en cliente).
  const subtotal = data.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const deliveryFee = 3.5;
  const total = subtotal + deliveryFee;

  const orderId = `go_${tenantId.slice(0, 6)}_${randomUUID().slice(0, 12)}`;
  const etaIso = new Date(Date.now() + 35 * 60 * 1000);

  // 9. Upsert Customer (guest temporal vinculado al tenant).
  try {
    // eslint-disable-next-line no-restricted-properties -- guest path: customer phone es @id, upsert atómico previene race con guest concurrentes.
    await prisma.customer.upsert({
      where: { phone: normalizedPhone },
      update: {}, // no pisar datos existentes si el phone ya está registrado
      create: {
        phone: normalizedPhone,
        name: data.name,
        location: data.address.line1,
        reference: data.address.reference ?? "",
        tenantId,
        email: data.email,
      },
    });
  } catch (err) {
    logger.warn("[guest/orders/create] customer upsert failed", {
      phone: normalizedPhone,
      err: err instanceof Error ? err.message : String(err),
    });
    // No abortamos — el Order puede crearse sin Customer (FK setNull).
  }

  // 10. Crear Order + OrderItems.
  try {
    await tx.order.create({
      data: {
        id: orderId,
        tenantId,
        customerName: data.name,
        customerPhone: normalizedPhone,
        customerLocation: data.address.line1,
        customerReference: data.address.reference ?? "",
        total,
        status: "pendiente",
        notes: data.notes ?? null,
        paymentMethod: data.paymentMethod,
        idempotencyKey,
        source: "guest",
        estimatedDeliveryAt: etaIso,
        items: {
          create: data.items.map((item) => {
            const p = productMap.get(item.productId);
            return {
              productId: item.productId,
              name: p?.name ?? `Producto ${item.productId}`,
              price: item.unitPrice,
              quantity: item.quantity,
              unit: p?.unit ?? "unidad",
            };
          }),
        },
      },
    });
  } catch (err) {
    logger.error("[guest/orders/create] order create failed", {
      orderId,
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error al guardar tu pedido. Intentá de nuevo." },
      { status: 503 },
    );
  }

  logger.info("[guest/orders/create] order persisted", {
    orderId,
    tenantId,
    phone: normalizedPhone,
    items: data.items.length,
    total,
  });

  return NextResponse.json(
    {
      ok: true,
      order: {
        id: orderId,
        status: "pendiente",
        tenantId,
        subtotal,
        deliveryFee,
        total,
        estimatedEta: etaIso.toISOString(),
        trackingUrl: `/tracking?order=${orderId}&phone=${encodeURIComponent(normalizedPhone)}`,
      },
    },
    { status: 201 },
  );
}
