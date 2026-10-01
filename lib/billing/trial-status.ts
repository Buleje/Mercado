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
  /**
   * Flag de tenant deshabilitado — lo setea Stripe en
   * `invoice.payment_failed` ≥ 3 (ver lib/db/tenant-billing.db.ts).
   * Audit project-wide 2026-05-19 (QA P1 #3): si `active=false`, el
   * tenant entra en read-only inmediato sin depender de trialEndsAt.
   */
  active?: boolean | null;
}

export type TrialStatus =
  /** Trial activo, queda tiempo. */
  | { kind: "trial_active"; daysRemaining: number; endsAt: Date }
  /** Trial expirado, sin plan pagado. Sistema entra en read-only. */
  | { kind: "trial_expired"; expiredSinceDays: number }
  /**
   * Plan pagado activo. `manual` = plan otorgado por el superadmin sin pasarela
   * (socio, canje, cobro por transferencia o Yape): no hay suscripción que
   * renovar ni prueba que vencer.
   */
  | { kind: "paid"; provider: "stripe" | "mp" | "manual" }
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
  // F5-FIX: exigir también stripeCurrentPeriodEnd > now para MP, igual que Stripe.
  // El campo stripeCurrentPeriodEnd es el único campo de fecha de período que existe
  // en el schema para ambos proveedores (el webhook MP lo actualiza en el mismo campo).
  // Sin este guard, si mp-subscribe guarda mpSubscriptionId antes de que MP confirme
  // el cobro y el tenant tiene plan !== "free" por otra razón, clasificaría como paid.
  // Con el guard: solo paid si el período no ha vencido.
  if (t.mpSubscriptionId && t.plan !== "free") {
    const mpPeriodEnd = t.stripeCurrentPeriodEnd
      ? new Date(t.stripeCurrentPeriodEnd).getTime()
      : 0;
    if (mpPeriodEnd > now) {
      return { kind: "paid", provider: "mp" };
    }
    // Período MP vencido sin renovación confirmada — caer a trial check.
  }
  // 3. Plan pago otorgado a mano, sin pasarela y sin prueba encima.
  //
  // `trialEndsAt == null` es la parte que hace esto seguro y NO es un detalle:
  // el alta self-serve (`app/api/onboarding`) da período de prueba a CUALQUIER
  // plan que el usuario elija, enterprise incluido. Si acá bastara con
  // `plan !== "free"`, cualquiera que se registrara eligiendo enterprise se
  // quedaría con plan pago eterno y gratis. Sólo el superadmin limpia
  // `trialEndsAt` al otorgar un plan (ver PATCH /api/superadmin/tenants/[slug]),
  // así que la ausencia de prueba es la marca de "esto se otorgó a mano".
  if (t.plan && t.plan !== "free" && !t.trialEndsAt
      && !t.stripeSubscriptionId && !t.mpSubscriptionId) {
    return { kind: "paid", provider: "manual" };
  }

  // 4. Plan free + trial vigente.
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
  // 5. Sin trial ni plan — tenant legacy.
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
  // Audit 2026-05-19 (QA P1 #3): Stripe puede setear `active=false` via
  // `invoice.payment_failed` >= 3. Antes este flag se persistia en DB pero
  // no afectaba el read-only mode para tenants sin trialEndsAt -> revenue
  // leak: tenant suspendido seguia tomando pedidos.
  if (t.active === false) return true;
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
