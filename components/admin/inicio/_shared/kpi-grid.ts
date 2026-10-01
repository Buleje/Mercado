/**
 * Fila de KPIs del Inicio (Caja / Ventas / Productos / Clientes / Compras).
 *
 * Medido en el navegador el 2026-09-22 (tenant QA, `?tab=inicio&vista=caja`):
 * con 6 columnas a 1366 px la tarjeta mide 165 px y el monto tiene 99 px;
 * «S/ 9,970.00» necesita 123 px, «S/ 12,345.00» 138 y «S/ 123,456.00» 152
 * (fs 21 px, extrabold, tabular). La tarjeta gasta 66 px fijos (padding +
 * ícono + gap), así que 6 en una fila sólo entran desde ≈1700 px de viewport.
 * Debajo van 3 columnas (2 filas parejas): a 1280 px cada tarjeta mide 313 px.
 *
 * A 400 px (2 columnas, fs 20 px) el monto tiene 112 px y «S/ 9,970.00» pide
 * 116: el ícono decorativo del StatCard (20 px + gap 12) es exactamente lo que
 * falta, así que en teléfono cede su sitio al monto. El selector apunta al
 * primer renglón del StatCard (`data-stat-card > div:first-child > svg`), no
 * a la flecha del delta ni al sparkline.
 *
 * El umbral va en rem (106.25rem = 1700 px): Tailwind 4 ordena las `@media` de
 * los breakpoints por valor sólo si comparten unidad; con `min-[1700px]` la
 * regla salía ANTES que `sm:` y perdía la cascada (medido en el navegador).
 */
export const KPI_GRID_6 =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 min-[106.25rem]:grid-cols-6 max-sm:[&_[data-stat-card]>div:first-child>svg]:hidden";

/** Cinco KPIs: 5 en fila desde ≈1500 px (tarjeta ≥ 218 px); antes 3 + 2. */
export const KPI_GRID_5 =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 min-[93.75rem]:grid-cols-5 max-sm:[&_[data-stat-card]>div:first-child>svg]:hidden";
