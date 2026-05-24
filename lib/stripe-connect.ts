/**
 * lib/stripe-connect.ts
 * Stripe Connect — split payments para el marketplace de Buleje.
 * Usa la misma instancia de Stripe definida en lib/stripe.ts para no duplicar el cliente.
 */

import { stripe } from "@/lib/stripe";
import { logger } from "@/lib/logger";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ConnectedAccountResult {
  accountId: string;
  onboardingUrl: string;
}

export interface SplitPaymentResult {
  paymentIntentId: string;
  clientSecret: string;
}

// ── Onboarding ────────────────────────────────────────────────────────────────

/**
 * Crea una cuenta Express de Stripe Connect para una tienda del marketplace.
 * Retorna el accountId (a guardar en BD) y la URL de onboarding que se le muestra al comerciante.
 */
export async function createConnectedAccount(params: {
  tenantId: string;
  email: string;
  businessName: string;
  country?: string;
}): Promise<ConnectedAccountResult> {
  logger.info("[StripeConnect] Creando cuenta conectada", {
    tenantId: params.tenantId,
    email: params.email,
  });

  const account = await stripe.accounts.create({
    type: "express",
    country: params.country ?? "PE",
    email: params.email,
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { tenantId: params.tenantId, businessName: params.businessName },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_BASE_URL}/admin?tab=marketplace`,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/admin?tab=marketplace&stripe=connected`,
    type: "account_onboarding",
  });

  logger.info("[StripeConnect] Cuenta creada", {
    accountId: account.id,
    tenantId: params.tenantId,
  });

  return { accountId: account.id, onboardingUrl: accountLink.url };
}

// ── Split payments ─────────────────────────────────────────────────────────────

/**
 * Crea un PaymentIntent con split automático:
 * - El monto total llega a la cuenta conectada de la tienda.
 * - La plataforma retiene `commissionRate`% como application_fee.
 *
 * @param amount         Monto en céntimos (S/ 10.00 → 1000)
 * @param commissionRate Porcentaje (5 = 5%). NO en decimal (0.05 → comisión 100× menor).
 */
export async function createSplitPayment(params: {
  amount: number;
  currency?: string;
  storeStripeAccountId: string;
  commissionRate: number;
  orderId: string;
  customerEmail?: string;
}): Promise<SplitPaymentResult> {
  // P0-6 fix (audit 2026-05-23): guardrails defensivos contra dos bugs de unidades.
  //
  // 1) commissionRate debe ser PORCENTAJE entero/decimal (5, 5.5, 12.5) — NO 0.05.
  //    Si alguien pasa 0.05 pensando "5%", la fee resultante sería 100× menor
  //    y se pierde plata por orden indefinidamente.
  // 2) amount debe estar en CÉNTIMOS (entero >= 1). Si alguien pasa 10.5 (PEN),
  //    Stripe lanza 400 y los redondeos quedan rotos.
  //
  // Estas son guardas duras (throw) — fail-loud > perder dinero silencioso.
  if (!Number.isFinite(params.amount) || !Number.isInteger(params.amount) || params.amount < 1) {
    throw new Error(
      `[StripeConnect] amount inválido (${params.amount}) — debe ser entero en céntimos (>= 1).`,
    );
  }
  if (!Number.isFinite(params.commissionRate) || params.commissionRate < 0 || params.commissionRate > 100) {
    throw new Error(
      `[StripeConnect] commissionRate inválido (${params.commissionRate}) — debe ser % en [0, 100], no decimal 0.05.`,
    );
  }
  if (params.commissionRate > 0 && params.commissionRate < 1) {
    // Heurística: 5% se escribe "5", no "0.05". Si llega 0<r<1, casi seguro
    // es el bug de unidades — abortar antes de cobrar 100× menos.
    throw new Error(
      `[StripeConnect] commissionRate=${params.commissionRate} sospechoso — ` +
      `el valor esperado es porcentaje (5 = 5%), no decimal (0.05). Aborta para no perder dinero.`,
    );
  }

  // amount en céntimos × rate% / 100 → fee en céntimos. Ej: 1000 * 5 / 100 = 50 (= S/0.50).
  const commission = Math.round((params.amount * params.commissionRate) / 100);

  logger.info("[StripeConnect] Creando split payment", {
    orderId: params.orderId,
    amount: params.amount,
    commissionRate: params.commissionRate,
    commission,
    destination: params.storeStripeAccountId,
  });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency ?? "pen",
    application_fee_amount: commission,
    transfer_data: { destination: params.storeStripeAccountId },
    metadata: { orderId: params.orderId },
    ...(params.customerEmail && {
      receipt_email: params.customerEmail,
    }),
  });

  return {
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret!,
  };
}

// ── Balance y payouts ──────────────────────────────────────────────────────────

/**
 * Obtiene el balance de una cuenta conectada.
 * Útil para mostrar en el panel de la tienda cuánto tiene disponible.
 */
export async function getConnectedAccountBalance(accountId: string) {
  return stripe.balance.retrieve({}, { stripeAccount: accountId });
}

/**
 * Verifica el estado de onboarding de una cuenta conectada.
 * Retorna si ya puede cobrar y recibir pagos.
 */
export async function getConnectedAccountStatus(accountId: string): Promise<{
  isActive: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}> {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    isActive: account.charges_enabled && account.payouts_enabled,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

/**
 * Crea un payout manual hacia la cuenta bancaria de la cuenta conectada.
 * Normalmente Stripe lo hace automático; esto es para pagos manuales.
 */
export async function createPayout(
  accountId: string,
  amount: number,
): Promise<{ id: string; status: string }> {
  const payout = await stripe.payouts.create(
    { amount, currency: "pen" },
    { stripeAccount: accountId },
  );
  return { id: payout.id, status: payout.status };
}
