import "server-only";
/**
 * lib/db/socio-buleje.db.ts — Mock DB class para Socio Buleje.
 *
 * MVP demo: datos in-memory + mocks. No persiste multi-sesión.
 *
 * CLAUDE.md compliance:
 *   #1 — toda mutación a membership pasa por esta clase (no Prisma directo)
 *   #3 — tenantId SIEMPRE es el primer parámetro
 *   #5 — en prod: invalidateByPrefix(`socio:${tenantId}:${userId}`) tras writes
 *   #6 — saldos y ahorros se calculan server-side
 *
 * Roadmap prod (ADR pendiente):
 *   - Tabla `SocioMembership` en Prisma (userId, tenantId, plan, status, dates)
 *   - Integración Stripe subscriptions para cobros
 *   - Tabla `SocioCashbackTransaction` append-only ledger (similar a loyalty)
 *   - Cron `/api/cron/socio-renewals` para renovaciones y expiraciones
 */

import {
  MOCK_SOCIO_MEMBERSHIP,
  MOCK_CASHBACK_HISTORY,
  MOCK_MONTHLY_SAVINGS,
  MOCK_EXCLUSIVE_OFFERS,
  type MockSocioMembership,
  type MockCashbackTransaction,
  type MockMonthlySaving,
  type MockExclusiveOffer,
} from "@/lib/mocks/socio-buleje.mock";
import type { SocioPlan } from "@/lib/validators/socio-buleje";
import { PLAN_PRICES } from "@/lib/validators/socio-buleje";

// In-memory "store" — simula persistence para demo. Prod: Prisma.
const memberships = new Map<string, MockSocioMembership>();

function key(tenantId: string, userId: string) {
  return `${tenantId}:${userId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── Public API ───────────────────────────────────────────────────────────────

export class SocioBulejeDB {
  /**
   * Devuelve la membership actual del usuario en el tenant. null si no tiene.
   *
   * Para el demo, cualquier userId que haga .subscribe() queda registrado;
   * adicionalmente, "user_demo_01" trae el mock rico (dashboards prellenados).
   */
  static async getMembership(
    tenantId: string,
    userId: string,
  ): Promise<MockSocioMembership | null> {
    const cached = memberships.get(key(tenantId, userId));
    if (cached) return cached;

    // Demo fallback: user_demo_01 tiene historial rico prellenado.
    if (userId === MOCK_SOCIO_MEMBERSHIP.userId && tenantId === MOCK_SOCIO_MEMBERSHIP.tenantId) {
      return MOCK_SOCIO_MEMBERSHIP;
    }
    return null;
  }

  /**
   * Crea una membership activa con plan dado. Inicia en trial (30 días) si el
   * usuario nunca fue socio antes.
   */
  static async subscribe(
    tenantId: string,
    userId: string,
    plan: SocioPlan,
  ): Promise<MockSocioMembership> {
    const existing = memberships.get(key(tenantId, userId));
    const start = nowIso();
    const duration = plan === "yearly" ? 365 : 30;
    const end = addDays(start, duration);
    const trialEnds = existing ? undefined : addDays(start, 30);

    const membership: MockSocioMembership = {
      userId,
      tenantId,
      plan,
      status: existing ? "active" : "trial",
      startDate: start,
      endDate: end,
      cashbackBalance: existing?.cashbackBalance ?? 0,
      totalSaved: existing?.totalSaved ?? 0,
      totalOrdersWithFreeShipping: existing?.totalOrdersWithFreeShipping ?? 0,
      daysAsSocio: existing?.daysAsSocio ?? 0,
      trialEndsAt: trialEnds,
    };

    memberships.set(key(tenantId, userId), membership);
    return membership;
  }

  /**
   * Marca la membership como cancelada. El beneficio sigue activo hasta endDate.
   * Idempotente.
   */
  static async cancel(
    tenantId: string,
    userId: string,
  ): Promise<MockSocioMembership | null> {
    const existing = memberships.get(key(tenantId, userId));
    if (!existing) return null;
    const updated: MockSocioMembership = { ...existing, status: "canceled" };
    memberships.set(key(tenantId, userId), updated);
    return updated;
  }

  /**
   * Reactiva una membership previamente cancelada.
   */
  static async resume(
    tenantId: string,
    userId: string,
  ): Promise<MockSocioMembership | null> {
    const existing = memberships.get(key(tenantId, userId));
    if (!existing) return null;
    const updated: MockSocioMembership = { ...existing, status: "active" };
    memberships.set(key(tenantId, userId), updated);
    return updated;
  }

  /**
   * Devuelve el historial de transacciones de cashback del usuario.
   * Paginación simple por limit.
   */
  static async getCashbackHistory(
    tenantId: string,
    userId: string,
    limit = 10,
  ): Promise<MockCashbackTransaction[]> {
    void tenantId;
    void userId;
    return MOCK_CASHBACK_HISTORY.slice(0, limit);
  }

  /**
   * Devuelve los últimos 6 meses de ahorro mensual del usuario.
   */
  static async getMonthlySavings(
    tenantId: string,
    userId: string,
  ): Promise<MockMonthlySaving[]> {
    void tenantId;
    void userId;
    return MOCK_MONTHLY_SAVINGS;
  }

  /**
   * Devuelve ofertas exclusivas del tier Socio para el tenant.
   */
  static async getExclusiveOffers(
    tenantId: string,
    limit = 12,
  ): Promise<MockExclusiveOffer[]> {
    void tenantId;
    return MOCK_EXCLUSIVE_OFFERS.slice(0, limit);
  }

  /**
   * Precio aplicable según plan.
   */
  static getPlanPrice(plan: SocioPlan): number {
    return PLAN_PRICES[plan];
  }
}
