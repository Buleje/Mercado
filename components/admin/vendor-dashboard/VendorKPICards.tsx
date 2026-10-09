"use client";

/**
 * «Cómo va tu tienda hoy» — la cabecera de la pestaña Marketplace del Inicio.
 *
 * 2026-10-09 (regla R3 del tablero): 4 tarjetas propias → 3 `KpiTile` del
 * Inicio (las mismas de las otras pestañas). Sin «S/ 0.00» de relleno: una
 * venta en cero sale «—» con ⓘ; «Ayer» dejó de ser una tarjeta en cero y pasó a
 * ser la variación y la línea chica de «Ventas hoy». Los pendientes y el
 * stock bajo SÍ muestran el 0, porque ahí el cero es la noticia («estás al día»).
 * Las acciones (antes 3 bloques de color) van en una fila al pie.
 */

import { DashboardSection } from "@/components/admin/inicio/_shared";
import { kpiSinDato } from "@/lib/admin/inicio/hay-datos";
import { cantidad, soles } from "@/lib/admin/inicio/formato-tablero";
import type { VendorKPIs } from "./vendor-dashboard.types";
import { VendorQuickActions } from "./VendorQuickActions";

type Props = {
  kpis: VendorKPIs;
};

/** El endpoint trae como máximo 10 productos con stock bajo: 10 puede ser «10 o más». */
const TOPE_STOCK_BAJO = 10;

function variacion(hoy: number, base: number): number | null {
  return base > 0 ? ((hoy - base) / base) * 100 : null;
}

export function VendorKPICards({ kpis }: Props) {
  const { salesToday: hoy, salesYesterday: ayer, salesLastWeek: semPasada, pendingOrdersCount: pendientes, lowStockCount: bajos } = kpis;

  const referencias = [ayer > 0 ? `Ayer ${soles(ayer)}` : null, semPasada > 0 ? `hace 7 días ${soles(semPasada)}` : null].filter(Boolean);
  const pistaSinVenta = ["Todavía no entra una venta hoy."]
    .concat(ayer > 0 ? [`Ayer vendiste ${soles(ayer)}.`] : [])
    .concat(semPasada > 0 ? [`Hace 7 días: ${soles(semPasada)}.`] : [])
    .join(" ");

  return (
    <DashboardSection
      kicker="Marketplace · hoy"
      title="Cómo va tu tienda hoy"
      kpis={[
        {
          label: "Ventas hoy",
          value: soles(hoy),
          sinDato: kpiSinDato(hoy),
          sinDatoHint: pistaSinVenta,
          delta: variacion(hoy, ayer),
          deltaLabel: "vs ayer",
          hint: "Suma de los pedidos entregados hoy.",
          sub: referencias.length > 0 ? referencias.join(" · ") : undefined,
        },
        {
          label: "Por atender",
          value: cantidad(pendientes),
          tone: pendientes === 0 ? "success" : "warning",
          sub: pendientes === 0 ? "Estás al día" : pendientes <= 3 ? "Atiéndelos pronto" : "Urgente",
          hint: "Pedidos pendientes o confirmados que todavía no salen.",
        },
        {
          label: "Stock bajo",
          value: bajos >= TOPE_STOCK_BAJO ? `${TOPE_STOCK_BAJO}+` : cantidad(bajos),
          tone: bajos === 0 ? "success" : "warning",
          sub: bajos === 0 ? "Todo en buen nivel" : "por reponer",
          hint: "Productos con 5 unidades o menos.",
        },
      ]}
    >
      <VendorQuickActions pendientes={pendientes} />
    </DashboardSection>
  );
}
