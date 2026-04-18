import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { Preference } from "mercadopago";
import { mpClient } from "@/lib/mercadopago";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const CreatePreferenceSchema = z.object({
  storeSlug: z.string().min(1),
  storeName: z.string().min(1),
  customerName: z.string().min(2),
  customerPhone: z.string().min(6),
  customerEmail: z.string().email().optional(),
  orderId: z.string().min(1),
});

// POST /api/marketplace/payment/mercadopago/create-preference
// Creates a MercadoPago checkout preference for a marketplace order
export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "STRICT", "mp-create-preference");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CreatePreferenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { storeSlug, storeName, customerName, customerPhone, customerEmail, orderId } = parsed.data;

    // ── SECURITY: Lookup order from DB — never trust client-sent prices ──────
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { name: true, quantity: true, price: true } } },
    });

    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    // Verify order belongs to the correct store (anti cross-tenant tampering)
    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { tenantId: true },
    });
    if (!store || order.tenantId !== store.tenantId) {
      logger.warn("[mp-preference] Order/store mismatch", { orderId, storeSlug });
      return NextResponse.json({ error: "Orden no corresponde a esta tienda" }, { status: 403 });
    }

    // Use DB-verified items and total (never client-sent values)
    const dbItems = order.items.map((item, idx) => ({
      id: `item-${idx}`,
      title: `${item.name} (${storeName})`,
      quantity: item.quantity,
      unit_price: Number(item.price),
      currency_id: "PEN" as const,
      category_id: "others",
    }));

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.pe";

    const preference = new Preference(mpClient);

    const result = await preference.create({
      body: {
        items: dbItems,
        payer: {
          name: customerName,
          phone: { number: customerPhone },
          ...(customerEmail && { email: customerEmail }),
        },
        back_urls: {
          success: `${baseUrl}/marketplace/payment-result?status=approved&order=${orderId}`,
          failure: `${baseUrl}/marketplace/payment-result?status=rejected&order=${orderId}`,
          pending: `${baseUrl}/marketplace/payment-result?status=pending&order=${orderId}`,
        },
        auto_return: "approved",
        external_reference: `${storeSlug}::${orderId}`,
        statement_descriptor: `BULEJE ${storeName.substring(0, 12).toUpperCase()}`,
        notification_url: `${baseUrl}/api/marketplace/payment/mercadopago/webhook`,
        payment_methods: {
          excluded_payment_types: [],
          installments: 1,
        },
        expires: true,
        expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30min
      },
    });

    return NextResponse.json({
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
