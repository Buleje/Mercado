import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { GuestOrderSchema } from "@/lib/validators/guest-order";

/**
 * POST /api/guest/orders/create
 *
 * Guest Checkout — compra sin login.
 *
 * ⚠️  Stub documentado. NO escribe en `orders` real ni en `customers`.
 * Para producción:
 *   1. Crear ADR-checkout con guest path
 *   2. userId = "guest-{uuid}" y vincular en addresses/orders con tenantId
 *   3. Enviar credenciales temporales (magic link) por WhatsApp + email
 *   4. Idempotency key = phone + first item + date
 *
 * Auth: abierto (no requiere session). Valida tenantId por header.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = GuestOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const tenantId = req.headers.get("x-tenant-id") ?? "main";
  const guestUserId = `guest-${randomUUID()}`;
  const orderId = `go_${tenantId.slice(0, 6)}_${randomUUID().slice(0, 12)}`;
  const etaIso = new Date(Date.now() + 35 * 60 * 1000).toISOString();

  // Totals (backend calculado — regla #6)
  const subtotal = parsed.data.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const deliveryFee = 3.5;
  const total = subtotal + deliveryFee;

  // TODO (ADR-checkout): persistir, enviar notificaciones, idempotency
  return NextResponse.json({
    ok: true,
    order: {
      id: orderId,
      status: "stub_created",
      guestUserId,
      tenantId,
      subtotal,
      deliveryFee,
      total,
      estimatedEta: etaIso,
      // Link público con token mock para tracking anónimo
      trackingUrl: `/tracking?order=${orderId}&phone=${encodeURIComponent(parsed.data.phone)}`,
    },
  });
}
