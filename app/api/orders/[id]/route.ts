export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrdersDB, CouponsDB } from "@/lib/jsondb";
import type { DbOrder } from "@/lib/jsondb";
import { sendOrderNotification } from "@/lib/mailer";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const OrderItemSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(200),
  price: z.number().min(0),
  quantity: z.number().min(1),
  unit: z.string().max(30).optional(),
  image: z.string().max(500).optional(),
  category: z.string().optional(),
  badge: z.string().nullable().optional(),
});

const OrderPostSchema = z.object({
  customer: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().min(6).max(20),
    location: z.string().max(500).optional(),
    reference: z.string().max(300).optional(),
  }),
  items: z.array(OrderItemSchema).min(1),
  total: z.number().min(0), // client hint; server will recompute
  paymentMethod: z.enum(["yape", "efectivo"]).optional().default("efectivo"),
  notes: z.string().max(1000).optional(),
  deliverySlot: z.string().max(100).optional(),
  // Discount tracking fields
  appliedCouponCode: z.string().max(50).optional(),
  couponDiscount: z.number().min(0).optional(),     // server re-verifies this
  appliedPromoId: z.string().max(200).optional(),
  discountAmount: z.number().min(0).optional(),     // promo discount claimed by client
  // Payment details
  yapeOperationNumber: z.string().max(50).optional(),
  deuda: z.boolean().optional(),
});

/** Retry a DB operation up to `retries` times with exponential backoff on connection errors. */
async function withDbRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isConnectionError =
        err instanceof Error &&
        (err.message.includes("Connection") ||
          err.message.includes("ECONNREFUSED") ||
          err.message.includes("ETIMEDOUT") ||
          err.message.includes("connection") ||
          err.message.includes("timeout"));
      if (!isConnectionError || i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 300 * Math.pow(2, i))); // 300ms, 600ms
    }
  }
  throw new Error("Unreachable");
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");      // e.g. "pendiente"
    const limitParam   = searchParams.get("limit");       // default: all
    const sinceParam   = searchParams.get("since");       // ISO date string
    const phoneParam   = searchParams.get("phone");       // filter by customer phone

    let orders = await withDbRetry(() => OrdersDB.getAll());

    if (statusFilter) {
      const statuses = statusFilter.split(",").map(s => s.trim());
      orders = orders.filter(o => statuses.includes(o.status));
    }
    if (sinceParam) {
      const since = new Date(sinceParam);
      if (!isNaN(since.getTime())) {
        orders = orders.filter(o => new Date(o.createdAt) >= since);
      }
    }
    if (phoneParam) {
      orders = orders.filter(o => o.customer.phone === phoneParam);
    }
    if (limitParam) {
      const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 1000);
      orders = orders.slice(0, limit);
    }

    return NextResponse.json(orders, {
      headers: { "X-Total-Count": String(orders.length) },
    });
  } catch (e) {
    console.error("[orders] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 orders per IP per 10 minutes
  const ip = getClientIp(req);
  const { allowed, resetAt } = rateLimit(`orders:${ip}`, 5, 600);
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta de nuevo en unos minutos." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)) },
      }
    );
  }

  try {
    const raw = await req.json();
    const parsed = OrderPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invÃ¡lidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // â”€â”€ Server-side total recomputation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Prevents price manipulation: always compute from item prices Ã— quantities
    const itemsTotal = body.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // Re-verify coupon server-side when code is present
    let serverCouponDiscount = 0;
    let verifiedCouponCode: string | undefined;
    if (body.appliedCouponCode) {
      const coupon = await CouponsDB.getByCode(body.appliedCouponCode);
      const now = new Date();
      const valid =
        coupon &&
        coupon.active &&
        (!coupon.expiresAt || new Date(coupon.expiresAt) > now) &&
        (!coupon.maxUses || coupon.usedCount < coupon.maxUses) &&
        (!coupon.minPurchase || itemsTotal >= coupon.minPurchase);
      if (valid) {
        serverCouponDiscount =
          coupon.discountType === "percent"
            ? Math.round((itemsTotal * coupon.discountValue) / 100 * 100) / 100
            : Math.min(coupon.discountValue, itemsTotal);
        verifiedCouponCode = coupon.code;
      }
    }

    // Accept promo discount only when an appliedPromoId is supplied, capped at 99%
    const maxPromoDiscount = itemsTotal * 0.99;
    const promoDiscount = body.appliedPromoId && body.discountAmount
      ? Math.min(body.discountAmount, maxPromoDiscount)
      : 0;

    const computedTotal = Math.max(0, itemsTotal - serverCouponDiscount - promoDiscount);
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    const now = new Date().toISOString();
    const order: DbOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customer: {
        name: body.customer.name,
        phone: body.customer.phone,
        location: body.customer.location ?? "",
        reference: body.customer.reference ?? "",
      },
      items: body.items.map(i => ({
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        unit: i.unit ?? "und",
        image: i.image ?? "",
      })),
      total: computedTotal,
      status: "pendiente",
      paymentMethod: body.paymentMethod ?? "efectivo",
      notes: body.notes,
      deliverySlot: body.deliverySlot,
      yapeOperationNumber: body.yapeOperationNumber,
      deuda: body.deuda,
      ...(verifiedCouponCode && {
        appliedCouponCode: verifiedCouponCode,
        couponDiscount: serverCouponDiscount,
      }),
      ...(promoDiscount > 0 && {
        appliedPromoId: body.appliedPromoId,
        discountAmount: promoDiscount,
      }),
      createdAt: now,
      updatedAt: now,
    };
    const saved = await withDbRetry(() => OrdersDB.add(order));

    // Increment coupon usage counter (fire-and-forget)
    if (verifiedCouponCode) {
      CouponsDB.redeem(verifiedCouponCode).catch(() => {});
    }
    // Fire-and-forget email notification (never blocks the response)
    sendOrderNotification({
      id: saved.id,
      customerName: saved.customer.name,
      customerPhone: saved.customer.phone,
      customerLocation: saved.customer.location ?? "",
      total: saved.total,
      paymentMethod: saved.paymentMethod,
      items: saved.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, unit: i.unit })),
    }).catch(() => {});
    logActivity("Crear", "pedido", `Nuevo pedido de ${saved.customer.name} por S/${saved.total.toFixed(2)}`, saved.id).catch(() => {});
    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    console.error("[orders] POST error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
