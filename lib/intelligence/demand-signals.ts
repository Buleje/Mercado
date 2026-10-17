/**
 * lib/intelligence/demand-signals.ts
 *
 * "Inteligencia de Barrio" — motor PURO de detección de demanda del marketplace.
 *
 * Convierte señales reales y cruzadas de TODAS las bodegas (ventas por categoría,
 * quiebres de stock predichos, zona) en una lectura de hacia dónde se mueve la
 * demanda del barrio: qué sube, qué baja, dónde falta producto (demanda
 * insatisfecha) y cómo se reparte por zona.
 *
 * Sin DB, sin I/O: el API arma los `DemandInput` desde Prisma y delega el cálculo
 * acá (testeable con data sintética). Honesto: sólo señales que existen — nada
 * inventado.
 */

// ─── Entrada (pre-agregada por el API desde datos reales) ────────────────────────
export interface DemandInput {
  /** Unidades vendidas por categoría: periodo actual vs anterior (misma duración). */
  categories: { category: string; units: number; prevUnits: number }[];
  /** Por zona: unidades, mezcla por categoría y nº de quiebres predichos. */
  zones: {
    zone: string;
    units: number;
    categoryUnits: { category: string; units: number }[];
    stockouts: number;
  }[];
  /** Quiebres predichos: producto, su categoría y en cuántas bodegas se predice. */
  stockouts: { name: string; category: string | null; tenantCount: number }[];
}

// ─── Salida ──────────────────────────────────────────────────────────────────────
export interface CategoryDemand {
  category: string;
  units: number;
  prevUnits: number;
  /** Variación % vs periodo anterior (redondeada). */
  trendPct: number;
  rising: boolean;
}

export interface ZoneDemand {
  zone: string;
  units: number;
  topCategory: string | null;
  stockouts: number;
}

export interface StockoutSignal {
  name: string;
  category: string | null;
  /** En cuántas bodegas se predice el quiebre (intensidad de la señal). */
  tenantCount: number;
}

export interface UnmetDemand {
  category: string;
  /** % de crecimiento de la demanda de esa categoría. */
  trendPct: number;
  /** Productos de esa categoría que están quebrando stock. */
  stockoutCount: number;
}

export interface DemandReport {
  generatedAt: string;
  period: { label: string; days: number };
  totalUnits: number;
  risingCategories: CategoryDemand[];
  fallingCategories: CategoryDemand[];
  /** Categorías cuya demanda SUBE y a la vez están quebrando stock = oportunidad. */
  unmetDemand: UnmetDemand[];
  byZone: ZoneDemand[];
  stockoutHotspots: StockoutSignal[];
}

const RISING_THRESHOLD = 0; // > 0% vs periodo anterior = subiendo

function trendPct(units: number, prevUnits: number): number {
  if (prevUnits <= 0) return units > 0 ? 100 : 0;
  return Math.round(((units - prevUnits) / prevUnits) * 100);
}

function topCategoryOf(categoryUnits: { category: string; units: number }[]): string | null {
  if (categoryUnits.length === 0) return null;
  return [...categoryUnits].sort((a, b) => b.units - a.units)[0].category;
}

/**
 * Calcula el reporte de demanda del barrio a partir de las señales agregadas.
 */
export function buildDemandReport(
  input: DemandInput,
  now: number,
  periodDays: number,
  periodLabel: string,
): DemandReport {
  const cats: CategoryDemand[] = input.categories.map((c) => {
    const pct = trendPct(c.units, c.prevUnits);
    return { category: c.category, units: c.units, prevUnits: c.prevUnits, trendPct: pct, rising: pct > RISING_THRESHOLD };
  });

  const risingCategories = cats
    .filter((c) => c.rising && c.units > 0)
    .sort((a, b) => b.trendPct - a.trendPct);
  const fallingCategories = cats
    .filter((c) => !c.rising)
    .sort((a, b) => a.trendPct - b.trendPct);

  // Demanda insatisfecha: categorías que SUBEN y tienen quiebres.
  const stockoutByCategory = new Map<string, number>();
  for (const s of input.stockouts) {
    if (!s.category) continue;
    stockoutByCategory.set(s.category, (stockoutByCategory.get(s.category) ?? 0) + s.tenantCount);
  }
  const unmetDemand: UnmetDemand[] = risingCategories
    .filter((c) => stockoutByCategory.has(c.category))
    .map((c) => ({
      category: c.category,
      trendPct: c.trendPct,
      stockoutCount: stockoutByCategory.get(c.category) ?? 0,
    }))
    .sort((a, b) => b.trendPct - a.trendPct);

  const byZone: ZoneDemand[] = [...input.zones]
    .map((z) => ({
      zone: z.zone,
      units: z.units,
      topCategory: topCategoryOf(z.categoryUnits),
      stockouts: z.stockouts,
    }))
    .sort((a, b) => b.units - a.units);

  const stockoutHotspots = [...input.stockouts].sort((a, b) => b.tenantCount - a.tenantCount);

  return {
    generatedAt: new Date(now).toISOString(),
    period: { label: periodLabel, days: periodDays },
    totalUnits: cats.reduce((sum, c) => sum + c.units, 0),
    risingCategories,
    fallingCategories,
    unmetDemand,
    byZone,
    stockoutHotspots,
  };
}
