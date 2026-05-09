import "server-only";
import { LoyaltyDB } from "@/lib/db/loyalty.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { notifyTierUpgrade } from "@/lib/loyalty/tier-upgrade-notifier";
import { calculatePointsWithMultipliers } from "@/lib/loyalty/category-multiplier";

// ── Constantes de negocio ────────────────────────────────────────────────────

/** S/1 gastado = 1 punto (piso, sin decimales). */
const POINTS_PER_SOL = 1;

/** Compra mínima en soles para ganar puntos. */
const MIN_PURCHASE_FOR_POINTS = 5;

// ── Niveles de lealtad ───────────────────────────────────────────────────────

export type LoyaltyTierName = "Bronce" | "Plata" | "Oro" | "Diamante";

export interface LoyaltyTier {
  name: LoyaltyTierName;
  minPoints: number;
  maxPoints: number | null; // null = sin límite superior
}

const LOYALTY_TIERS: LoyaltyTier[] = [
  { name: "Bronce",   minPoints: 0,    maxPoints: 99   },
  { name: "Plata",    minPoints: 100,  maxPoints: 499  },
  { name: "Oro",      minPoints: 500,  maxPoints: 1999 },
  { name: "Diamante", minPoints: 2000, maxPoints: null },
];

export function getTierFromPoints(points: number): LoyaltyTierName {
  // Recorre de mayor a menor para encontrar el primer tier que aplica.
  for (let i = LOYALTY_TIERS.length - 1; i >= 0; i--) {
    if (points >= LOYALTY_TIERS[i].minPoints) {
      return LOYALTY_TIERS[i].name;
    }
  }
  return "Bronce";
}

// ── Resultado del auto-earn ──────────────────────────────────────────────────

