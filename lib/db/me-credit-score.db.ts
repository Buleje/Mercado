import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * MeCreditScoreDB
 * Audit project-wide 2026-05-19 — migración de /api/me/credit-score.
 *
 * Acceso canónico a CreditScoreHistory para el customer autenticado.
 * tenantId obligatorio como primer argumento (CLAUDE.md regla #3).
 * El cálculo del score en sí delega a lib/credit/scoring-engine;
 * esta clase solo encapsula el acceso de lectura al historial.
 */
export const MeCreditScoreDB = {
  /**
   * Últimas N snapshots del historial de score de un customer.
   * Orden descendente (más reciente primero) para que el caller
   * pueda calcular el delta vs. la snapshot anterior.
   *
   * Fail-open: devuelve [] si la tabla aún no tiene datos para el customer.
   *
   * @param tenantId   tenant scope
   * @param customerId identificador del customer (phone en este proyecto)
   * @param take       máximo de snapshots (default 12 para mini-chart)
   */
  async getHistory(
    tenantId: string,
    customerId: string,
    take = 12,
  ) {
    return prisma.creditScoreHistory
      .findMany({
        where: { tenantId, customerId },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          score: true,
          creditLimit: true,
          riskLevel: true,
          trigger: true,
          createdAt: true,
        },
      })
      .catch(() => [] as never[]);
  },
};
