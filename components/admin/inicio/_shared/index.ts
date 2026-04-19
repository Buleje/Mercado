/**
 * Shared chart primitives para el admin Inicio.
 *
 * Pattern unificado:
 *  - Row 1: 4-6 StatCards (KPI hero) — del DS
 *  - Row 2: 1 ChartCard FULL-WIDTH con grafico principal (height 340)
 *  - Row 3: 2 ChartCards lado a lado (lg:grid-cols-2, height 260)
 *  - Row 4: 3 micro-insight cards (lg:grid-cols-3) usando MicroDonut + MicroList + MicroGauge
 *  - Row 5: tabla opcional de actividad reciente
 */

export { ChartCard, ChartTooltip, CHART_TOKENS } from "./ChartCard";
export { MicroDonut, type MicroDonutDatum } from "./MicroDonut";
export { MicroList, type MicroListItem } from "./MicroList";
export { MicroGauge } from "./MicroGauge";
export { DashboardSectionHeader } from "./DashboardSectionHeader";
