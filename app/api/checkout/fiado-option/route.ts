import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CUSTOMER_SESSION,
  getCustomerPayload,
} from "@/lib/auth/customer-session";
import { getFiadoCheckoutEligibility } from "@/lib/credit/checkout-fiado";
import { applyRateLimit } from "@/lib/rate-limit";

const BodySchema = z.object({ total: z.number().positive() });

/**
 * POST /api/checkout/fiado-option
 *
 * Devuelve si el cliente autenticado puede pagar `total` con fiado
 * ("paga el día de pago"). El front lo usa para decidir si muestra la opción.
 * La elegibilidad y el total se validan SIEMPRE en backend (anti-fraude);
 * el branch real que crea el Fiado vive en `app/api/orders/route.ts`.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const limited = applyRateLimit(req, "STRICT", "checkout-fiado-option");
  if (limited) return limited;

  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const customer = token ? await getCustomerPayload(token) : null;
  if (!customer?.tenantId || !customer?.customerId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const elig = await getFiadoCheckoutEligibility(
    customer.tenantId,
    customer.customerId,
    parsed.data.total,
  );

  return NextResponse.json({
    eligible: elig.eligible,
    availableCredit: elig.availableCredit,
    dueDate: elig.dueDate ? elig.dueDate.toISOString() : null,
    reason: elig.reason,
  });
}
