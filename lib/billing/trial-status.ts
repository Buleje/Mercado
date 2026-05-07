/**
 * lib/billing/trial-status.ts
 *
 * Single source of truth para determinar si un tenant está en trial,
 * trial expirado (modo read-only), o con plan pagado activo.
 *
 * Esta utility funciona SIN schema migration adicional — usa los campos
 * que ya existen en `Tenant`: `plan`, `trialEndsAt`, `stripeSubscriptionId`,
 * `mpSubscriptionId`.
 *
 * Cuando ADR-084 entre en vigor con el campo `suspendedAt`, esta función se
 * actualiza para considerarlo también (sin romper consumidores).
 *
 * Ver ADR-084 — trial-suspension-mode.
 */

export interface TenantSubscriptionFields {
  plan: string;
  trialEndsAt: Date | null;
  stripeSubscriptionId: string | null;
  /** Fin del período actual de Stripe — para detectar suscripciones huérfanas. */
  stripeCurrentPeriodEnd?: Date | null;
  mpSubscriptionId: string | null;
  /** Reservado para ADR-084 cuando la migración corra. Hoy: undefined. */
  suspendedAt?: Date | null;
}

export type TrialStatus =
  /** Trial activo, queda tiempo. */
  | { kind: "trial_active"; daysRemaining: number; endsAt: Date }
  /** Trial expirado, sin plan pagado. Sistema entra en read-only. */
  | { kind: "trial_expired"; expiredSinceDays: number }
  /** Plan pagado activo (Stripe o MP). */
  | { kind: "paid"; provider: "stripe" | "mp" }
  /** Tenant sin trial registrado y sin plan — caso edge (legacy). */
  | { kind: "unknown" };

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Devuelve el estado de trial/suscripción de un tenant.
 * Determinístico — solo depende de los campos pasados + Date.now().
 */
export function getTrialStatus(t: TenantSubscriptionFields): TrialStatus {
  const now = Date.now();
  // 1. Plan pagado vía Stripe.
  // SECURITY 2026-05-06 (pentest billing #3): exigir `stripeCurrentPeriodEnd
  // > now`. Antes, si Stripe no enviaba `customer.subscription.deleted` (queue
  // stuck), el tenant quedaba con plan paid eterno. Ahora si el período
  // expiró, downgrade automático aunque el webhook no haya llegado.
  if (t.stripeSubscriptionId && t.plan !== "free") {
    const periodEnd = t.stripeCurrentPeriodEnd ? new Date(t.stripeCurrentPeriodEnd).getTime() : 0;
    if (periodEnd > now) {
      return { kind: "paid", provider: "stripe" };
    }
    // Período vencido sin renovación — caer a trial expirado.
  }
  // 2. Plan pagado vía Mercado Pago.
  if (t.mpSubscriptionId && t.plan !== "free") {
    return { kind: "paid", provider: "mp" };
  }
  // 3. Plan free + trial vigente.
  if (t.trialEndsAt) {
    const target = new Date(t.trialEndsAt).getTime();
    const now = Date.now();
    const diffMs = target - now;
    if (diffMs > 0) {
      return {
        kind: "trial_active",
        daysRemaining: Math.ceil(diffMs / MS_PER_DAY),
        endsAt: new Date(target),
      };
    }
    return {
      kind: "trial_expired",
      expiredSinceDays: Math.floor((now - target) / MS_PER_DAY),
    };
  }
  // 4. Sin trial ni plan — tenant legacy.
  return { kind: "unknown" };
}

/**
 * `true` si el tenant NO puede operar (modo read-only).
 * - trial_expired sin plan → true
 * - paid → false
 * - trial_active → false
 * - unknown → false (fail-open para no bloquear tenants legacy)
 *
 * Cuando ADR-084 active `suspendedAt`, este helper también devolverá true
 * cuando suspendedAt no sea null.
 */
export function isReadOnlyMode(t: TenantSubscriptionFields): boolean {
  if (t.suspendedAt) return true;
  return getTrialStatus(t).kind === "trial_expired";
}

/**
 * `true` si el tenant debe quedar oculto del marketplace público y storefronts.
 * Hoy = isReadOnlyMode. Separado para que en el futuro pueda tener reglas
 * distintas (ej: trial expirado oculto, pero suspended por payment_failed
 * podría seguir visible con badge "pago pendiente").
 */
export function isHiddenFromPublic(t: TenantSubscriptionFields): boolean {
  return isReadOnlyMode(t);
}
