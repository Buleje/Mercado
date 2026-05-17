import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getMercadoPagoPayment,
  getMPSubscriptionStatus,
  verifyMPWebhookSignature,
} from "@/lib/mercadopago";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { PLAN_ORDER, type PlanId } from "@/lib/plans";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/mp-webhook
//
// Receptor de notificaciones IPN (Instant Payment Notification) de Mercado Pago.
//
// Flujo:
//   1. MP hace POST con query params: ?id=<paymentId>&topic=payment  (formato IPN)
//      o bien  ?data.id=<paymentId>&type=payment  (formato Webhooks v2)
//   2. Verificar firma x-signature (si está configurada) o fallback por token
//   3. Consultar el pago a la API de MP para obtener estado y external_reference
//   4. Si approved → actualizar tenant.plan + fecha de expiración
//   5. Idempotencia: marcar el paymentId procesado en DB para no duplicar
//
// Importante: siempre responder 200 antes de 5 s para que MP no reintente.
// ─────────────────────────────────────────────────────────────────────────────

// Modelo de idempotencia: reutilizamos la tabla StripeWebhookQueue con un
// prefijo "mp_" en el stripeId para no crear una tabla nueva (la columna
// es genérica en la práctica). Si en el futuro se quiere separar, crear
// MpWebhookQueue con la misma estructura.

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Audit 2026-05-17 04-P1-W3: redact MP payment IDs in logs.
// Ley 29733 PE — dataId+tenantSlug correlaciona con monto y email en panel MP.
// Mostramos solo últimos 4 chars del ID para trazabilidad sin permitir lookup
// inverso desde logs (atacante con read-only logs no puede consultar el pago).
function redactId(id: string): string {
  if (!id) return "";
  if (id.length <= 4) return "****";
  return `***${id.slice(-4)}`;
}

