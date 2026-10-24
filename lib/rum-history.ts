import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";

/**
 * RUM history por tenant — rollup diario de Core Web Vitals REALES de los
 * clientes del storefront, reportados por `components/WebVitalsReporter.tsx`
 * vía beacon a POST /api/analytics/vitals.
 *
 * Storage: `PlatformSetting` con key `rum-history:{tenantId}` (columna Json).
 * DESVIACIÓN DELIBERADA del contrato "PlatformSetting es global": es data
 * per-tenant en el KV global vía prefijo de key — la alternativa era una
 * migración de schema (fricción pooler/DIRECT_URL) para una feature aún no
 * validada. Si el historial demuestra valor, promover a tabla propia con
 * expand→migrate→contract (skill migration-planner).
 *
 * Precisión: promedios diarios + conteo por rating. El read-modify-write
 * puede perder samples con writes concurrentes cross-instancia — aceptable
 * para tendencias de performance; NO copiar este patrón para dinero.
 *
 * Unidades: lcp/inp/ttfb en ms (crudo de web-vitals), cls sin unidad.
 */

export type RumMetric = "lcp" | "cls" | "inp" | "ttfb";
export type RumRating = "good" | "needs-improvement" | "poor";

export interface RumDayAgg {
  sum: number;
  n: number;
  good: number;
  regular: number;
  poor: number;
}

export type RumDay = Partial<Record<RumMetric, RumDayAgg>>;

export interface RumHistory {
  /** "YYYY-MM-DD" → agregados del día por métrica. */
  days: Record<string, RumDay>;
}

export interface RumSample {
  metric: RumMetric;
  value: number;
  rating: RumRating;
}

const KEY_PREFIX = "rum-history:";
const MAX_DAYS = 30;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function prune(history: RumHistory): RumHistory {
  const keys = Object.keys(history.days).sort();
  while (keys.length > MAX_DAYS) {
    const oldest = keys.shift();
    if (oldest) delete history.days[oldest];
  }
  return history;
}

export async function getRumHistory(tenantId: string): Promise<RumHistory> {
  const stored = await PlatformSettingsDB.get<RumHistory>(`${KEY_PREFIX}${tenantId}`);
  if (stored && typeof stored === "object" && stored.days && typeof stored.days === "object") {
    return stored;
  }
  return { days: {} };
}

export async function recordRumSamples(tenantId: string, samples: RumSample[]): Promise<void> {
  if (samples.length === 0) return;
  const history = await getRumHistory(tenantId);
  const day = (history.days[todayKey()] ??= {});
  for (const s of samples) {
    const agg = (day[s.metric] ??= { sum: 0, n: 0, good: 0, regular: 0, poor: 0 });
    agg.sum += s.value;
    agg.n += 1;
    if (s.rating === "good") agg.good += 1;
    else if (s.rating === "poor") agg.poor += 1;
    else agg.regular += 1;
  }
  await PlatformSettingsDB.set(`${KEY_PREFIX}${tenantId}`, prune(history), "rum-reporter");
}
