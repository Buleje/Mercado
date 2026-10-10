"use client";

/**
 * Ventas entregadas de los últimos 7 días (pestaña Marketplace del Inicio).
 *
 * 2026-10-09: se oculta si no hay al menos 2 días con venta (regla R2:
 * `hayTendencia`); antes dibujaba 7 barras en cero. Colores por concepto
 * (teal = ventas, hoy resaltado) en vez de 3 hex; cifra encima de cada barra,
 * días escritos a mano («vie 03») y «Mejor día» como KPI en vez de una barra coral.
 */

import { DashboardSection } from "@/components/admin/inicio/_shared";
import { hayTendencia } from "@/lib/admin/inicio/hay-datos";
import { COLOR_CONCEPTO, fechaConDia, partesDeFecha, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";
import { BarrasMarketplace } from "./BarrasMarketplace";
import { diaCorto } from "./marketplace-metricas";
import type { WeeklyRevenueDay } from "./vendor-dashboard.types";

type Props = {
  data: WeeklyRevenueDay[];
};

/** «vie 03» para la clave «2026-10-03»; el último día es «Hoy». */
function rotuloDia(fecha: string, esHoy: boolean): string {
  if (esHoy) return "Hoy";
  const p = partesDeFecha(fecha);
  if (!p) return fecha;
  const dow = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay();
  return `${diaCorto(dow)} ${String(p.dia).padStart(2, "0")}`;
}

export function VendorWeeklyChart({ data }: Props) {
  const dias = data ?? [];
  const filas = dias.map((d, i) => ({ dia: rotuloDia(d.date, i === dias.length - 1), fecha: d.date, total: d.total, hoy: i === dias.length - 1 }));
  const total = dias.reduce((s, d) => s + d.total, 0);
  const mejor = dias.reduce<WeeklyRevenueDay | null>((best, d) => (d.total > (best?.total ?? 0) ? d : best), null);
  const conVenta = dias.filter((d) => d.total > 0).length;

  return (
    <DashboardSection
      chartId="marketplace.ventas-7-dias"
      hasData={hayTendencia(dias, ["total"])}
      kicker="Ventas entregadas · últimos 7 días"
      title="Tus últimos 7 días"
      description="Suma de los pedidos entregados de cada día; hoy va resaltado."
      kpis={[
        { label: "Total 7 días", value: soles(total) },
        { label: "Mejor día", value: mejor ? soles(mejor.total) : null, sub: mejor ? fechaConDia(mejor.date) : undefined, tone: "success" },
        { label: "Días con venta", value: `${conVenta} de ${dias.length}` },
      ]}
    >
      <BarrasMarketplace
        data={filas}
        xKey="dia"
        series={[{ key: "total", label: "Ventas", color: COLOR_CONCEPTO.ventas }]}
        destacar={(f) => f.hoy === true}
        formatoValor={soles}
        formatoCorto={solesEje}
        tituloTooltip={(f) => fechaConDia(String(f.fecha ?? ""))}
        alto={200}
        ariaLabel={`Ventas entregadas de los últimos 7 días: ${soles(total)}. Mejor día: ${mejor ? `${fechaConDia(mejor.date)}, ${soles(mejor.total)}` : "ninguno"}.`}
      />
    </DashboardSection>
  );
}
