import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/rescue.db.ts — Cola de rescate (Brandon 2026-06-19, idea #3). Junta los
 * negocios "a punto de irse" y los rankea por urgencia × valor para que el
 * superadmin actúe primero sobre el que más importa. Datos REALES de
 * TenantHealthScore (riskLevel, días sin pedido/login, trial) + Tenant (plan).
 */

export interface RescueRow {
  id: string; name: string; slug: string; plan: string; active: boolean;
  score: number | null; riskLevel: string;
  daysSinceLastOrder: number; daysSinceLastLogin: number; trialDaysLeft: number | null;
  loginsLast7d: number; ordersLast7d: number;
  reasons: string[]; priority: number;
}
export interface RescueKpis { critical: number; high: number; trialsExpiring: number; paidAtRisk: number; total: number }

const RISK_W: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const planWeight = (p: string) => (p === "enterprise" ? 4 : p === "pro" || p === "business" ? 3 : p === "starter" ? 2 : 1);

type Health = { tenantId: string; score: number; riskLevel: string; daysSinceLastOrder: number; daysSinceLastLogin: number; trialDaysLeft: number | null; loginsLast7d: number; ordersLast7d: number };

export async function getRescueQueue(): Promise<{ queue: RescueRow[]; kpis: RescueKpis }> {
  try {
    const [tenants, healthRows] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true, name: true, slug: true, plan: true, active: true } }),
      // Último health score por tenant (la cron escribe uno por día).
      prisma.$queryRawUnsafe<Health[]>(
        `SELECT DISTINCT ON ("tenantId") "tenantId", score, "riskLevel", "daysSinceLastOrder", "daysSinceLastLogin", "trialDaysLeft", "loginsLast7d", "ordersLast7d"
         FROM "TenantHealthScore" ORDER BY "tenantId", "calculatedAt" DESC`,
      ),
    ]);
    const hmap = new Map(healthRows.map((h) => [h.tenantId, h]));

    const queue: RescueRow[] = [];
    for (const t of tenants) {
      const h = hmap.get(t.id);
      const risk = h?.riskLevel ?? "low";
      const dno = h?.daysSinceLastOrder ?? 0;
      const dnl = h?.daysSinceLastLogin ?? 0;
      const tdl = h?.trialDaysLeft ?? null;

      const reasons: string[] = [];
      if (risk === "critical") reasons.push("riesgo crítico");
      else if (risk === "high") reasons.push("riesgo alto");
      if (dno >= 7) reasons.push(`${dno}d sin vender`);
      if (dnl >= 7) reasons.push(`${dnl}d sin entrar`);
      if (tdl != null && tdl <= 7) reasons.push(tdl <= 0 ? "trial vencido" : `trial vence en ${tdl}d`);
      if (reasons.length === 0) continue; // sano → fuera de la cola

      const priority = (RISK_W[risk] ?? 1) * 100 + planWeight(t.plan) * 10 + (tdl != null ? Math.max(0, 8 - tdl) : 0) + Math.min(dno, 14);
      queue.push({
        id: t.id, name: t.name, slug: t.slug, plan: t.plan, active: t.active,
        score: h?.score ?? null, riskLevel: risk,
        daysSinceLastOrder: dno, daysSinceLastLogin: dnl, trialDaysLeft: tdl,
        loginsLast7d: h?.loginsLast7d ?? 0, ordersLast7d: h?.ordersLast7d ?? 0,
        reasons, priority,
      });
    }
    queue.sort((a, b) => b.priority - a.priority);

    const kpis: RescueKpis = {
      critical: queue.filter((r) => r.riskLevel === "critical").length,
      high: queue.filter((r) => r.riskLevel === "high").length,
      trialsExpiring: queue.filter((r) => r.trialDaysLeft != null && r.trialDaysLeft <= 7).length,
      paidAtRisk: queue.filter((r) => r.plan !== "free").length,
      total: queue.length,
    };
    return { queue, kpis };
  } catch (err) {
    logger.error("[rescue.db] getRescueQueue failed", { error: String(err) });
    return { queue: [], kpis: { critical: 0, high: 0, trialsExpiring: 0, paidAtRisk: 0, total: 0 } };
  }
}

/** Extiende el trial de un negocio N días (acción de rescate). */
export async function extendTenantTrial(slug: string, days: number): Promise<{ ok: boolean; trialEndsAt: string | null }> {
  try {
    const t = await prisma.tenant.findFirst({ where: { OR: [{ slug }, { id: slug }] }, select: { id: true, trialEndsAt: true } });
    if (!t) return { ok: false, trialEndsAt: null };
    const base = t.trialEndsAt && t.trialEndsAt.getTime() > Date.now() ? t.trialEndsAt.getTime() : Date.now();
    const next = new Date(base + days * 86_400_000);
    await prisma.tenant.update({ where: { id: t.id }, data: { trialEndsAt: next } });
    logger.info("[rescue.db] trial extendido", { tenantId: t.id, days });
    return { ok: true, trialEndsAt: next.toISOString() };
  } catch (err) {
    logger.error("[rescue.db] extendTenantTrial failed", { slug, error: String(err) });
    return { ok: false, trialEndsAt: null };
  }
}
