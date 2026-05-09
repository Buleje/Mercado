import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { PLANS, type PlanId } from "@/lib/plans";

// ─── Tipos Preapproval ────────────────────────────────
export interface CreateMPSubscriptionOptions {
  tenantSlug: string;
  plan: PlanId;
  payerEmail: string;
  backUrl: string;
}

export interface MPSubscriptionResult {
  init_point: string;
  preapprovalId: string;
}

export interface MPSubscriptionStatus {
  status: string;
  nextPaymentDate: Date | null;
}

// ─── Client (singleton) ──────────────────────────────────
// MERCADOPAGO_ACCESS_TOKEN — server-side only, NUNCA exponer al cliente.
// MERCADOPAGO_PUBLIC_KEY   — segura para el frontend (solo lectura).
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";

export const mpClient = new MercadoPagoConfig({
  accessToken,
  options: { timeout: 5000 },
});

// ─── Mapeo planId → ítem con precio en PEN ───────────────
// Los precios están en Soles (PEN). Actualizar según el plan vigente.
export const MP_PLAN_ITEMS: Partial<Record<PlanId, {
  title: string;
  unit_price: number;
  currency_id: "PEN";
}>> = {
  pro: {
    title: `Suscripción ${PLANS.pro.name} — Buleje`,
    unit_price: PLANS.pro.priceMonthly,     // S/49
    currency_id: "PEN",
  },
  business: {
    title: `Suscripción ${PLANS.business.name} — Buleje`,
    unit_price: PLANS.business.priceMonthly, // S/149
    currency_id: "PEN",
  },
  enterprise: {
    title: `Suscripción ${PLANS.enterprise.name} — Buleje`,
    unit_price: PLANS.enterprise.priceMonthly, // S/299 (canonical — ver lib/plans.ts)
    currency_id: "PEN",
  },
};

// ─── Tipos ───────────────────────────────────────────────

export interface CreateMPPreferenceOptions {
  plan: PlanId;
  tenantSlug: string;
  payerEmail: string;
  payerName: string;
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
}

export interface MPPreferenceResult {
  id: string;
  init_point: string;       // URL de checkout de producción
  sandbox_init_point: string;
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Crea una preferencia de pago en Mercado Pago (equivalente a Stripe Checkout Session).
 * external_reference = tenantSlug para rastreo en el webhook IPN.
 */
export async function createMercadoPagoPreference(
  opts: CreateMPPreferenceOptions,
): Promise<MPPreferenceResult> {
  const item = MP_PLAN_ITEMS[opts.plan];
  if (!item) {
    throw new Error(`Plan "${opts.plan}" no tiene ítem de Mercado Pago configurado`);
  }

  const preference = new Preference(mpClient);

  const result = await preference.create({
    body: {
      items: [
        {
          id: `plan-${opts.plan}`,
          title: item.title,
          quantity: 1,
          unit_price: item.unit_price,
          currency_id: item.currency_id,
          category_id: "services",
        },
      ],
      payer: {
        email: opts.payerEmail,
        name: opts.payerName,
      },
      back_urls: {
        success: opts.successUrl,
        failure: opts.failureUrl,
        pending: opts.pendingUrl,
      },
      auto_return: "approved",
      // external_reference identifica al tenant en el webhook IPN
      external_reference: opts.tenantSlug,
      statement_descriptor: "BULEJE",
      // Habilitar métodos de pago locales peruanos
      payment_methods: {
        excluded_payment_types: [],
        installments: 1,
      },
      expires: false,
      // Notificación IPN — MP hará POST a este endpoint con el payment id
      notification_url: `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/billing/mp-webhook`,
    },
  });

  return {
    id: result.id ?? "",
    init_point: result.init_point ?? "",
    sandbox_init_point: result.sandbox_init_point ?? "",
  };
}

/**
 * Obtiene el detalle de un pago de Mercado Pago por ID.
 * Usado en el webhook para leer el estado y el external_reference.
 */
export async function getMercadoPagoPayment(paymentId: string | number) {
  const payment = new Payment(mpClient);
  return payment.get({ id: String(paymentId) });
}

/**
 * Verifica la firma del webhook de Mercado Pago.
 *
 * MP envía el header x-signature con formato:
 *   ts=<timestamp>,v1=<hmac-sha256>
 *
 * La firma se calcula sobre: "id:<dataId>;request-id:<requestId>;ts:<ts>;"
 * Ref: https://www.mercadopago.com.pe/developers/es/docs/your-integrations/notifications/webhooks
 */
export function verifyMPWebhookSignature(opts: {
  xSignature: string;
  xRequestId: string;
  dataId: string;
  secret: string;
}): boolean {
  const { xSignature, xRequestId, dataId, secret } = opts;

  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    }),
  );

  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  // Round 22 P1 (Security Pentester): freshness check — sin esto el replay
  // window era ilimitado. Si atacante captura un webhook puede replay días
  // después y mutar órdenes. MP envía ts en milisegundos UNIX. Tolerance 5min
  // = mismo valor que Stripe usa por default.
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || tsNum <= 0) return false;
  const ageMs = Math.abs(Date.now() - tsNum);
  if (ageMs > 5 * 60 * 1000) {
    // Webhook replay attempt detectado — fallar silencioso (no leak info al atacante).
    return false;
  }

  // El manifest sigue exactamente el formato documentado por MP
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  // Node ≥ 18: crypto disponible de forma nativa
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto") as typeof import("crypto");
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  // Comparación en tiempo constante para evitar timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHmac, "hex"),
      Buffer.from(v1, "hex"),
    );
  } catch {
    return false;
  }
}

