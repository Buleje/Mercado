import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getRescueQueue } from "@/lib/db/rescue.db";
import { getFeatureAdoption } from "@/lib/db/feature-adoption.db";

/**
 * lib/db/comunicados.db.ts — segmentos inteligentes para comunicados (Brandon
 * 2026-06-19, idea #B). Resuelve a quién mandarle un mensaje reusando la
 * inteligencia que ya tenemos: en riesgo (rescate), no usan una función de
 * crecimiento (adopción), trial por vencer, plan. El envío real lo hace el
 * broadcast existente (/api/superadmin/chat/broadcast) con estos tenantIds.
 */

export interface Recipient { id: string; name: string }
export interface Segment { key: string; label: string; hint: string; recipients: Recipient[] }

export async function getComunicadosSegments(): Promise<Segment[]> {
  try {
    const [rescue, adoption, tenants] = await Promise.all([
      getRescueQueue(),
      getFeatureAdoption(),
      prisma.tenant.findMany({ where: { active: true }, select: { id: true, name: true, plan: true } }),
    ]);

    const nameById = new Map(tenants.map((t) => [t.id, t.name]));
    const rec = (id: string, name?: string): Recipient => ({ id, name: name ?? nameById.get(id) ?? id });

    const all = tenants.map((t) => rec(t.id, t.name));
    const atRisk = rescue.queue.filter((r) => r.riskLevel === "critical" || r.riskLevel === "high").map((r) => rec(r.id, r.name));
    const trial = rescue.queue.filter((r) => r.trialDaysLeft != null && r.trialDaysLeft <= 7).map((r) => rec(r.id, r.name));
    const noMarketplace = adoption.gaps.filter((g) => g.missing.includes("Marketplace")).map((g) => rec(g.tenantId, g.tenantName));
    const noFiado = adoption.gaps.filter((g) => g.missing.includes("Fiado")).map((g) => rec(g.tenantId, g.tenantName));
    const paid = tenants.filter((t) => t.plan !== "free").map((t) => rec(t.id, t.name));

    return [
      { key: "todos", label: "Todos los negocios", hint: "toda la plataforma", recipients: all },
      { key: "en-riesgo", label: "En riesgo (churn)", hint: "riesgo alto/crítico", recipients: atRisk },
      { key: "trial", label: "Trial por vencer", hint: "≤7 días", recipients: trial },
      { key: "sin-marketplace", label: "No usan Marketplace", hint: "oportunidad de upsell", recipients: noMarketplace },
      { key: "sin-fiado", label: "No usan Fiado", hint: "oportunidad de upsell", recipients: noFiado },
      { key: "pagados", label: "Planes pagados", hint: "no-free", recipients: paid },
    ].filter((s) => s.key === "todos" || s.recipients.length > 0);
  } catch (err) {
    logger.error("[comunicados.db] getComunicadosSegments failed", { error: String(err) });
    return [];
  }
}
