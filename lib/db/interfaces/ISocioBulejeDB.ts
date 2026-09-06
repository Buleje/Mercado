/**
 * lib/db/interfaces/ISocioBulejeDB.ts
 *
 * Formal interface del DB class del programa Socio Buleje (ADR-078).
 *
 * Todas las funciones reciben `tenantId` como primer parámetro (CLAUDE.md #3).
 */

/** Plan canónico tal como está en DB. */
export type SocioPlan = "monthly" | "annual";
/** Alias UI/input (admite "yearly" legacy). */
export type SocioPlanInput = SocioPlan | "yearly";
export type SocioStatus = "trial" | "active" | "past_due" | "paused" | "cancelled";
export type BillingCycleStatus = "pending" | "paid" | "failed" | "waived";
export type CashbackEntryType = "earned" | "redeemed" | "expired" | "bonus" | "adjustment";

export interface SocioMembershipRow {
  id: string;
  tenantId: string;
  userId: string;
  plan: SocioPlan;
  status: SocioStatus;
  startedAt: string; // ISO
  currentPeriodEnd: string; // ISO
  trialEndsAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SocioBillingCycleRow {
  id: string;
  membershipId: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  amountSoles: number;
  status: BillingCycleStatus;
  paidAt: string | null;
  invoiceId: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface SocioCashbackEntryRow {
  id: string;
  membershipId: string;
  tenantId: string;
  userId: string;
  orderId: string | null;
  type: CashbackEntryType;
  amountSoles: number;
  description: string;
  balanceAfter: number;
  createdAt: string;
}

export interface SocioMembershipWithBalance extends SocioMembershipRow {
  cashbackBalance: number;
  totalEarned: number;
  totalRedeemed: number;
}

export interface SocioExclusiveOffer {
  productId: string;
  name: string;
  image: string | null;
  category: string;
  regularPrice: number;
  socioPrice: number;
  unit: string;
  storeName: string;
}

export interface SocioAdminStats {
  tenantId: string;
  totalMembers: number;
  activeMembers: number;
  trialMembers: number;
  pastDueMembers: number;
  cancelledMembers: number;
  mrrSoles: number; // MRR del mes
  churnRate30d: number; // 0..1
  avgCashbackBalanceSoles: number;
  outstandingCashbackLiabilitySoles: number;
  lastCycleSuccessRate: number; // 0..1
}

export interface ISocioBulejeDB {
  getMembership(
    tenantId: string,
    userId: string,
  ): Promise<SocioMembershipWithBalance | null>;

  subscribe(
    tenantId: string,
    userId: string,
    plan: SocioPlanInput,
  ): Promise<SocioMembershipWithBalance>;

  cancel(
    tenantId: string,
    userId: string,
    reason?: string,
    immediate?: boolean,
  ): Promise<SocioMembershipWithBalance | null>;

  resume(
    tenantId: string,
    userId: string,
  ): Promise<SocioMembershipWithBalance | null>;

  extendPeriod(
    tenantId: string,
    userId: string,
    months: number,
  ): Promise<SocioMembershipWithBalance | null>;

  earnCashback(
    tenantId: string,
    userId: string,
    orderId: string | null,
    amountSoles: number,
    description: string,
  ): Promise<SocioCashbackEntryRow>;

  redeemCashback(
    tenantId: string,
    userId: string,
    orderId: string | null,
    amountSoles: number,
  ): Promise<SocioCashbackEntryRow>;

  getCashbackHistory(
    tenantId: string,
    userId: string,
    limit?: number,
  ): Promise<SocioCashbackEntryRow[]>;

  getCashbackBalance(
    tenantId: string,
    userId: string,
  ): Promise<number>;

  getExclusiveOffers(
    tenantId: string,
    limit?: number,
  ): Promise<SocioExclusiveOffer[]>;

  getStats(tenantId: string): Promise<SocioAdminStats>;

  renewCycleIfDue(
    tenantId: string,
    membershipId: string,
  ): Promise<SocioBillingCycleRow | null>;

  listMembers(
    tenantId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ members: SocioMembershipWithBalance[]; total: number }>;
}

// ── Constantes dominio (matchear con lib/validators/socio-buleje.ts) ──
export const SOCIO_PLAN_PRICES: Record<SocioPlan, number> = {
  monthly: 19,
  annual: 189,
};

export const SOCIO_TRIAL_DAYS = 30;
export const SOCIO_GRACE_PERIOD_DAYS = 7; // past_due antes de cancelled
export const SOCIO_CASHBACK_PCT = 0.05;
