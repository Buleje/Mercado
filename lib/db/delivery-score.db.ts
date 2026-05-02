import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * lib/db/delivery-score.db.ts
 *
 * DB class para leer el score de gamificacion del DeliveryPartner.
 *
 * Convenciones:
 *   - partnerId como primer argumento
 *   - Nunca Prisma directo fuera de DB classes
 *   - Sin cache aqui — el endpoint de score tiene TTL corto propio
 */

export type DeliveryScoreRow = {
  partnerId: string;
  score: number;
};

export const DeliveryScoreDb = {
  /**
   * Lee el score actual del partner desde la DB.
   * Retorna 0 si el partner no existe (tolerante a race conditions).
   */
  async getScore(partnerId: string): Promise<DeliveryScoreRow> {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: partnerId },
      select: { id: true, score: true },
    });

    return {
      partnerId,
      score: partner?.score ?? 0,
    };
  },
};
