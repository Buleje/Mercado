"use client";

/**
 * Las cifras de Recetas en dos paneles plegables (uno por vista): las de la
 * lista de recetas y las de lo producido en el mes. Sólo cuentas: el costo y el
 * margen de cada receta los calcula el servidor / `margenDe`.
 */
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { resumenDelMes } from "./produccion-calculos";
import { disponibilidadDe, margenDe, type LoteProducido, type ProductInfo, type Receta } from "./tipos";

function Tarjeta({ rotulo, valor, ayuda }: { rotulo: string; valor: string; ayuda?: string }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip what={ayuda} />}
      </div>
      <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</p>
    </div>
  );
}

export function useIndicadoresRecetas(recetas: readonly Receta[], productos: Record<number, ProductInfo>, sinDatosAun: boolean) {
  const activas = recetas.filter((r) => r.activa);
  const costoPromedio = activas.length > 0 ? activas.reduce((s, r) => s + (Number(r.costoTotal) || 0), 0) / activas.length : 0;
  const margenes = activas.map((r) => margenDe(r, productos)).filter((m): m is number => m !== null);
  const margenPromedio = margenes.length > 0 ? Math.round(margenes.reduce((s, m) => s + m, 0) / margenes.length) : null;
  const sinInsumos = activas.filter((r) => disponibilidadDe(r, productos).faltan > 0).length;

  return useKpisPlegables({
    claveMemoria: "recetas-lista",
    alto: "md",
    soloIcono: true,
    anchoFijo: true,
    sinDatosAun,
    resumen: `${activas.length} activa${activas.length === 1 ? "" : "s"} · costo prom. ${formatCurrency(costoPromedio)}`,
    tarjetas: [
      <Tarjeta key="activas" rotulo="Recetas activas" valor={String(activas.length)} />,
      <Tarjeta key="costo" rotulo="Costo promedio por receta" valor={formatCurrency(costoPromedio)} ayuda="Promedio del costo de las recetas activas, con los precios de tus insumos de hoy." />,
      <Tarjeta key="margen" rotulo="Margen promedio" valor={margenPromedio === null ? "—" : `${margenPromedio}%`} ayuda="Sobre el precio de venta del producto final. Sólo cuentan las recetas que tienen producto final y costo." />,
      <Tarjeta key="faltan" rotulo="Con insumos faltantes" valor={String(sinInsumos)} ayuda="Recetas a las que hoy les falta stock de algún ingrediente para hacer una unidad." />,
    ],
  });
}

export function useIndicadoresProduccion(lotes: readonly LoteProducido[], sinDatosAun: boolean) {
  const mes = resumenDelMes(lotes);
  return useKpisPlegables({
    claveMemoria: "recetas-produccion",
    alto: "md",
    soloIcono: true,
    anchoFijo: true,
    sinDatosAun,
    resumen: `${mes.lotes} lote${mes.lotes === 1 ? "" : "s"} en el mes · ${mes.unidades} uds`,
    tarjetas: [
      <Tarjeta key="lotes" rotulo="Lotes del mes" valor={String(mes.lotes)} />,
      <Tarjeta key="uds" rotulo="Unidades producidas" valor={String(mes.unidades)} />,
      <Tarjeta key="costo" rotulo="Costo promedio por lote" valor={formatCurrency(mes.costoPromedio)} ayuda="El costo real de cada lote del mes, promediado." />,
    ],
  });
}