// ─── Preapproval (suscripciones recurrentes) ─────────

const MP_API_BASE = "https://api.mercadopago.com";

/**
 * Crea una suscripción recurrente mensual en Mercado Pago usando la API
 * Preapproval. El pagador es redirigido a init_point para autorizar el débito.
 *
 * Ref: https://www.mercadopago.com.pe/developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan
 */
export async function createMPSubscription(
  opts: CreateMPSubscriptionOptions,
): Promise<MPSubscriptionResult> {
  const item = MP_PLAN_ITEMS[opts.plan];
  if (!item) {
    throw new Error(`Plan "${opts.plan}" no tiene ítem de Mercado Pago configurado`);
  }

  const body = {
    reason: `${item.title}`,
    external_reference: opts.tenantSlug,
    payer_email: opts.payerEmail,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: item.unit_price,
      currency_id: "PEN",
    },
    back_url: opts.backUrl,
    status: "pending",
  };

  const res = await fetch(`${MP_API_BASE}/preapproval`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`MP Preapproval crear suscripción ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { id: string; init_point: string };
  return {
    init_point: data.init_point,
    preapprovalId: data.id,
  };
}

/**
 * Cancela una suscripción Preapproval en Mercado Pago.
 * El cambio es inmediato en MP; el acceso al plan se mantiene hasta
 * el fin del período ya pagado (cancelAtPeriodEnd en DB).
 */
export async function cancelMPSubscription(preapprovalId: string): Promise<void> {
  const res = await fetch(`${MP_API_BASE}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status: "cancelled" }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`MP Preapproval cancelar suscripción ${res.status}: ${errText}`);
  }
}

/**
 * Consulta el estado actual de una suscripción Preapproval.
 * Retorna status ("authorized" | "paused" | "cancelled" | "pending" | ...) y
 * la próxima fecha de cobro si está activa.
 */
export async function getMPSubscriptionStatus(
  preapprovalId: string,
): Promise<MPSubscriptionStatus> {
  const res = await fetch(`${MP_API_BASE}/preapproval/${preapprovalId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`MP Preapproval obtener estado ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    status: string;
    next_payment_date?: string | null;
  };

  return {
    status: data.status,
    nextPaymentDate: data.next_payment_date ? new Date(data.next_payment_date) : null,
  };
}

export { PLANS };
