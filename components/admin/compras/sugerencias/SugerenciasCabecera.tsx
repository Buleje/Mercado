"use client";

import { SectionTitle, StatCard } from "@buleje/design-system";
import { AlertTriangle, Clock, Package, RefreshCw, ShoppingCart } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SugerenciasCompra } from "./use-sugerencias-compra";

const VENTANAS: ReadonlyArray<{ dias: number; rotulo: string }> = [
  { dias: 30, rotulo: "Últimos 30 días" },
  { dias: 60, rotulo: "Últimos 60 días" },
  { dias: 90, rotulo: "Últimos 90 días" },
  { dias: 180, rotulo: "Últimos 6 meses" },
];

/**
 * La cabecera de Sugerencias en UNA fila (patrón del panel, 10-10): título · ⓘ
 * · Indicadores · ventana de análisis · Recalcular. Antes era una tarjeta con
 * degradado, ícono de 48 px y un párrafo, y debajo 4 tarjetas de cifras
 * siempre abiertas: ahora esas 4 cifras viven en «Indicadores», con su titular
 * a la vista.
 */
export function useSugerenciasCabecera(sc: SugerenciasCompra) {
  const { stats, resumen, ventanaDias, setVentanaDias, refreshing, load, loading, sugerencias } = sc;
  const costo = resumen && resumen.costoEstimado > 0 ? `S/${formatNumber(Math.round(resumen.costoEstimado))}` : null;
  const unidades = `${formatNumber(stats.totalSuggested)} unidades`;
  const kpis = useKpisPlegables({
    claveMemoria: "compras-sugerencias",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: loading,
    resumen: costo ? `${stats.total} por pedir · ${costo}` : `${stats.total} por pedir`,
    tarjetas: [
      <StatCard key="c" label="Críticos" value={stats.counts.CRITICO} icon={AlertTriangle} emphasis="error" subValue="No llegan a tiempo" />,
      <StatCard key="u" label="Urgentes" value={stats.counts.URGENTE} icon={Clock} emphasis="warning" subValue="Se acaban durante la entrega" />,
      <StatCard key="p" label="A planificar" value={stats.counts.PLANIFICAR} icon={Package} emphasis="success" subValue="Hay margen" />,
      <StatCard
        key="$"
        label="Costo estimado"
        value={costo ?? "—"}
        icon={ShoppingCart}
        // Un «—» sin explicación deja al usuario sin saber si es cero o si
        // falta el dato. El total sólo cubre los productos con precio.
        subValue={resumen && resumen.sinPrecio > 0 ? `${unidades} · sin precio en ${resumen.sinPrecio}` : unidades}
      />,
    ],
  });

  const fila = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div className="flex shrink-0 items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Sugerencias de compra</SectionTitle>
        <InfoTip
          title="Sugerencias de compra"
          what="Lo que se va a acabar antes de que llegue el pedido: venta diaria × días que tarda el proveedor. Marca los productos y se arma una orden por proveedor."
          affects="Las órdenes se crean en Órdenes y recepción con la forma de pago pactada con cada proveedor; las de crédito abren su cuenta en Por pagar."
          example="Comprar cuenta «a reponer» los que están en o bajo el mínimo que fijaste, sin mirar cuánto se vendió: por eso puede darte otro número."
        />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {sugerencias.length > 0 && kpis.boton}
        {/* La ventana manda sobre TODO el cálculo: un almacén que vende
            estacional necesita mirar más atrás que 30 días. */}
        <select
          value={ventanaDias}
          onChange={(e) => setVentanaDias(Number(e.target.value))}
          aria-label="Ventana de análisis"
          className="h-12 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-primary"
        >
          {VENTANAS.map((v) => (
            <option key={v.dias} value={v.dias}>{v.rotulo}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label="Recalcular"
          title="Recalcular con lo vendido hasta ahora"
          className={button({ variant: "secondary", className: "w-12 shrink-0 rounded-xl px-0" })}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
        </button>
      </div>
    </div>
  );
  return { fila, panel: sugerencias.length > 0 ? kpis.panel : null };
}
