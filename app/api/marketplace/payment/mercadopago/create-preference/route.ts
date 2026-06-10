import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { Preference } from "mercadopago";
import { mpClient } from "@/lib/mercadopago";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { withApiHandler } from "@/lib/api-handler";

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
export const POST = withApiHandler("marketplace-mp-create-preference", async (req: NextRequest) => {
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

    // 1. Resolver store — getBySlug ya filtra `isPublished: true`.
    const store = await MarketplaceStoresDB.getBySlug(storeSlug);
    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // 2. Buscar la orden SCOPED al tenantId del store via OrdersDB.getById,
    //    que aplica `tenantId` obligatoriamente como 1er param. Cierra el
    //    cross-tenant leak: con un orderId válido de OTRO tenant + slug
    //    correcto, OrdersDB retorna null.
    const order = await OrdersDB.getById(store.tenantId, orderId);
    if (!order) {
      logger.warn("[mp-preference] Order not in store tenant", { orderId, storeSlug });
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    // F7: verificar que el customerPhone del payload coincida con el de la orden
    // Previene hijack: atacante con orderId ajeno + su propio phone no puede pagar.
    // `order.customer.phone` puede incluir prefijo "51" — normalizar solo últimos 9 dígitos.
    const orderPhone = (order.customer.phone ?? "").replace(/\D/g, "").slice(-9);
    const payloadPhone = customerPhone.replace(/\D/g, "").slice(-9);
    if (!orderPhone || orderPhone !== payloadPhone) {
      logger.warn("[mp-preference] customerPhone mismatch", {
        orderId,
        providedPhone: `***${customerPhone.slice(-4)}`,
      });
      return NextResponse.json({ error: "Datos de orden no coinciden" }, { status: 403 });
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

    // SECURITY 2026-05-07 (audit M1): retornar total derivado del backend
    // (NUNCA del cliente). El frontend lo usa solo para mostrar el monto en
    // el CTA "Pagar S/X a Tienda Y" del flujo multi-vendor.
    const total = dbItems.reduce((sum, it) => sum + it.unit_price * it.quantity, 0);

    return NextResponse.json({
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
      total,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
});
