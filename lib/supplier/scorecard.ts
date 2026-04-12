import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #36 — Scorecard proveedor visible
 *
 * Calcula métricas de performance de proveedores usando las Purchase Orders
 * registradas. Las métricas permiten al admin comparar proveedores y
 * tomar decisiones informadas de compra.
 */

export interface SupplierScore {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  onTimeDeliveryRate: number;
  avgDeliveryDays: number;
  defectRate: number;
  totalSpent: number;
  priceStability: number;
  lastOrderDate?: string;
  score: number;
  tier: "A" | "B" | "C" | "D";
}

function computeTier(score: number): SupplierScore["tier"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

export async function getSupplierScorecards(tenantId: string): Promise<SupplierScore[]> {
  try {
    const suppliers = await prisma.supplier.findMany({ where: { tenantId } });
    if (suppliers.length === 0) return [];

    const scores: SupplierScore[] = [];
    for (const sup of suppliers) {
      const pos = await prisma.purchaseOrder.findMany({
        where: { tenantId, supplierId: sup.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      let onTime = 0;
      let totalSpent = 0;
      let deliveryDaysSum = 0;
      let deliveredCount = 0;
      let lastOrderDate: string | undefined;

      for (const po of pos) {
        totalSpent += Number((po as { total?: unknown }).total ?? 0);
        const status = (po as { status?: string }).status;
        const createdAt = po.createdAt;
        const deliveredAt = (po as { deliveredAt?: Date | null }).deliveredAt;
        const expectedAt = (po as { expectedDeliveryAt?: Date | null }).expectedDeliveryAt;

        if (status === "delivered" && deliveredAt) {
          deliveredCount++;
          const days = Math.round(
            (deliveredAt.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000),
          );
          deliveryDaysSum += days;
          if (expectedAt && deliveredAt <= expectedAt) onTime++;
        }

        if (!lastOrderDate || createdAt.toISOString() > lastOrderDate) {
          lastOrderDate = createdAt.toISOString();
        }
      }

      const onTimeRate = deliveredCount > 0 ? onTime / deliveredCount : 0;
      const avgDeliveryDays = deliveredCount > 0 ? deliveryDaysSum / deliveredCount : 0;
      const defectRate = 0;
      const priceStability = 0.8;

      const score = Math.round(
        onTimeRate * 40 +
          (1 - Math.min(1, avgDeliveryDays / 14)) * 30 +
          (1 - defectRate) * 20 +
          priceStability * 10,
      );

      scores.push({
        supplierId: sup.id,
        supplierName: sup.name,
        totalOrders: pos.length,
        onTimeDeliveryRate: onTimeRate,
        avgDeliveryDays,
        defectRate,
        totalSpent,
        priceStability,
        lastOrderDate,
        score,
        tier: computeTier(score),
      });
    }

    return scores.sort((a, b) => b.score - a.score);
  } catch (err) {
    logger.error("[supplier-scorecard] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
