/**
 * Mock dataset para el dashboard ejecutivo de superadmin.
 *
 * Series deterministas que complementan el endpoint real /api/superadmin/analytics
 * hasta que existan endpoints especificos de series temporales.
 *
 * Generation rules:
 *  - Curva ascendente con ruido leve para simular crecimiento orgánico.
 *  - Dip de fin de semana en series diarias (orders).
 *  - Funnel con tasas de conversion realistas e-commerce SaaS.
 *
 * TODO (ADR futuro): reemplazar con:
 *  - GET /api/superadmin/dashboard/revenue-series?window=12m
 *  - GET /api/superadmin/dashboard/orders-series?window=30d
 *  - GET /api/superadmin/dashboard/top-stores?by=gmv&limit=5
 *  - GET /api/superadmin/dashboard/funnel?window=30d
 *  - GET /api/superadmin/dashboard/latest-active?limit=10
 */

export type RevenueSeriesPoint = {
  month: string;
  revenue: number;
};

export type OrdersSeriesPoint = {
  day: string;
  orders: number;
  label: string;
};

export type TopStore = {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "business" | "enterprise";
  gmv: number;
  orders: number;
};

export type FunnelStep = {
  key: "visitas" | "carritos" | "checkouts" | "pagados";
  label: string;
  value: number;
};

export type ARPUPoint = {
  month: string;
  arpu: number;
};

export type LatestActiveTenant = {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "business" | "enterprise";
  ordersThisMonth: number;
  revenueThisMonth: number;
  lastActiveAt: string; // ISO
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_LABELS = [
  "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic", "Ene", "Feb", "Mar", "Abr",
];

/**
 * Construye 12 meses de revenue que terminan en `currentMRR` con una curva
 * suavemente ascendente. Determinista.
 */
export function buildRevenueSeries(currentMRR: number): RevenueSeriesPoint[] {
  // Curva: empieza en ~45% del MRR actual, crece con pequeñas oscilaciones.
  const factors = [0.45, 0.52, 0.58, 0.61, 0.65, 0.70, 0.76, 0.80, 0.85, 0.91, 0.95, 1.0];
  return MONTH_LABELS.map((month, i) => ({
    month,
    revenue: Math.round(currentMRR * factors[i]!),
  }));
}

/**
 * Construye 30 días de orders con dip de fin de semana. Total apunta a `targetTotal`.
 */
export function buildOrdersSeries(targetTotal: number): OrdersSeriesPoint[] {
  const base = targetTotal / 30;
  const days: OrdersSeriesPoint[] = [];
  // Patrón 30d: L-D × 4 + 2d extra.
  const weekday = (i: number) => i % 7; // 0=L, 5=S, 6=D
  for (let i = 0; i < 30; i++) {
    const w = weekday(i);
    // Weekend dip 65% del promedio; mid-week peak 125%.
    const factor = w === 5 || w === 6 ? 0.65 : w === 2 || w === 3 ? 1.25 : 1.0;
    const noise = ((i * 37) % 11) / 100; // ruido determinista ±5%
    const count = Math.max(0, Math.round(base * factor * (1 + noise - 0.05)));
    days.push({
      day: `D${i + 1}`,
      orders: count,
      label: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][w]!,
    });
  }
  return days;
}

/**
 * Construye sparkline de 6 puntos a partir del valor actual.
 * Útil para StatCard.sparkline sin backend de series.
 */
export function buildSparkline(current: number, trend: "up" | "flat" | "down" = "up"): number[] {
  if (trend === "up") {
    return [current * 0.75, current * 0.82, current * 0.86, current * 0.9, current * 0.95, current];
  }
  if (trend === "down") {
    return [current * 1.2, current * 1.12, current * 1.08, current * 1.04, current * 1.0, current];
  }
  return [current * 0.97, current * 1.02, current * 0.99, current * 1.01, current * 0.98, current];
}

// ── Top Stores (bodegas ficticias Pucallpa) ────────────────────────────────────

export const TOP_STORES_MOCK: TopStore[] = [
  {
    id: "bodega-san-martin",
    name: "Bodega San Martín",
    slug: "bodega-san-martin",
    plan: "enterprise",
    gmv: 48_520,
    orders: 342,
  },
  {
    id: "bodega-el-trebol",
    name: "Bodega El Trébol",
    slug: "bodega-el-trebol",
    plan: "business",
    gmv: 31_180,
    orders: 218,
  },
  {
    id: "minimarket-yarinacocha",
    name: "Mini Market Yarinacocha",
    slug: "minimarket-yarinacocha",
    plan: "business",
    gmv: 22_640,
    orders: 165,
  },
  {
    id: "fruteria-calleria",
    name: "Frutería Callería",
    slug: "fruteria-calleria",
    plan: "pro",
    gmv: 14_890,
    orders: 98,
  },
  {
    id: "bodega-rosita",
    name: "Bodega Rosita",
    slug: "bodega-rosita",
    plan: "pro",
    gmv: 9_730,
    orders: 71,
  },
];

