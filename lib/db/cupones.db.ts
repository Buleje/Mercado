import "server-only";
import {
  MOCK_CUPONES,
  MOCK_PUBLIC_COUPON_CATALOG,
  type MockCupon,
} from "@/lib/mocks/cupones.mock";

/**
 * lib/db/cupones.db.ts — Agent E (Cupones Marketplace)
 *
 * Vista "cliente" de los cupones. Complementa `lib/db/coupons.db.ts` (admin).
 *
 * Estado actual: MOCK en memoria porque la relacion `UserCoupon` aun no
 * esta modelada en Prisma (zona peligrosa). El contrato publico esta
 * diseniado para ser reemplazado por queries reales cuando se haga la
 * migration.
 */

export type DbCupon = MockCupon;

export type AppliedCupon = {
  cupon: DbCupon;
  discountApplied: number;
  finalTotal: number;
};

// ── In-memory repo ───────────────────────────────────────────────────────────

let cupones: DbCupon[] = MOCK_CUPONES.map((c) => ({ ...c }));

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < now.getTime();
}

// ── Public API ───────────────────────────────────────────────────────────────

export const CuponesDB = {
  /** Lista cupones del usuario (todos los estados). */
  async listForUser(tenantId: string, userId: string): Promise<DbCupon[]> {
    return cupones
      .filter((c) => c.tenantId === tenantId && c.userId === userId)
      .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""))
      .map((c) => ({ ...c }));
  },

  /** Solo disponibles y no expirados. */
  async listAvailableForUser(
    tenantId: string,
    userId: string,
  ): Promise<DbCupon[]> {
    const all = await CuponesDB.listForUser(tenantId, userId);
    return all.filter((c) => c.status === "disponible" && !isExpired(c.expiresAt));
  },

  /** Usados historicos. */
  async listUsedForUser(
    tenantId: string,
    userId: string,
  ): Promise<DbCupon[]> {
    const all = await CuponesDB.listForUser(tenantId, userId);
    return all.filter((c) => c.status === "usado" || c.status === "expirado");
  },

  /**
   * Validar un codigo — verifica existencia + estado.
   * No aplica el cupon aun.
   */
  async validate(
    tenantId: string,
    code: string,
    userId: string,
  ): Promise<
    | { ok: true; cupon: DbCupon }
    | { ok: false; error: "NOT_FOUND" | "ALREADY_OWNED" | "EXPIRED" | "USED" }
  > {
    const upperCode = code.toUpperCase();

    // Primero mirar los cupones del usuario
    const mine = cupones.find(
      (c) =>
        c.tenantId === tenantId &&
        c.userId === userId &&
        c.code.toUpperCase() === upperCode,
    );
    if (mine) {
      if (mine.status === "usado") return { ok: false, error: "USED" };
      if (mine.status === "expirado" || isExpired(mine.expiresAt)) {
        return { ok: false, error: "EXPIRED" };
      }
      return { ok: true, cupon: { ...mine } };
    }

    // Segundo: catalogo publico
    const publicCupon = MOCK_PUBLIC_COUPON_CATALOG[upperCode];
    if (!publicCupon) return { ok: false, error: "NOT_FOUND" };
    if (isExpired(publicCupon.expiresAt)) return { ok: false, error: "EXPIRED" };

    const hydrated: DbCupon = {
      id: randomId("cup"),
      userId,
      status: "disponible",
      usedAt: null,
      orderNumber: null,
      ...publicCupon,
    };
    return { ok: true, cupon: hydrated };
  },

  /**
   * Aplicar un cupon al carrito del usuario (agregarlo a su coleccion).
   * No deduce saldo todavia — lo hace el checkout real.
   */
  async apply(
    tenantId: string,
    code: string,
    userId: string,
  ): Promise<
    | { ok: true; cupon: DbCupon }
    | { ok: false; error: "NOT_FOUND" | "ALREADY_OWNED" | "EXPIRED" | "USED" }
  > {
    const result = await CuponesDB.validate(tenantId, code, userId);
    if (!result.ok) return result;
    const already = cupones.find((c) => c.id === result.cupon.id);
    if (!already) {
      cupones.unshift(result.cupon);
    }
    return { ok: true, cupon: result.cupon };
  },

  /**
   * Marcar un cupon como usado. El checkout real deberia llamar esto.
   */
  async markUsed(
    tenantId: string,
    userId: string,
    code: string,
    orderNumber: string,
  ): Promise<void> {
    const cup = cupones.find(
      (c) =>
        c.tenantId === tenantId &&
        c.userId === userId &&
        c.code.toUpperCase() === code.toUpperCase(),
    );
    if (!cup) return;
    cup.status = "usado";
    cup.usedAt = new Date().toISOString();
    cup.orderNumber = orderNumber;
  },

  /** @internal */
  __reset(): void {
    cupones = MOCK_CUPONES.map((c) => ({ ...c }));
  },
};
