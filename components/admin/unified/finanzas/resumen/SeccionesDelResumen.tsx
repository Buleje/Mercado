"use client";

/**
 * Las secciones del Resumen de Mi Plata: una a la vista a la vez (ley 11 de la
 * vista, Brandon 2026-10-11: «en caso de haber muchos datos… hacer secciones
 * para que se simplifique y clasifique mejor la información»).
 *
 * ANTES (medido el 11-10 a 1280 px en `main`): debajo de las cinco cifras había
 * NUEVE bloques desplegables apilados —Ingresos/costos/utilidad, Gastos e
 * ingresos por tipo, Flujo de caja, Proyección, IGV, Salud, Deudas y fiados,
 * Detector de fugas y Esta semana y el presupuesto—, cada uno con su fila.
 * Ahora se agrupan por la pregunta que contestan, en seis secciones recordadas
 * en `?sub=`. Nada se borró: cada bloque vive en una sección, abierto.
 */

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import type { SeccionDeBarra } from "@/components/admin/shared/BarraDeSecciones";
import type { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import type { calcHealthScore } from "@/components/admin/finanzas/shared";
import GraficoIngresosGastos from "./GraficoIngresosGastos";
import DonutsGastosYPagos from "./DonutsGastosYPagos";
import FlujoCajaDiario from "./FlujoCajaDiario";
import ProyeccionDelMes from "./ProyeccionDelMes";
import ResumenFiscal from "./ResumenFiscal";
import DeudasYCobros from "./DeudasYCobros";
import { IndicadoresDeSalud, SaludDelNegocio } from "./SaludFinanciera";
import BloquePlegable from "./BloquePlegable";
import type { Deudor, DiaFlujo, Fiscal, MesResumen, Porcion, Proyeccion } from "./tipos";

const MoneyLeakDetector = dynamic(() => import("@/components/admin/MoneyLeakDetector"), { loading: S });
const WeeklyReportCard = dynamic(() => import("@/components/admin/WeeklyReportCard"), { loading: S });
const BudgetAlertWidget = dynamic(() => import("@/components/admin/BudgetAlertWidget"), { loading: S });

export type SeccionResumen = "meses" | "por-tipo" | "dia-a-dia" | "cierre" | "deudas" | "salud";

/** El orden es el de la pregunta: cómo viene, en qué se va, el día, el cierre, quién debe, cómo está. */
export const SECCIONES_RESUMEN: readonly SeccionDeBarra<SeccionResumen>[] = [
  { clave: "meses", rotulo: "Seis meses" },
  { clave: "por-tipo", rotulo: "Por tipo" },
  { clave: "dia-a-dia", rotulo: "Día a día" },
  { clave: "cierre", rotulo: "Cierre del mes" },
  { clave: "deudas", rotulo: "Deudas" },
  { clave: "salud", rotulo: "Salud" },
];
export const CLAVES_RESUMEN: readonly SeccionResumen[] = SECCIONES_RESUMEN.map((s) => s.clave);
/** El `tabpanel` que cambia con la barra de secciones del Resumen. */
export const ID_PANEL_RESUMEN = "plata-resumen-seccion";

type Puntaje = ReturnType<typeof calcHealthScore>;

export interface DatosDeSeccion {
  monthlyData: MesResumen[];
  expensesByCategory: Porcion[];
  paymentMethods: Porcion[];
  cashFlow: DiaFlujo[];
  projection: Proyeccion | null;
  fiscal: Fiscal | null;
  topPayables: Deudor[];
  topFiados: Deudor[];
  healthScore: Puntaje | null;
  motivoSinLiquidez: string;
  finFavs: ReturnType<typeof useFavoriteCharts>;
  setExpandedChart: (id: string) => void;
  /** Cambia con «Actualizar»: los bloques con su propio pedido (fugas, semana, presupuesto) se vuelven a pedir. */
  vuelta: number;
}

/** Una frase cuando la sección no tiene nada que mostrar (regla: estado vacío = una frase). */
function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
      {children}
    </p>
  );
}

export default function ContenidoDeSeccion({ seccion, d }: { seccion: SeccionResumen; d: DatosDeSeccion }) {
  switch (seccion) {
    case "meses":
      return d.monthlyData.length > 0
        ? <GraficoIngresosGastos monthlyData={d.monthlyData} finFavs={d.finFavs} setExpandedChart={d.setExpandedChart} />
        : <Vacio>Todavía no hay meses con ventas o gastos.</Vacio>;

    /* En qué se va la plata: por tipo, qué categoría se disparó y contra el presupuesto. */
    case "por-tipo":
      return (
        <div className="space-y-4">
          <DonutsGastosYPagos expensesByCategory={d.expensesByCategory} paymentMethods={d.paymentMethods} finFavs={d.finFavs} setExpandedChart={d.setExpandedChart} />
          <MoneyLeakDetector key={`fugas-${d.vuelta}`} />
          <BudgetAlertWidget key={`presupuesto-${d.vuelta}`} />
        </div>
      );

    /* Los últimos 30 días y la última semana. */
    case "dia-a-dia":
      return (
        <div className="space-y-4">
          {d.cashFlow.some((x) => x.ingresos > 0 || x.gastos > 0)
            ? <FlujoCajaDiario cashFlow={d.cashFlow} finFavs={d.finFavs} setExpandedChart={d.setExpandedChart} />
            : <Vacio>Sin ventas ni gastos en los últimos 30 días.</Vacio>}
          <WeeklyReportCard key={`semana-${d.vuelta}`} />
        </div>
      );

    /* Cómo cierra el mes: a qué ritmo va y cuánto IGV deja. */
    case "cierre":
      return d.projection || d.fiscal ? (
        <div className="space-y-4">
          <ProyeccionDelMes projection={d.projection} />
          <ResumenFiscal fiscal={d.fiscal} />
        </div>
      ) : (
        <Vacio>No se pudo leer la proyección ni el IGV del mes.</Vacio>
      );

    case "deudas":
      return <DeudasYCobros topPayables={d.topPayables} topFiados={d.topFiados} />;

    /* Los indicadores y el puntaje hablan de lo mismo: un solo bloque. */
    case "salud":
      return d.healthScore ? (
        <BloquePlegable id="salud" titulo="Salud del negocio">
          <div className="space-y-6">
            <IndicadoresDeSalud healthScore={d.healthScore} motivoSinLiquidez={d.motivoSinLiquidez} />
            <SaludDelNegocio healthScore={d.healthScore} monthlyData={d.monthlyData} motivoSinLiquidez={d.motivoSinLiquidez} />
          </div>
        </BloquePlegable>
      ) : (
        <Vacio>Todavía no hay datos para el puntaje de salud.</Vacio>
      );
  }
}
