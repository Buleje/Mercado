import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  computeAvailable,
  validatePayoutAmount,
  type PayoutRequestInput,
} from "@/lib/delivery/payout";

/**
 * PartnerPayoutsDB — retiros (cash-out) del repartidor a Yape.
 *
 * tenantId obligatorio como 1er argumento (CLAUDE.md regla #3).
 * Sin `"use cache"`: el saldo es dinero que el repartidor retira en vivo,
 * tiene que ser fresco (igual criterio que /api/delivery/me/earnings).
 *
 * Anti-fraude (regla #6): el saldo disponible SIEMPRE se recalcula en backend
 * y, para crear un retiro, dentro de una transacción serializable — así dos
 * POST concurrentes no pueden retirar el mismo dinero dos veces.
 */

const COMMITTED_STATES = ["pending", "paid"] as const;

export interface PartnerBalance {
  /** Σ(fee + propina) de TODAS las entregas completadas. */
  lifetime: number;
  /** Σ(monto) de retiros en estado pending|paid (dinero ya apartado). */
  withdrawn: number;
  /** Σ(monto) de retiros aún pendientes de pago. */
  pending: number;
  /** Saldo retirable ahora. */
  available: number;
}

export interface PartnerPayoutRow {
  id: string;
  amount: number;
  yapeNumber: string;
  status: string;
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function readBalance(
  client: typeof prisma | PrismaTx,
  partnerId: string,
): Promise<PartnerBalance> {
  // IMPORTANTE — billetera GLOBAL del repartidor, scopeada SOLO por partnerId.
  // El `partnerId` es único a nivel proyecto (no por tenant), igual que
  // `listActiveForPartner(partnerId)`. Un repartidor de la red Buleje ("main")
  // entrega pedidos de OTRAS bodegas; esos DeliveryAssignment llevan el
  // `tenantId` del pedido (offer-cascade), no el del repartidor. Si filtráramos
  // por tenantId, ese dinero ganado cross-tenant quedaría invisible y NO
  // retirable. Por eso NO se filtra por tenantId aquí (sería re-introducir el
  // bug). El tenantId se sigue guardando en cada PartnerPayout solo como sello
  // del retiro. Tanto lo ganado como lo retirado se suman cross-tenant para que
  // el saldo disponible sea consistente (si solo uno fuera global, se podría
  // retirar de más).
  const [earned, committed, pendingAgg] = await Promise.all([
    client.deliveryAssignment.aggregate({
      where: { partnerId, status: "delivered" },
      _sum: { fee: true, tipAmount: true },
    }),
    client.partnerPayout.aggregate({
      where: { partnerId, status: { in: [...COMMITTED_STATES] } },
      _sum: { amount: true },
    }),
    client.partnerPayout.aggregate({
      where: { partnerId, status: "pending" },
      _sum: { amount: true },
    }),
  ]);

  const lifetime =
    Number(earned._sum.fee ?? 0) + Number(earned._sum.tipAmount ?? 0);
  const withdrawn = Number(committed._sum.amount ?? 0);
  const pending = Number(pendingAgg._sum.amount ?? 0);

  return {
    lifetime,
    withdrawn,
    pending,
    available: computeAvailable(lifetime, withdrawn),
  };
}

export const PartnerPayoutsDB = {
  /**
   * Saldo GLOBAL del partner (ganancias de por vida − retiros comprometidos),
   * across todos los tenants. `tenantId` se ignora para el cálculo (la billetera
   * es por `partnerId`); se mantiene en la firma por consistencia con el resto
   * de la clase y porque el caller ya lo tiene a mano.
   */
  getBalance(_tenantId: string, partnerId: string): Promise<PartnerBalance> {
    return readBalance(prisma, partnerId);
  },

  /**
   * Historial de retiros del partner, más reciente primero. Global por
   * `partnerId` (across tenants) para que reconcilie con el `withdrawn` del
   * saldo, que también es global. `tenantId` se ignora (ver readBalance).
   */
  async listForPartner(
    _tenantId: string,
    partnerId: string,
    take = 20,
  ): Promise<PartnerPayoutRow[]> {
    const rows = await prisma.partnerPayout.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        amount: true,
        yapeNumber: true,
        status: true,
        note: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
    return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
  },

  /**
   * Solicita un retiro. Recalcula el saldo disponible DENTRO de una
   * transacción serializable y crea el retiro `pending` solo si el monto es
   * válido. Devuelve un resultado discriminado (nunca lanza por validación).
   */
  async requestPayout(
    tenantId: string,
    partnerId: string,
    input: PayoutRequestInput,
  ): Promise<
    | { ok: true; payout: PartnerPayoutRow; balance: PartnerBalance }
    | { ok: false; error: string }
  > {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const balance = await readBalance(tx, partnerId);
          const check = validatePayoutAmount(input.amount, balance.available);
          if (!check.ok) {
            return { ok: false as const, error: check.error };
          }
          const created = await tx.partnerPayout.create({
            data: {
              partnerId,
              tenantId,
              amount: check.amount,
              yapeNumber: input.yapeNumber,
              status: "pending",
            },
            select: {
              id: true,
              amount: true,
              yapeNumber: true,
              status: true,
              note: true,
              createdAt: true,
              resolvedAt: true,
            },
          });
          const payout: PartnerPayoutRow = {
            ...created,
            amount: Number(created.amount),
          };
          // Saldo proyectado tras apartar el retiro recién creado.
          const after: PartnerBalance = {
            lifetime: balance.lifetime,
            withdrawn: balance.withdrawn + payout.amount,
            pending: balance.pending + payout.amount,
            available: computeAvailable(
              balance.lifetime,
              balance.withdrawn + payout.amount,
            ),
          };
          return { ok: true as const, payout, balance: after };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      // Conflicto de serialización (dos retiros a la vez) u otro error de tx.
      logger.error("[PartnerPayoutsDB.requestPayout] tx failed", {
        error: err instanceof Error ? err.message : String(err),
        tenantId,
        partnerId,
      });
      return {
        ok: false,
        error: "No pudimos procesar el retiro. Intenta de nuevo.",
      };
    }
  },
};
