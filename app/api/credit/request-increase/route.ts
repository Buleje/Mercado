import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { getAvailableCredit } from "@/lib/credit/installment-manager";
import { CreditRequestsDB } from "@/lib/db/credit-requests.db";
import { createNotification } from "@/lib/create-notification";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

/**
 * POST /api/credit/request-increase
 *
 * El vecino (cliente autenticado) pide desde /mi-credito que la bodega le
 * otorgue/aumente su línea de fiado (Frente 3). Persiste una solicitud PENDING
 * (`CreditRequest`) y notifica al dueño. Dedup: si ya tiene una PENDING, no crea
 * otra. La decisión (aprobar con un monto / rechazar) la toma el dueño en el
 * admin → CreditDB.grantLimit desbloquea el fiado en checkout.
 *
 * Auth: cookie de customer-session. CSRF + rate limit.
 */

const BodySchema = z.object({
  reason: z.string().trim().max(280).optional(),
  requestedAmount: z.number().positive().max(100000).optional(),
});

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "STRICT", "credit-request-increase");
  if (_rl) return _rl;

  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const session = token ? await getCustomerPayload(token) : null;
  if (!session || !session.customerId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { tenantId, customerId: phone, name } = session;

  try {
    // Dedup: una solicitud PENDING a la vez.
    if (await CreditRequestsDB.hasPending(tenantId, phone)) {
      return NextResponse.json({ ok: true, alreadyPending: true });
    }

    await CreditRequestsDB.create(tenantId, {
      customerId: phone,
      customerName: name ?? null,
      requestedAmount: parsed.data.requestedAmount ?? null,
      reason: parsed.data.reason ?? null,
    });

    // Notificación al dueño con contexto (límite actual + monto pedido).
    const credit = await getAvailableCredit(tenantId, phone).catch(() => null);
    const limiteActual = credit ? `S/${Number(credit.creditLimit).toFixed(2)}` : "sin línea";
    const quien = name ? `${name} (${phone})` : phone;
    const pedido = parsed.data.requestedAmount
      ? ` Pide S/${parsed.data.requestedAmount.toFixed(2)}.`
      : "";
    const motivo = parsed.data.reason ? ` Motivo: "${parsed.data.reason}".` : "";

    await createNotification({
      tenantId,
      type: "CREDIT_INCREASE_REQUEST",
      severity: "MEDIUM",
      title: `Solicitud de línea de fiado: ${name ?? phone}`,
      body: `${quien} solicita línea de fiado (actual: ${limiteActual}).${pedido}${motivo}`,
      actionUrl: "/admin?tab=fiados",
      actionLabel: "Revisar solicitud",
      entityId: phone,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[credit/request-increase] error", { error: String(err) });
    return NextResponse.json({ error: "No se pudo enviar la solicitud" }, { status: 503 });
  }
}