export async function POST(req: NextRequest) {
  // ── Leer query params (MP soporta dos formatos) ──────────
  // En Next.js 16 Route Handlers, req.nextUrl.searchParams es la API correcta.
  const searchParams = req.nextUrl.searchParams;

  // Formato Webhooks v2: type=payment&data.id=xxx
  // Formato IPN legacy:  topic=payment&id=xxx
  const type = searchParams.get("type") ?? searchParams.get("topic");
  const dataId =
    searchParams.get("data.id") ??
    searchParams.get("id") ??
    searchParams.get("data_id");

  // Enrutar por tipo de notificación
  // MP envía: "payment", "subscription_preapproval", "subscription_authorized_payment", etc.
  if (!type || !dataId) {
    return NextResponse.json({ received: true, skipped: true });
  }

  // ── Notificaciones de suscripción Preapproval ─────────────
  if (
    type === "subscription_preapproval" ||
    type === "subscription_authorized_payment"
  ) {
    return handleSubscriptionNotification({ type, dataId });
  }

  // Solo procesar notificaciones de pagos individuales
  if (type !== "payment") {
    // "merchant_order", "point", etc. — ignorar silenciosamente
    return NextResponse.json({ received: true, skipped: true });
  }

  // ── Verificar firma x-signature ──────────────────────────────
  // SECURITY 2026-05-05 (audit webhooks #1): fail-CLOSED. Antes, si
  // `MERCADOPAGO_WEBHOOK_SECRET` no estaba configurado, el webhook aceptaba
  // cualquier IP → atacante activa planes pagos enviando un dataId arbitrario.
  // Ahora: si falta el secret, retornamos 503 (servicio no disponible).
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("[MP Webhook] MERCADOPAGO_WEBHOOK_SECRET no configurado — fail-closed");
    return NextResponse.json(
      { error: "Webhook signing not configured" },
      { status: 503 },
    );
  }

  const xSignature = req.headers.get("x-signature") ?? "";
  const xRequestId = req.headers.get("x-request-id") ?? "";

  const valid = verifyMPWebhookSignature({
    xSignature,
    xRequestId,
    dataId,
    secret,
  });

  if (!valid) {
    logger.warn("[MP Webhook] Firma inválida", { dataId, xSignature: xSignature.slice(0, 30) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // SECURITY 2026-05-05 (audit webhooks #4): timestamp validation
  // (anti-replay). x-signature MP incluye `ts=<unix>` — rechazar si la firma
  // tiene más de 5 minutos. Si no viene `ts`, dejamos pasar (verifySignature
  // ya falló por arriba si es inválida).
  const tsMatch = xSignature.match(/ts=(\d+)/);
  if (tsMatch) {
    const sigSec = parseInt(tsMatch[1], 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (Number.isFinite(sigSec) && Math.abs(nowSec - sigSec) > 300) {
      logger.warn("[MP Webhook] Replay attack — timestamp >5min", { dataId, sigSec, nowSec });
      return NextResponse.json({ error: "Stale signature" }, { status: 400 });
    }
  }

  // ── Idempotencia atómica con lock por UNIQUE constraint ──
  // Antes: findUnique + upsert (no atómico) → 2 webhooks simultáneos
  // ambos veían null, ambos procesaban → doble activación / doble cobro.
  // Ahora: create con UNIQUE → si choca, otro webhook ya está procesando.
  const idempotencyKey = `mp_${dataId}`;
  try {
    await prisma.stripeWebhookQueue.create({
      data: {
        stripeId: idempotencyKey,
        eventType: "mp.payment.processing",
        payload: JSON.stringify({ dataId }),
        attempts: 1,
        lastError: "",
        nextRetryAt: new Date(),
        processedAt: null,
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation = otro webhook ya tomó el lock
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      logger.info("[MP Webhook] Pago duplicado o procesando, ignorado", { dataId });
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Otro error de DB — lo reportamos pero no bloqueamos (MP reintentará)
    logger.error("[MP Webhook] Error tomando lock idempotencia", {
      dataId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ received: true, error: "lock_failed" });
  }

  // ── Consultar el pago a la API de MP ─────────────────────
  let payment: Awaited<ReturnType<typeof getMercadoPagoPayment>>;
  try {
    payment = await getMercadoPagoPayment(dataId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[MP Webhook] Error al obtener pago de MP", { dataId, err: msg });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "billing",
      tags: { operation: "mp-webhook-payment-fetch" },
      extra: { dataId },
    });
    // Retornar 200 de todas formas: si retornamos 5xx MP reintentará indefinidamente
    return NextResponse.json({ received: true, error: "fetch_failed" });
  }

  const status = payment.status;            // "approved" | "rejected" | "pending" | ...
  const tenantSlug = payment.external_reference ?? "";
  const paymentMethodType = payment.payment_type_id ?? "mercadopago";

  logger.info("[MP Webhook] Pago recibido", {
    dataId: redactId(dataId),
    status,
    tenantSlug,
    paymentMethodType,
  });

  // ── Procesar solo pagos aprobados ─────────────────────────
  if (status === "approved") {
    if (!tenantSlug) {
      logger.warn("[MP Webhook] Pago aprobado sin external_reference", { dataId });
    } else {
      await processMPPaymentApproved({
        dataId,
        tenantSlug,
        paymentMethodType,
      }).catch((err) => {
        logger.error("[MP Webhook] Error procesando pago aprobado", {
          dataId,
          tenantSlug,
          err: err instanceof Error ? err.message : String(err),
        });
        reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
          module: "billing",
          tenantId: tenantSlug,
          tags: { operation: "mp-webhook-payment-approved" },
          extra: { dataId },
        });
      });
    }
  }

  // ── Marcar el lock como completado (procesado) ─
  // El INSERT inicial ya tomó el lock al inicio. Ahora actualizamos
  // con el status final y processedAt para que reintentos futuros del
  // mismo dataId vean el estado correcto.
  prisma.stripeWebhookQueue
    .update({
      where: { stripeId: idempotencyKey },
      data: {
        eventType: `mp.payment.${status}`,
        payload: JSON.stringify({ dataId, status, tenantSlug }),
        processedAt: status === "approved" ? new Date() : null,
      },
    })
    .catch((err) => {
      logger.warn("[MP Webhook] No se pudo actualizar el lock idempotencia", {
        dataId,
        err: err instanceof Error ? err.message : String(err),
      });
    });

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Lógica de activación del plan tras pago aprobado
// ─────────────────────────────────────────────────────────────────────────────

async function processMPPaymentApproved(opts: {
  dataId: string;
  tenantSlug: string;
  paymentMethodType: string;
}): Promise<void> {
  const { dataId, tenantSlug, paymentMethodType } = opts;

  // Buscar tenant por slug (external_reference siempre es el slug)
  const tenant = await prisma.tenant.findFirst({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, plan: true, stripeCurrentPeriodEnd: true },
  });

  if (!tenant) {
    logger.warn("[MP Webhook] Tenant no encontrado para pago", { tenantSlug, dataId });
    return;
  }

  // Inferir el plan a partir del monto podría ser frágil.
  // En su lugar, usamos la descripción del ítem que enviamos en la preferencia.
  // El external_reference solo identifica al tenant; el plan viene del
  // campo `description` del ítem o de una tabla auxiliar.
  //
  // Estrategia robusta: guardar el plan en una tabla MpPendingPlan al crear
  // la preferencia. Por ahora usamos el mismo importe → plan mapping.
  // TODO: cuando se agregue tabla mp_pending_plans, leer de ahí.
  //
  // Mientras tanto: leer el mapa inverso por precio desde MP_PLAN_ITEMS.
  const newPlan = await resolvePlanFromPaymentId(dataId);

  if (!newPlan || newPlan === "free") {
    logger.warn("[MP Webhook] No se pudo resolver el plan del pago", { dataId, tenantSlug });
    return;
  }

  // Validar que sea un plan superior al actual (evitar downgrade accidental)
  const currentIdx = PLAN_ORDER.indexOf(tenant.plan as PlanId);
  const newIdx = PLAN_ORDER.indexOf(newPlan);
  if (newIdx <= 0) {
    logger.warn("[MP Webhook] Plan resuelto inválido", { newPlan, dataId });
    return;
  }

  // F2-FIX: extender desde el último período conocido, no desde Date.now().
  // Si el webhook llega tarde y el período anterior aún está vigente, extendemos
  // desde ese punto (evita rebobinar el reloj). Si ya venció, partimos desde now.
  const lastPeriodEnd = tenant.stripeCurrentPeriodEnd
    ? new Date(tenant.stripeCurrentPeriodEnd)
    : null;
  const baseDate =
    lastPeriodEnd && lastPeriodEnd.getTime() > Date.now() ? lastPeriodEnd : new Date();
  const periodEnd = new Date(baseDate.getTime() + THIRTY_DAYS_MS);

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      plan: newPlan,
      mpPaymentMethod: paymentMethodType,
      stripeCurrentPeriodEnd: periodEnd,  // Reutilizamos el campo de fecha de vencimiento
      cancelAtPeriodEnd: false,
    },
  });

  // Log de actividad (fire-and-forget)
  prisma.activityLog
    .create({
      data: {
        action: "subscription_created",
        entity: "tenant",
        entityId: tenantSlug,
        detail: `Plan activado vía Mercado Pago: ${newPlan} (pago ${dataId})${currentIdx >= newIdx ? " — sin cambio de nivel" : ""}`,
        user: "mp-webhook",
        tenantId: tenantSlug,
      },
    })
    .catch((err) => logger.warn("[billing] op failed", { err: String(err) }));

  logger.info("[MP Webhook] Plan actualizado", {
    tenantSlug,
    oldPlan: tenant.plan,
    newPlan,
    paymentRef: redactId(dataId),
    periodEnd: periodEnd.toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Manejo de notificaciones de suscripción Preapproval
// ─────────────────────────────────────────────────────────────────────────────

async function handleSubscriptionNotification(opts: {
  type: string;
  dataId: string;
}): Promise<NextResponse> {
  const { type, dataId } = opts;

  // ── Idempotencia atómica con UNIQUE constraint ──────────
  // SECURITY 2026-05-05 (audit webhooks #7): antes findUnique + upsert
  // posterior NO era atómico — dos eventos paralelos podían renovar el
  // período dos veces. Ahora `create` con UNIQUE = atómico (P2002 = lock
  // tomado).
  const idempotencyKey = `mp_sub_${dataId}`;
  try {
    await prisma.stripeWebhookQueue.create({
      data: {
        stripeId: idempotencyKey,
        eventType: `mp.subscription.${type}.processing`,
        payload: JSON.stringify({ dataId, type }),
        attempts: 1,
        lastError: "",
        nextRetryAt: new Date(),
        processedAt: null,
      },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      logger.info("[MP Webhook] Suscripción duplicada o procesando, ignorada", { dataId, type });
      return NextResponse.json({ received: true, duplicate: true });
    }
    logger.error("[MP Webhook] Error tomando lock de idempotencia (sub)", {
      dataId, err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ received: true, error: "lock_failed" });
  }

  // ── Obtener estado de la suscripción desde MP ────────────
  // Para subscription_preapproval: dataId es el preapprovalId
  // Para subscription_authorized_payment: dataId es el ID del pago autorizado;
  // necesitamos consultar el endpoint de authorized_payment para obtener el preapprovalId.
  let preapprovalId: string | null = null;
  let authorizedPaymentStatus: string | null = null;

  if (type === "subscription_preapproval") {
    preapprovalId = dataId;
  } else if (type === "subscription_authorized_payment") {
    // Audit 2026-05-17 04-P2-W6: MERCADOPAGO_ACCESS_TOKEN fallback ""
    // mandaba "Bearer " vacío al API → response 401 silencioso interpretable
    // como network failure. Mejor fail-fast: si la var falta, retornar 503
    // explícito para que MP reintente cuando esté configurada.
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpToken) {
      logger.error("[MP Webhook] MERCADOPAGO_ACCESS_TOKEN missing — cannot resolve preapprovalId", {
        dataId: redactId(dataId),
        type,
      });
      return NextResponse.json(
        { error: "mp_token_missing", received: false },
        { status: 503 },
      );
    }
    // GET /preapproval_payment/{id} para resolver el preapprovalId
    try {
      const res = await fetch(
        `https://api.mercadopago.com/preapproval_payment/${dataId}`,
        {
          headers: {
            Authorization: `Bearer ${mpToken}`,
          },
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          preapproval_id?: string;
          status?: string;
        };
        preapprovalId = data.preapproval_id ?? null;
        authorizedPaymentStatus = data.status ?? null;
      }
    } catch (err) {
      logger.error("[MP Webhook] Error consultando authorized_payment", {
        dataId,
        err: err instanceof Error ? err.message : String(err),
      });
      reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
        module: "billing",
        tags: { operation: "mp-webhook-preapproval-resolution" },
        extra: { dataId, type },
      });
    }
  }

  if (!preapprovalId) {
    logger.warn("[MP Webhook] No se pudo resolver preapprovalId", { dataId, type });
    return NextResponse.json({ received: true, error: "preapproval_id_not_found" });
  }

  // ── Buscar tenant por mpSubscriptionId ───────────────────
  const tenant = await prisma.tenant.findFirst({
    where: { mpSubscriptionId: preapprovalId },
    select: {
      id: true,
      slug: true,
      plan: true,
      mpSubscriptionId: true,
      stripeCurrentPeriodEnd: true,
    },
  });

  if (!tenant) {
    logger.warn("[MP Webhook] Tenant no encontrado para preapprovalId", {
      preapprovalId,
      type,
    });
    // El lock ya fue creado arriba — solo marcar como processed.
    prisma.stripeWebhookQueue
      .update({
        where: { stripeId: idempotencyKey },
        data: { processedAt: new Date(), lastError: "tenant_not_found" },
      })
      .catch((err) => logger.warn("[billing] op failed", { err: String(err) }));
    return NextResponse.json({ received: true });
  }

  // ── subscription_preapproval: suscripción creada o actualizada ──
  if (type === "subscription_preapproval") {
    try {
      const subStatus = await getMPSubscriptionStatus(preapprovalId);
      logger.info("[MP Webhook] Estado de suscripción Preapproval", {
        tenantSlug: tenant.slug,
        preapprovalId,
        status: subStatus.status,
      });

      // "authorized" = usuario autorizó el débito; activar el plan en el primer pago.
      // El plan se activa definitivamente en subscription_authorized_payment.
    } catch (err) {
      logger.error("[MP Webhook] Error consultando estado de Preapproval", {
        preapprovalId,
        err: err instanceof Error ? err.message : String(err),
      });
      reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
        module: "billing",
        tenantId: tenant.slug,
        tags: { operation: "mp-webhook-subscription-status" },
        extra: { preapprovalId },
      });
    }
  }

  // ── subscription_authorized_payment: cobro mensual exitoso ──
  if (type === "subscription_authorized_payment" && authorizedPaymentStatus === "approved") {
    // F2-FIX: extender desde último período vigente para evitar rebobinar reloj
    // en caso de webhook tardío o duplicado que pase la ventana de idempotencia.
    const lastPeriodEndSub = tenant.stripeCurrentPeriodEnd
      ? new Date(tenant.stripeCurrentPeriodEnd)
      : null;
    const baseDateSub =
      lastPeriodEndSub && lastPeriodEndSub.getTime() > Date.now()
        ? lastPeriodEndSub
        : new Date();
    const periodEnd = new Date(baseDateSub.getTime() + THIRTY_DAYS_MS);

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        stripeCurrentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    logger.info("[MP Webhook] Período de suscripción renovado", {
      tenantSlug: tenant.slug,
      plan: tenant.plan,
      periodEnd: periodEnd.toISOString(),
    });

    // Log de actividad (fire-and-forget)
    prisma.activityLog
      .create({
        data: {
          action: "subscription_renewed",
          entity: "tenant",
          entityId: tenant.slug,
          detail: `Pago mensual automático aprobado (authorized_payment: ${dataId}). Período extendido a ${periodEnd.toISOString()}.`,
          user: "mp-webhook",
          tenantId: tenant.slug,
        },
      })
      .catch((err) => logger.warn("[billing] op failed", { err: String(err) }));
  }

  // ── Marcar processedAt (lock ya creado arriba) ─────────────
  prisma.stripeWebhookQueue
    .update({
      where: { stripeId: idempotencyKey },
      data: {
        processedAt: new Date(),
        eventType: `mp.${type}`,
      },
    })
    .catch((err) => logger.warn("[billing] op failed", { err: String(err) }));

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Resuelve el plan a partir del paymentId consultando de nuevo la API de MP
// para leer el description del ítem (ya tenemos el objeto en memoria arriba,
// pero esta función es el punto de extensión si se agrega tabla auxiliar).
// ─────────────────────────────────────────────────────────────────────────────
async function resolvePlanFromPaymentId(paymentId: string): Promise<PlanId | null> {
  // ── Fuente 1 (más confiable): tabla MpPendingPlan ──────
  // La preferencia se guardó al crear el checkout en mp-checkout/route.ts
  const payment = await getMercadoPagoPayment(paymentId);
  const externalRef = payment.external_reference ?? "";

  if (externalRef) {
    const pending = await prisma.mpPendingPlan.findFirst({
      where: { externalRef, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: { id: true, plan: true },
    });

    if (pending) {
      // Marcar como resuelto
      prisma.mpPendingPlan
        .update({
          where: { id: pending.id },
          data: { status: "approved", resolvedAt: new Date() },
        })
        .catch((err) => logger.warn("[billing] op failed", { err: String(err) }));

      return pending.plan as PlanId;
    }
  }

  // ── Fuente 2 (fallback): item ID de la preferencia ─────
  const itemId: string =
    (payment as { additional_info?: { items?: Array<{ id?: string }> } })
      ?.additional_info?.items?.[0]?.id ?? "";

  if (itemId.startsWith("plan-")) {
    const planId = itemId.replace("plan-", "") as PlanId;
    if (["pro", "business", "enterprise"].includes(planId)) {
      return planId;
    }
  }

  // ── Fuente 3 (último recurso): inferir por monto ───────
  const { MP_PLAN_ITEMS } = await import("@/lib/mercadopago");
  const amount = payment.transaction_amount ?? 0;
  for (const [planId, item] of Object.entries(MP_PLAN_ITEMS)) {
    if (item && item.unit_price === amount) {
      return planId as PlanId;
    }
  }

  return null;
}
