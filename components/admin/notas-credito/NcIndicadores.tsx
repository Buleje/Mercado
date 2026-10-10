"use client";

import { useId } from "react";
import { formatCurrency } from "@/lib/format";
import { TrendingUp, TrendingDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BotonIndicadores } from "@/components/admin/arqueo/KpisCuadre";
import { NotasCreditoChart } from "@/components/admin/notas-credito/nc-grafico";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

const CLAVE_ABIERTO = "buleje-nc-indicadores-abiertos";

/**
 * Indicadores de Notas de crédito, plegables y recordados (ley de la vista, regla 3): plegados siguen
 * mostrando las cifras en una línea; abiertos suman las 4 tarjetas y los gráficos.
 */
export default function NcIndicadores({ nc }: { nc: NotasCreditoVista }) {
  const {
    notas, loading, kpis, trendData, donutData, semaforo, weekdayData,
  } = nc;
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_ABIERTO, false);
  const panelId = useId();
  if (loading || notas.length === 0) return null;
  const explicacion = semaforo.nivel === "rojo" ? "Las devoluciones subieron más del 50% vs el mes pasado" :
    semaforo.nivel === "amarillo" ? "Las devoluciones están un poco por encima del mes pasado" :
    "Todo dentro de lo normal este mes";
  return (
    <section aria-label="Indicadores de notas de crédito" className="space-y-3">
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-2 text-sm", semaforo.bg,
        semaforo.nivel === "rojo" ? "border-[var(--data-error-500)]" :
        semaforo.nivel === "amarillo" ? "border-[var(--data-warning-500)]" :
        "border-[var(--data-success-500)]/30")}>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1.5 font-semibold", semaforo.color)}>
            <semaforo.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            Salud de devoluciones: <strong>{semaforo.label}</strong>
          </span>
          <InfoTip
            title="Salud de devoluciones"
            what={explicacion}
            affects="Compara lo devuelto este mes con el mes pasado: más de 20 % arriba es «Atención» y más de 50 % es «Alto»."
            example="Si el mes pasado devolviste S/ 100 y este mes S/ 160, sale «Alto» (+60 %)."
          />
        </span>
        <span className="text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">{kpis.count}</strong> NC este mes</span>
        <span className="text-[var(--text-secondary)]"><strong className="text-[var(--text-primary)]">{formatCurrency(kpis.total)}</strong> devuelto</span>
        <span className="text-[var(--text-secondary)]">
          <strong className={kpis.trend > 0 ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)]"}>{kpis.trend > 0 ? "+" : ""}{Number(kpis.trend).toFixed(0)}%</strong> vs mes anterior
        </span>
        <span className="ml-auto">
          <BotonIndicadores abierto={abierto} onAlternar={() => setAbierto((a) => !a)} controla={panelId} />
        </span>
      </div>
      {abierto && (
        <div id={panelId} className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-1">NC este mes</p>
              <p className="text-2xl font-extrabold text-[var(--text-primary)]">{kpis.count}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{notas.filter(nc => nc.status === "BORRADOR").length} borradores pendientes</p>
            </div>
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-1">Monto devuelto</p>
              <p className="text-2xl font-extrabold text-[var(--data-error-500)]">{formatCurrency(kpis.total)}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">solo NCs emitidas este mes</p>
            </div>
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-1">vs Mes anterior</p>
              <div className="flex items-center gap-1">
                {kpis.trend > 0 ? <TrendingUp className="h-4 w-4 text-[var(--data-error-500)]" /> : <TrendingDown className="h-4 w-4 text-[var(--data-success-500)]" />}
                <p className={cn("text-2xl font-extrabold", kpis.trend > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]")}>{kpis.trend > 0 ? "+" : ""}{Number(kpis.trend).toFixed(0)}%</p>
              </div>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">{kpis.trend > 0 ? "subió" : "bajó"} respecto al mes pasado</p>
            </div>
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3">
              <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] mb-1">Top motivo</p>
              <p className="text-sm font-bold text-[var(--text-primary)] truncate">{kpis.topMotivo ? kpis.topMotivo[0] : "\u2014"}</p>
              {kpis.topMotivo && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{kpis.topMotivo[1]} casos este mes</p>}
            </div>
          </div>
          {trendData.length > 2 && (
            <NotasCreditoChart
              trendData={trendData}
              donutData={donutData}
              weekdayData={weekdayData}
            />
          )}
        </div>
      )}
    </section>
  );
}
