import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { logger } from "@/lib/logger";

/**
 * lib/db/feature-adoption.db.ts — Adopción de funciones (Brandon 2026-06-19,
 * idea #4). Deriva qué módulos usa cada negocio desde ActivityLog.entity
 * (normalizado, porque el dato crudo tiene casing/prefijos mezclados) y arma:
 *  - adopción por función (% de negocios activos que la usan),
 *  - oportunidades de coaching (negocios que NO usan una función de crecimiento).
 * Para ofrecer ayuda/upsell con base real, no inventada.
 */

interface FeatureDef { key: string; label: string; aliases: string[]; growth: boolean }

// Solo funciones que podemos mapear con confianza. El ruido de sistema
// (admin/security/superadmin/[L29733]*/Notification) queda fuera a propósito.
const FEATURES: FeatureDef[] = [
  { key: "productos", label: "Productos", aliases: ["producto", "product"], growth: false },
  { key: "pedidos", label: "Pedidos", aliases: ["pedido", "order", "[l29733] order"], growth: false },
  { key: "ventas", label: "Ventas / POS", aliases: ["sale", "[l29733] sale", "venta"], growth: false },
  { key: "clientes", label: "Clientes", aliases: ["customer", "[l29733] customer"], growth: false },
  { key: "turnos", label: "Turnos / Caja", aliases: ["turno"], growth: false },
  { key: "reportes", label: "Reportes", aliases: ["report", "monthly_report"], growth: false },
  { key: "fiado", label: "Fiado", aliases: ["fiado", "[l29733] fiado"], growth: true },
  { key: "adelantos", label: "Adelantos", aliases: ["adelanto"], growth: true },
  { key: "combos", label: "Combos / Bundles", aliases: ["bundle"], growth: true },
  { key: "cupones", label: "Cupones", aliases: ["cupon", "cupón"], growth: true },
  { key: "marketplace", label: "Marketplace", aliases: ["marketplace_store", "marketplace"], growth: true },
  { key: "whatsapp", label: "WhatsApp", aliases: ["whatsappconversation"], growth: true },
  { key: "delivery", label: "Delivery", aliases: ["driverapplication", "delivery"], growth: true },
];
const ALIAS_TO_KEY = new Map<string, string>();
for (const f of FEATURES) for (const a of f.aliases) ALIAS_TO_KEY.set(a, f.key);

export interface FeatureAdoptionRow { key: string; label: string; growth: boolean; tenantsUsing: number; adoptionPct: number }
export interface CoachingGap { tenantId: string; tenantName: string; tenantSlug: string; missing: string[]; uses: number }
export interface FeatureAdoptionResult {
  features: FeatureAdoptionRow[];
  gaps: CoachingGap[];
  kpis: { tracked: number; activeTenants: number; avgFeatures: number; opportunities: number; worstFeature: string | null };
}

export async function getFeatureAdoption(): Promise<FeatureAdoptionResult> {
  "use cache";
  // [PERF] Cache server-side: escaneaba TODO ActivityLog (distinct tenantId,entity)
  // en CADA carga del dashboard (route no-store). Cacheamos 10min (stale 30min) —
  // la adopción de funciones no cambia minuto a minuto. Invalidable vía cacheTag.
  cacheLife({ revalidate: 600, stale: 1800 });
  cacheTag("superadmin:feature-adoption");
  try {
    const [tenants, pairs] = await Promise.all([
      prisma.tenant.findMany({ where: { active: true }, select: { id: true, name: true, slug: true } }),
      prisma.activityLog.findMany({ distinct: ["tenantId", "entity"], select: { tenantId: true, entity: true } }),
    ]);
    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    // tenantId → Set<featureKey>
    const used = new Map<string, Set<string>>();
    for (const p of pairs) {
      if (!tenantById.has(p.tenantId)) continue; // solo activos
      const key = ALIAS_TO_KEY.get(p.entity.trim().toLowerCase());
      if (!key) continue;
      const set = used.get(p.tenantId) ?? new Set<string>();
      set.add(key);
      used.set(p.tenantId, set);
    }

    const total = tenants.length || 1;
    const features: FeatureAdoptionRow[] = FEATURES.map((f) => {
      const n = tenants.filter((t) => used.get(t.id)?.has(f.key)).length;
      return { key: f.key, label: f.label, growth: f.growth, tenantsUsing: n, adoptionPct: Math.round((n / total) * 100) };
    }).sort((a, b) => a.adoptionPct - b.adoptionPct);

    const growthKeys = FEATURES.filter((f) => f.growth);
    const gaps: CoachingGap[] = [];
    for (const t of tenants) {
      const set = used.get(t.id) ?? new Set<string>();
      const missing = growthKeys.filter((f) => !set.has(f.key)).map((f) => f.label);
      if (missing.length > 0) gaps.push({ tenantId: t.id, tenantName: t.name, tenantSlug: t.slug, missing, uses: set.size });
    }
    // El que MÁS oportunidades tiene (menos usa) primero.
    gaps.sort((a, b) => b.missing.length - a.missing.length || a.uses - b.uses);

    const avgFeatures = tenants.length ? Math.round((tenants.reduce((s, t) => s + (used.get(t.id)?.size ?? 0), 0) / tenants.length) * 10) / 10 : 0;
    const worst = features.find((f) => f.growth) ?? null;

    return {
      features,
      gaps,
      kpis: {
        tracked: FEATURES.length,
        activeTenants: tenants.length,
        avgFeatures,
        opportunities: gaps.reduce((s, g) => s + g.missing.length, 0),
        worstFeature: worst ? `${worst.label} (${worst.adoptionPct}%)` : null,
      },
    };
  } catch (err) {
    logger.error("[feature-adoption.db] getFeatureAdoption failed", { error: String(err) });
    return { features: [], gaps: [], kpis: { tracked: 0, activeTenants: 0, avgFeatures: 0, opportunities: 0, worstFeature: null } };
  }
}
