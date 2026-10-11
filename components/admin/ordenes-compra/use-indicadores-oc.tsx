"use client";

/**
 * Las cifras de Órdenes de compra con el patrón de indicadores del panel
 * (`useKpisPlegables`): el botón va en la fila del título y, plegado, dice lo
 * comprado este mes. Antes la tarjeta-cabecera decía «36 órdenes · total
 * acumulado» y la fila de Indicadores lo repetía debajo; ahora cada cifra sale
 * UNA vez, acá. Los conteos por estado viven en los chips de la fila de filtros.
 */
import type { ReactNode } from "react";
import { FileText, Package, PackageCheck, TrendingUp } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

const soles = (n: number) => `S/ ${formatNumber(n, { max: 0 })}`;

interface Tarjeta {
  rotulo: string;
  valor: string;
  sub: string;
  icono: typeof FileText;
  ayuda?: ReactNode;
}

export function useIndicadoresOc(oc: OrdenesCompra) {
  const { kpis, loading, orders } = oc;
  const tarjetas: Tarjeta[] = [
    {
      rotulo: "Este mes",
      valor: soles(kpis.totalMes),
      sub: "órdenes emitidas en el mes",
      icono: TrendingUp,
      ayuda: "Suma de las órdenes creadas este mes (día de Lima), sin las canceladas.",
    },
    {
      rotulo: "Abiertas",
      valor: soles(kpis.montoPorRecibir),
      sub: `${kpis.porRecibir} ${kpis.porRecibir === 1 ? "orden espera" : "órdenes esperan"} mercadería`,
      icono: Package,
      ayuda: "Pendientes, parciales y automáticas, por el total de cada orden (una parcial cuenta entera).",
    },
    {
      rotulo: "Recibidas",
      valor: String(kpis.counts.recibido),
      sub: "cerradas con su mercadería",
      icono: PackageCheck,
    },
    {
      rotulo: "Pedido en total",
      valor: soles(kpis.totalAcumulado),
      sub:
        kpis.canceladas > 0
          ? `sin ${kpis.canceladas} cancelada${kpis.canceladas === 1 ? "" : "s"} por ${soles(kpis.montoCancelado)}`
          : `${kpis.total} ${kpis.total === 1 ? "orden" : "órdenes"}`,
      icono: FileText,
      // Decir qué quedó afuera: un total que baja sin explicación se lee como un error.
      ayuda: "Todas las órdenes menos las canceladas: una orden cancelada no se le compró a nadie.",
    },
  ];

  return useKpisPlegables({
    claveMemoria: "compras-ordenes",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && orders.length === 0,
    /* Corto a propósito: la fila del título lleva secciones, Nueva orden y Más (1280 px). */
    resumen: `Mes ${soles(kpis.totalMes)}`,
    tarjetas: tarjetas.map(({ rotulo, valor, sub, icono: Icono, ayuda }) => (
      <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          {ayuda && <InfoTip what={ayuda} />}
        </div>
        <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</p>
        <p className="text-sm text-[var(--text-secondary)]">{sub}</p>
      </div>
    )),
  });
}