// ── Funnel (tasas realistas) ───────────────────────────────────────────────────

export const FUNNEL_MOCK: FunnelStep[] = [
  { key: "visitas", label: "Visitas", value: 48_400 },
  { key: "carritos", label: "Carritos creados", value: 12_100 }, // 25%
  { key: "checkouts", label: "Checkouts iniciados", value: 3_870 }, // 8%
  { key: "pagados", label: "Pagos completados", value: 2_420 }, // 5%
];

// ── ARPU histórico (últimos 6 meses) ───────────────────────────────────────────

export function buildARPUSeries(currentARPU: number): ARPUPoint[] {
  const factors = [0.78, 0.83, 0.89, 0.93, 0.97, 1.0];
  return ["Nov", "Dic", "Ene", "Feb", "Mar", "Abr"].map((month, i) => ({
    month,
    arpu: Math.round(currentARPU * factors[i]!),
  }));
}

// ── Latest active tenants ──────────────────────────────────────────────────────

function relativeISO(daysAgo: number, hoursAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
}

export const LATEST_ACTIVE_TENANTS: LatestActiveTenant[] = [
  {
    id: "t1",
    name: "Bodega San Martín",
    slug: "bodega-san-martin",
    plan: "enterprise",
    ordersThisMonth: 342,
    revenueThisMonth: 48_520,
    lastActiveAt: relativeISO(0, 2),
  },
  {
    id: "t2",
    name: "Bodega El Trébol",
    slug: "bodega-el-trebol",
    plan: "business",
    ordersThisMonth: 218,
    revenueThisMonth: 31_180,
    lastActiveAt: relativeISO(0, 5),
  },
  {
    id: "t3",
    name: "Mini Market Yarinacocha",
    slug: "minimarket-yarinacocha",
    plan: "business",
    ordersThisMonth: 165,
    revenueThisMonth: 22_640,
    lastActiveAt: relativeISO(0, 8),
  },
  {
    id: "t4",
    name: "Frutería Callería",
    slug: "fruteria-calleria",
    plan: "pro",
    ordersThisMonth: 98,
    revenueThisMonth: 14_890,
    lastActiveAt: relativeISO(1, 0),
  },
  {
    id: "t5",
    name: "Bodega Rosita",
    slug: "bodega-rosita",
    plan: "pro",
    ordersThisMonth: 71,
    revenueThisMonth: 9_730,
    lastActiveAt: relativeISO(1, 4),
  },
  {
    id: "t6",
    name: "Panadería Don Juan",
    slug: "panaderia-don-juan",
    plan: "pro",
    ordersThisMonth: 54,
    revenueThisMonth: 7_210,
    lastActiveAt: relativeISO(1, 10),
  },
  {
    id: "t7",
    name: "Licorería Pucallpa",
    slug: "licoreria-pucallpa",
    plan: "pro",
    ordersThisMonth: 41,
    revenueThisMonth: 5_880,
    lastActiveAt: relativeISO(2, 2),
  },
  {
    id: "t8",
    name: "Mercadito Manantay",
    slug: "mercadito-manantay",
    plan: "free",
    ordersThisMonth: 23,
    revenueThisMonth: 2_340,
    lastActiveAt: relativeISO(2, 9),
  },
  {
    id: "t9",
    name: "Bazar Ucayali",
    slug: "bazar-ucayali",
    plan: "free",
    ordersThisMonth: 12,
    revenueThisMonth: 1_180,
    lastActiveAt: relativeISO(3, 1),
  },
  {
    id: "t10",
    name: "Bodega La Marina",
    slug: "bodega-la-marina",
    plan: "free",
    ordersThisMonth: 8,
    revenueThisMonth: 620,
    lastActiveAt: relativeISO(3, 14),
  },
];

// ── Formatters ────────────────────────────────────────────────────────────────

export const fmtSoles = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(n);

export const fmtNumber = (n: number) =>
  new Intl.NumberFormat("es-PE").format(n);

export function fmtRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - then) / 60_000));
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD}d`;
}
