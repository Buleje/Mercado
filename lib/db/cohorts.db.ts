import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { logger } from "@/lib/logger";

/**
 * lib/db/cohorts.db.ts — Cohortes & retención (Brandon 2026-06-19). Agrupa los
 * negocios por mes de alta (cohorte) y mide, mes a mes, qué % sigue ACTIVO
 * (tuvo actividad en el ActivityLog). Muestra dónde se caen los negocios.
 * Datos reales: Tenant.createdAt + ActivityLog. Nada inventado.
 */

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const idx = (y: number, m0: number) => y * 12 + m0; // m0 = 0..11
const label = (i: number) => `${MONTHS_ES[i % 12]} ${Math.floor(i / 12)}`;

export interface CohortRow { month: string; size: number; retention: (number | null)[] }
export interface CohortResult {
  cohorts: CohortRow[];
  maxMonths: number;
  kpis: { tenants: number; cohorts: number; m1Retention: number | null; activeNow: number };
}

export async function getCohortRetention(): Promise<CohortResult> {
  "use cache";
  // [PERF] Cache server-side: este endpoint superadmin escaneaba TODO ActivityLog
  // (DISTINCT tenantId,mes) en CADA carga del dashboard (route no-store). El
  // resultado no cambia minuto a minuto → cacheamos 10min (stale 30min). Mismo
  // cómputo, sin re-scan por request. Invalidable vía cacheTag "superadmin:cohorts".
  cacheLife({ revalidate: 600, stale: 1800 });
  cacheTag("superadmin:cohorts");
  try {
    const [tenants, activity] = await Promise.all([
      prisma.tenant.findMany({ select: { id: true, createdAt: true } }),
      prisma.$queryRawUnsafe<Array<{ tenantId: string; ym: string }>>(
        `SELECT DISTINCT "tenantId", to_char("createdAt", 'YYYY-MM') AS ym FROM "ActivityLog"`,
      ),
    ]);

    const active = new Map<string, Set<number>>();
    for (const a of activity) {
      const [y, m] = a.ym.split("-").map(Number);
      if (!y || !m) continue;
      const set = active.get(a.tenantId) ?? new Set<number>();
      set.add(idx(y, m - 1));
      active.set(a.tenantId, set);
    }

    const now = new Date();
    const nowIdx = idx(now.getUTCFullYear(), now.getUTCMonth());

    // cohorte (mes de alta) → lista de tenants
    const byCohort = new Map<number, string[]>();
    for (const t of tenants) {
      const ci = idx(t.createdAt.getUTCFullYear(), t.createdAt.getUTCMonth());
      const list = byCohort.get(ci) ?? [];
      list.push(t.id);
      byCohort.set(ci, list);
    }

    const cohortIdxs = [...byCohort.keys()].sort((a, b) => a - b);
    const maxMonths = cohortIdxs.length ? Math.min(12, nowIdx - cohortIdxs[0]) : 0;

    const cohorts: CohortRow[] = cohortIdxs.map((ci) => {
      const ids = byCohort.get(ci)!;
      const span = nowIdx - ci; // meses transcurridos
      const retention: (number | null)[] = [];
      for (let k = 0; k <= maxMonths; k++) {
        if (k > span) { retention.push(null); continue; } // futuro → sin dato
        const activeK = ids.filter((id) => active.get(id)?.has(ci + k)).length;
        retention.push(Math.round((activeK / ids.length) * 100));
      }
      return { month: label(ci), size: ids.length, retention };
    });

    // m1 retention promedio (cohortes que ya tienen M1)
    const m1s = cohorts.map((c) => c.retention[1]).filter((v): v is number => v != null);
    const m1Retention = m1s.length ? Math.round(m1s.reduce((s, v) => s + v, 0) / m1s.length) : null;
    const activeNow = tenants.filter((t) => active.get(t.id)?.has(nowIdx)).length;

    return { cohorts, maxMonths, kpis: { tenants: tenants.length, cohorts: cohorts.length, m1Retention, activeNow } };
  } catch (err) {
    logger.error("[cohorts.db] getCohortRetention failed", { error: String(err) });
    return { cohorts: [], maxMonths: 0, kpis: { tenants: 0, cohorts: 0, m1Retention: null, activeNow: 0 } };
  }
}