export interface AutoEarnResult {
  /** Puntos acreditados en esta transacción. */
  pointsEarned: number;
  /** Balance total DESPUÉS de acreditar. */
  newBalance: number;
  /** Nivel ANTES de acreditar (calculado sobre el saldo previo). */
  previousTier: LoyaltyTierName;
  /** Nivel DESPUÉS de acreditar. */
  currentTier: LoyaltyTierName;
  /** true cuando el cliente subió de nivel en esta transacción. */
  tierUpgrade: boolean;
  /** ID de la transacción de lealtad creada. */
  transactionId: string;
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Acredita puntos de lealtad al completar una compra.
 *
 * Reglas:
 *  - 1 punto por cada S/1 gastado (Math.floor), con multiplicadores opcionales por categoría.
 *  - Mínimo de compra: S/5 para ganar puntos.
 *  - Anti-duplicación: si ya existe una transacción con metadata.orderId === orderId
 *    para este cliente+tenant, la función retorna null sin escribir de nuevo.
 *  - Si se pasan categoryItems, se aplican multiplicadores por categoría (ej. Frutas ×2).
 *    Si no se pasan, usa la tasa plana 1×.
 *
 * Esta función NO lanza. Cualquier error queda registrado en el logger y devuelve null.
 * El caller debe invocarla con .catch(() => {}) para cumplir regla fire-and-forget
 * cuando se usa en el path de orden.
 *
 * @param tenantId       - Tenant del negocio (primer parámetro, CLAUDE.md regla #3).
 * @param customerId     - Teléfono normalizado del cliente (PK en Customer).
 * @param orderId        - ID de la orden; usado como clave anti-duplicación.
 * @param orderTotal     - Total en soles (número positivo).
 * @param categoryItems  - (Opcional) Items con categoría y subtotal para multiplicadores.
 */
export async function autoEarnLoyaltyPoints(
  tenantId: string,
  customerId: string,
  orderId: string,
  orderTotal: number,
  categoryItems?: { categorySlug?: string | null; lineTotal: number }[],
): Promise<AutoEarnResult | null> {
  try {
    // ── 1. Mínimo de compra ──────────────────────────────────────────────────
    if (orderTotal < MIN_PURCHASE_FOR_POINTS) {
      logger.info("[auto-earn] Compra menor al mínimo, sin puntos", {
        tenantId, customerId, orderId, orderTotal, min: MIN_PURCHASE_FOR_POINTS,
      });
      return null;
    }

    // ── 2. Calcular puntos a acreditar ───────────────────────────────────────
    //    Si hay items con categoría, aplica multiplicadores. Si no, tasa plana.
    let pointsToEarn: number;
    let multiplierBreakdown: { category: string; points: number; multiplier: number }[] | undefined;

    if (categoryItems && categoryItems.length > 0) {
      const result = calculatePointsWithMultipliers(categoryItems);
      pointsToEarn = result.totalPoints;
      multiplierBreakdown = result.breakdown;
    } else {
      pointsToEarn = Math.floor(orderTotal * POINTS_PER_SOL);
    }

    if (pointsToEarn <= 0) {
      logger.info("[auto-earn] Puntos calculados = 0, sin transacción", {
        tenantId, customerId, orderId, orderTotal,
      });
      return null;
    }

    // ── 3. Anti-duplicación: balance actual antes de escribir ────────────────
    //    LoyaltyDB.getHistory permite buscar por metadata, pero es más limpio
    //    consultar el balance actual y luego intentar earn con el orderId en
    //    metadata. Si la transacción ya existe el ledger la registraría dos veces,
    //    así que consultamos el historial para buscar una entrada con orderId.
    const history = await LoyaltyDB.getHistory(tenantId, customerId, 100, 0);
    const alreadyEarned = history.transactions.some(
      (tx) =>
        tx.metadata != null &&
        typeof tx.metadata === "object" &&
        (tx.metadata as Record<string, unknown>).orderId === orderId &&
        tx.amount > 0,
    );

    if (alreadyEarned) {
      logger.info("[auto-earn] Puntos ya acreditados para esta orden", {
        tenantId, customerId, orderId,
      });
      return null;
    }

    // ── 4. Nivel ANTES de acreditar ──────────────────────────────────────────
    const previousBalance = history.balance;
    const previousTier = getTierFromPoints(previousBalance);

    // ── 5. Acreditar puntos vía LoyaltyDB (atómico, con audit trail) ─────────
    const tx = await LoyaltyDB.earn(
      tenantId,
      customerId,
      pointsToEarn,
      "purchase",
      {
        orderId,
        orderTotal,
        source: "auto-earn",
        earnedAt: new Date().toISOString(),
        ...(multiplierBreakdown ? { categoryMultipliers: multiplierBreakdown } : {}),
      },
    );

    // ── 6. Balance y nivel DESPUÉS ───────────────────────────────────────────
    const newBalance = await LoyaltyDB.getBalance(tenantId, customerId);
    const currentTier = getTierFromPoints(newBalance);
    const tierUpgrade = currentTier !== previousTier;

    // ── 7. Log de actividad fire-and-forget (CLAUDE.md regla #7) ─────────────
    logActivity(
      "loyalty_auto_earn",
      "Customer",
      `+${pointsToEarn} pts por orden ${orderId.slice(-6)} (S/${orderTotal.toFixed(2)})${tierUpgrade ? ` — subió a ${currentTier}` : ""}`,
      customerId,
      "system",
      undefined,
      tenantId,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    if (tierUpgrade) {
      logger.info("[auto-earn] Tier upgrade", {
        tenantId, customerId, orderId,
        from: previousTier, to: currentTier, newBalance,
      });
      notifyTierUpgrade(tenantId, customerId, previousTier, currentTier).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }

    return {
      pointsEarned: pointsToEarn,
      newBalance,
      previousTier,
      currentTier,
      tierUpgrade,
      transactionId: tx.id,
    };
  } catch (err) {
    // No-throw: el path de orden no debe bloquearse por un fallo de lealtad.
    logger.error("[auto-earn] Error acreditando puntos", {
      tenantId,
      customerId,
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
