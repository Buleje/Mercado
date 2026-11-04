import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { logger } from "@/lib/logger";
import {
  MODULOS, VENTANA_DIAS, claveDeEntidad, consejosDeRubro, rubroDeNegocio,
  type Rubro,
} from "@/lib/superadmin/adopcion-modulos";

/**
 * lib/db/feature-adoption.db.ts — Adopción de funciones (Brandon 2026-06-19,
 * idea #4). Deriva qué módulos usa cada negocio desde ActivityLog.entity
 * (normalizado, porque el dato crudo tiene casing/prefijos mezclados) y arma:
 *  - adopción por función (% de los negocios a los que les aplica que la usan),
 *  - oportunidades de coaching (funciones de crecimiento de SU rubro que no usa).
 * Para ofrecer ayuda/upsell con base real, no inventada.
 *
 * Tramo 2 (2026-11-04): suma los módulos del aserradero (Libro CTP, LO-TH,
 * guías, personal, cámaras, agenda), cuenta solo los últimos 30 días y separa
 * por rubro (Aserradero / Bodega). Las reglas puras viven en
 * `lib/superadmin/adopcion-modulos.ts`.
 */

export interface FeatureAdoptionRow { key: string; label: string; growth: boolean; tenantsUsing: number; tenantsEligible: number; adoptionPct: number }
export interface CoachingGap { tenantId: string; tenantName: string; tenantSlug: string; rubro: Rubro; missing: string[]; uses: number }
export interface TenantModules { tenantId: string; tenantName: string; tenantSlug: string; rubro: Rubro; modules: string[]; uses: number }
export interface FeatureAdoptionResult {
  features: FeatureAdoptionRow[];
  gaps: CoachingGap[];
  tenants: TenantModules[];
  kpis: { tracked: number; activeTenants: number; avgFeatures: number; opportunities: number; worstFeature: string | null; windowDays: number };
}

const VACIO: FeatureAdoptionResult = {
  features: [], gaps: [], tenants: [],
  kpis: { tracked: 0, activeTenants: 0, avgFeatures: 0, opportunities: 0, worstFeature: null, windowDays: VENTANA_DIAS },
};

export async function getFeatureAdoption(): Promise<FeatureAdoptionResult> {
  "use cache";
  // [PERF] Cache server-side: escaneaba TODO ActivityLog (distinct tenantId,entity)
  // en CADA carga del dashboard (route no-store). Cacheamos 10min (stale 30min) —
  // la adopción de funciones no cambia minuto a minuto. Invalidable vía cacheTag.
  cacheLife({ revalidate: 600, stale: 1800 });
  cacheTag("superadmin:feature-adoption");
  try {
    const desde = new Date(Date.now() - VENTANA_DIAS * 86_400_000);
    const [tenants, pairs] = await Promise.all([
      prisma.tenant.findMany({ where: { active: true }, select: { id: true, name: true, slug: true, industry: true } }),
      prisma.activityLog.findMany({ where: { createdAt: { gte: desde } }, distinct: ["tenantId", "entity"], select: { tenantId: true, entity: true } }),
    ]);
    const tenantIds = new Set(tenants.map((t) => t.id));

    // tenantId → Set<featureKey>
    const used = new Map<string, Set<string>>();
    for (const p of pairs) {
      if (!tenantIds.has(p.tenantId)) continue; // solo activos
      const key = claveDeEntidad(p.entity);
      if (!key) continue;
      const set = used.get(p.tenantId) ?? new Set<string>();
      set.add(key);
      used.set(p.tenantId, set);
    }

    // Rubro de cada negocio según lo que usa (aserradero = algún módulo forestal).
    const rubroDe = new Map<string, Rubro>(tenants.map((t) => [t.id, rubroDeNegocio(used.get(t.id) ?? [], t.industry)]));

    // Adopción: contra los negocios a los que la función les aplica (o ya la usan),
    // así «Libro CTP» se mide entre aserraderos y «Cupones» entre bodegas.
    const features: FeatureAdoptionRow[] = MODULOS.map((m) => {
      const aplican = tenants.filter((t) => m.para.includes(rubroDe.get(t.id) ?? "bodega") || used.get(t.id)?.has(m.key));
      const n = aplican.filter((t) => used.get(t.id)?.has(m.key)).length;
      return { key: m.key, label: m.label, growth: m.growth, tenantsUsing: n, tenantsEligible: aplican.length, adoptionPct: aplican.length ? Math.round((n / aplican.length) * 100) : 0 };
    }).sort((a, b) => a.adoptionPct - b.adoptionPct);

    const etiqueta = new Map(MODULOS.map((m) => [m.key, m.label]));
    const gaps: CoachingGap[] = [];
    const perTenant: TenantModules[] = [];
    for (const t of tenants) {
      const set = used.get(t.id) ?? new Set<string>();
      const rubro = rubroDe.get(t.id) ?? "bodega";
      const missing = consejosDeRubro(rubro, set).map((m) => m.label);
      if (missing.length > 0) gaps.push({ tenantId: t.id, tenantName: t.name, tenantSlug: t.slug, rubro, missing, uses: set.size });
      const modules = MODULOS.filter((m) => set.has(m.key)).map((m) => etiqueta.get(m.key) ?? m.key);
      perTenant.push({ tenantId: t.id, tenantName: t.name, tenantSlug: t.slug, rubro, modules, uses: set.size });
    }
    // El que MÁS oportunidades tiene (menos usa) primero.
    gaps.sort((a, b) => b.missing.length - a.missing.length || a.uses - b.uses);
    perTenant.sort((a, b) => b.uses - a.uses || a.tenantName.localeCompare(b.tenantName));

    const avgFeatures = tenants.length ? Math.round((tenants.reduce((s, t) => s + (used.get(t.id)?.size ?? 0), 0) / tenants.length) * 10) / 10 : 0;
    const worst = features.find((f) => f.growth && f.tenantsEligible > 0) ?? null;

    return {
      features,
      gaps,
      tenants: perTenant,
      kpis: {
        tracked: MODULOS.length,
        activeTenants: tenants.length,
        avgFeatures,
        opportunities: gaps.reduce((s, g) => s + g.missing.length, 0),
        worstFeature: worst ? `${worst.label} (${worst.adoptionPct}%)` : null,
        windowDays: VENTANA_DIAS,
      },
    };
  } catch (err) {
    logger.error("[feature-adoption.db] getFeatureAdoption failed", { error: String(err) });
    return VACIO;
  }
}
