"use client";

/**
 * Indicadores de Notas de crédito con el patrón del panel (`useKpisPlegables`): el botón va en la
 * fila del título y, plegado, lleva las cifras del mes en una línea. Abierto: la salud de las
 * devoluciones, tres tarjetas y los gráficos. Cada cifra sale una sola vez: la variación contra el
 * mes anterior vive en la tarjeta del monto, no en la franja ni en otra tarjeta.
 */
import { TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { NotasCreditoChart } from "@/components/admin/notas-credito/nc-grafico";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

const TARJETA = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3";
const ROTULO = "mb-1 text-sm font-semibold text-[var(--text-secondary)]";

export function useIndicadoresNc(nc: NotasCreditoVista) {
  const { notas, loading, kpis, trendData, donutData, semaforo, weekdayData } = nc;
  const hay = !loading && notas.length > 0;
  const sube = kpis.trend > 0;
  const borradores = notas.filter((n) => n.status === "BORRADOR").length;
  const explicacion =
    semaforo.nivel === "rojo" ? "Las devoluciones subieron más del 50 % contra el mes pasado"
    : semaforo.nivel === "amarillo" ? "Las devoluciones están un poco por encima del mes pasado"
    : "Todo dentro de lo normal este mes";

  const tarjetas = !hay ? [] : [
    <div key="mes" className={TARJETA}>
      <p className={ROTULO}>Notas este mes</p>
      <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{kpis.count}</p>
      <p className="text-sm text-[var(--text-tertiary)]">{borradores} en borrador sin emitir</p>
    </div>,
    <div key="monto" className={TARJETA}>
      <p className={ROTULO}>Monto devuelto</p>
      <p className="text-lg font-extrabold tabular-nums text-[var(--data-error-ink,var(--data-error-500))]">{formatCurrency(kpis.total)}</p>
      <p className={cn("inline-flex items-center gap-1 text-sm", sube ? "text-[var(--data-error-ink,var(--data-error-500))]" : "text-[var(--text-secondary)]")}>
        {sube ? <TrendingUp className="h-4 w-4" aria-hidden /> : <TrendingDown className="h-4 w-4" aria-hidden />}
        {sube ? "+" : ""}{Number(kpis.trend).toFixed(0)} % contra el mes anterior
      </p>
    </div>,
    <div key="motivo" className={TARJETA}>
      <p className={ROTULO}>Motivo más frecuente</p>
      <p className="truncate text-sm font-bold text-[var(--text-primary)]">{kpis.topMotivo ? kpis.topMotivo[0] : "—"}</p>
    </div>,
  ];

  const encabezado = !hay ? null : (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2 text-sm", semaforo.bg,
        semaforo.nivel === "rojo" ? "border-[var(--data-error-500)]"
        : semaforo.nivel === "amarillo" ? "border-[var(--data-warning-500)]"
        : "border-[var(--data-success-500)]/30")}>
        <span className={cn("inline-flex items-center gap-1.5 font-semibold", semaforo.color)}>
          <semaforo.Icon className="h-4 w-4 shrink-0" aria-hidden />
          Salud de devoluciones: <strong>{semaforo.label}</strong>
        </span>
        <InfoTip
          title="Salud de devoluciones"
          what={explicacion}
          affects="Compara lo devuelto este mes con el mes pasado: más de 20 % arriba es «Atención» y más de 50 % es «Alto»."
          example="Si el mes pasado devolviste S/ 100 y este mes S/ 160, sale «Alto» (+60 %)."
        />
      </div>
      {trendData.length > 2 && <NotasCreditoChart trendData={trendData} donutData={donutData} weekdayData={weekdayData} />}
    </div>
  );

  return useKpisPlegables({
    claveMemoria: "notas-credito",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    resumen: `${kpis.count} este mes · ${formatCurrency(kpis.total)}`,
    tarjetas,
    encabezado,
  });
}
