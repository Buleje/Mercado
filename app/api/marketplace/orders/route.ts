export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplaceOrdersDB } from "@/lib/db/marketplace.db";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { sendWhatsAppNotification, sendWhatsAppText } from "@/lib/whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";
import { createNotification } from "@/lib/create-notification";
import { applyRateLimit } from "@/lib/rate-limit";

// ── GET /api/marketplace/orders — órdenes del marketplace para el admin ─────
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "gerente", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const orders = await prisma.order.findMany({
      where: {
        tenantId: auth.tenantId,
        source: "marketplace",
        deletedAt: null,
      },
      select: {
        id: true,
        customerName: true,
        total: true,
        status: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const result = orders.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      itemsCount: o._count.items,
    }));

    return NextResponse.json(result);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── Schemas ────────────────────────────────────────────────────────────────────

const CartItemSchema = z.object({
  storeProductId: z.string().min(1),
  productId:      z.number().int().positive(),
  name:           z.string().min(1).max(200),
  quantity:       z.number().int().min(1).max(9999),
  retailPrice:    z.number().positive(),    // precio sugerido del cliente (se recomputa server-side)
  unit:           z.string().min(1).max(20),
});

const CheckoutBodySchema = z.object({
  storeSlug:       z.string().min(1).max(100),
  customerName:    z.string().min(2).max(100),
  customerPhone:   z.string().min(6).max(20),
  customerAddress: z.string().min(5).max(300),
  notes:           z.string().max(500).optional(),
  items:           z.array(CartItemSchema).min(1).max(50),
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
    const body = await req.json().catch(() => ({}));
    const parsed = CheckoutBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const {
      storeSlug,
      customerName,
      customerPhone,
      customerAddress,
      notes,
      items,
    } = parsed.data;

    // Block orders to stores in vacation mode
    let targetStore: { vacationMode: boolean; vacationMessage: string | null } | null = null;
    try {
      targetStore = await prisma.store.findUnique({
        where: { slug: storeSlug },
        select: { vacationMode: true, vacationMessage: true },
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

    const order = await MarketplaceOrdersDB.createFromCart({
      storeSlug,
      customerName,
      customerPhone,
      customerAddress,
      notes,
      items,
    });

    // Fire-and-forget: notify customer via WhatsApp
    sendWhatsAppNotification({
      id:            order.id,
      customerName:  order.customerName,
      customerPhone: order.customerPhone,
      total:         order.total,
      status:        "pendiente",
    }).catch(() => {});

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
        }).catch(() => {});

        // Push notification to store owner's phone
        const settings = await prisma.settings.findFirst({
          where: { tenantId: store.tenantId },
          select: { ownerPhone: true },
        });
        if (settings?.ownerPhone) {
          sendPushToPhone(settings.ownerPhone, {
            title: `🛒 Nuevo pedido — ${store.name}`,
            body: `${customerName} pidió ${items.length} producto(s) por S/${order.total.toFixed(2)}`,
            url: `/admin?module=marketplace&tab=ordenes`,
          }).catch(() => {});

          // WhatsApp notification to vendor
          const itemList = items.slice(0, 5).map((i: { name: string; quantity: number }) => `  • ${i.quantity}x ${i.name}`).join("\n");
          const moreItems = items.length > 5 ? `\n  + ${items.length - 5} más...` : "";
          sendWhatsAppText(
            settings.ownerPhone,
            `🛒 *Nuevo pedido en ${store.name}*\n\n` +
            `👤 Cliente: ${customerName}\n` +
            `📞 Tel: ${customerPhone}\n` +
            `📍 Dirección: ${customerAddress || "No especificada"}\n\n` +
            `📦 Productos:\n${itemList}${moreItems}\n\n` +
            `💰 *Total: S/ ${order.total.toFixed(2)}*\n\n` +
            `Entra a tu panel para confirmar el pedido 👉`
          ).catch(() => {});
        }
      } catch { /* silencioso */ }
    })();

    // Fire-and-forget: earn loyalty points (1 point per S/1 spent)
    (async () => {
      try {
        if (!customerPhone) return;
        const customer = await prisma.customer.findUnique({
          where: { phone: customerPhone },
          select: { phone: true },
        });
        if (!customer) return;
        const pointsToEarn = Math.floor(order.total);
        if (pointsToEarn <= 0) return;
        await prisma.$transaction([
          prisma.loyaltyTransaction.create({
            data: {
              phone: customerPhone,
              tenantId: "main",
              type: "earn",
              points: pointsToEarn,
              description: `Compra marketplace #${order.id.slice(0, 8)}`,
              orderId: order.id,
            },
          }),
          prisma.customer.update({
            where: { phone: customerPhone },
            data: { loyaltyPoints: { increment: pointsToEarn } },
          }),
        ]);
      } catch { /* silencioso */ }
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
          const exists = await prisma.coupon.findFirst({
            where: { tenantId: store.tenantId, code: welcomeCode, storeId: store.id },
          });
          if (!exists) {
            await prisma.coupon.create({
              data: {
                code: welcomeCode,
                tenantId: store.tenantId,
                storeId: store.id,
                description: `¡Bienvenido a ${store.name}! 10% de descuento en tu próxima compra`,
                discountType: "percent",
                discountValue: 10,
                maxUses: 1,
                active: true,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
              },
            });
            // Send welcome coupon via WhatsApp
            sendWhatsAppText(
              customerPhone,
              `🎉 ¡Gracias por tu primera compra en *${store.name}*!\n\n` +
              `Te regalamos un cupón de *10% de descuento* para tu próxima compra:\n\n` +
              `🏷️ Código: *${welcomeCode}*\n` +
              `📅 Válido por 30 días\n\n` +
              `¡Úsalo en tu próximo pedido! 🛒`
            ).catch(() => {});
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
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
