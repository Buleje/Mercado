import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { getAvailableCredit } from "@/lib/credit/installment-manager";
import { createNotification } from "@/lib/create-notification";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

/**
 * POST /api/credit/request-increase
 *
 * El vecino (cliente autenticado) pide desde /mi-credito que la bodega le
 * aumente su línea de fiado. Crea una notificación para el admin (no toca el
 * límite: la decisión es del dueño). Dedup por cliente cada 24h (entityId =
 * customerId) para evitar spam.
 *
 * Auth: cookie de customer-session (no admin). CSRF + rate limit.
 * Sin schema nuevo — es un "nudge" al dueño, no una entidad de solicitud
 * formal (eso es el flujo solicitud→aprobación de otra fase).
 */

const BodySchema = z.object({
  reason: z.string().trim().max(280).optional(),
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
    // Límite actual — para que el dueño tenga contexto en la notificación.
    const credit = await getAvailableCredit(tenantId, phone).catch(() => null);
    const limiteActual = credit ? `S/${Number(credit.creditLimit).toFixed(2)}` : "sin línea";

    const quien = name ? `${name} (${phone})` : phone;
    const motivo = parsed.data.reason ? ` Motivo: "${parsed.data.reason}".` : "";

    await createNotification({
      tenantId,
      type: "CREDIT_INCREASE_REQUEST",
      severity: "MEDIUM",
      title: `Solicitud de aumento de línea: ${name ?? phone}`,
      body: `${quien} pide que le aumentes su línea de fiado (actual: ${limiteActual}).${motivo}`,
      actionUrl: "/admin?tab=fiados",
      actionLabel: "Revisar crédito",
      entityId: phone, // dedup: 1 solicitud por cliente cada 24h
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[credit/request-increase] error", { error: String(err) });
    return NextResponse.json({ error: "No se pudo enviar la solicitud" }, { status: 503 });
  }
}
