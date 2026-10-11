"use client";

/**
 * Análisis › Métricas: ventas, productos y clientes en gráficos.
 *
 * Patrón del panel (11-10): UNA fila con título + ⓘ · secciones (`?sub=`) ·
 * Indicadores · «Más». Antes era un tercer nivel de pestañas (`AdminTabBar`
 * dentro de la del hub) con una tira de cifras distinta en cada sección, tres
 * de ellas en 0 por leer claves que el endpoint no manda. Las cifras van ahora
 * en un solo panel de Indicadores (`use-indicadores-metricas`).
 * «Predicciones» se mudó a la vista Predicción: el mismo pronóstico de la
 * semana estaba ahí, aquí y en Inteligencia.
 * Las tarjetas y los bloques con carga propia viven en `components/admin/analisis/`.
 */

import { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { m, AnimatePresence } from "@/components/admin/providers";
import { TrendingUp, CreditCard, Users, Trophy, Package, DollarSign, Clock, AlertTriangle, RefreshCw } from "@buleje/design-system/icons";
import ChartManager, { type ChartDefinition } from "@/components/admin/shared/ChartManager";
import ChartsEmptyState from "@/components/admin/shared/ChartsEmptyState";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { CabeceraAnalisis } from "@/components/admin/analisis/CabeceraAnalisis";
import { AnalyticsCard, TabbedCard } from "@/components/admin/analisis/metricas-tarjetas";
import { AnomalyDetectorWrapper, RFMWrapper, StarProductCard, Top10Clientes } from "@/components/admin/analisis/metricas-bloques";
import { useIndicadoresMetricas } from "@/components/admin/analisis/use-indicadores-metricas";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const ABCAnalysisTab = dynamic(() => import("@/components/admin/ABCAnalysisTab"), { loading: S });
const BCGMatrixTab = dynamic(() => import("@/components/admin/BCGMatrixTab"), { loading: S });
const BasketAnalysisTab = dynamic(() => import("@/components/admin/BasketAnalysisTab"), { loading: S });
const PeakHoursTab = dynamic(() => import("@/components/admin/PeakHoursTab"), { loading: S });
const SalesTrendChart = dynamic(() => import("@/components/admin/analytics/SalesTrendChart"), { loading: S });
const VentasHeatmap = dynamic(() => import("@/components/admin/analytics/VentasHeatmap"), { loading: S });
const MarginWaterfallChart = dynamic(() => import("@/components/admin/analytics/MarginWaterfallChart"), { loading: S });
const FiadoAnalyticsPanel = dynamic(() => import("@/components/admin/analytics/FiadoAnalyticsPanel"), { loading: S });
const FiadosRiesgoIA = dynamic(() => import("@/components/admin/fiados/FiadosRiesgoIA"), { loading: S });

/** Lo usa `PeakHoursTab` para su rango. */
export type AnalyticsPeriod = "1d" | "7d" | "30d" | "90d" | "1y";

const SECCIONES = ["resumen", "ventas", "productos", "clientes"] as const;
type Seccion = (typeof SECCIONES)[number];
const ROTULO: Record<Seccion, string> = { resumen: "Resumen", ventas: "Ventas", productos: "Productos", clientes: "Clientes" };
const ID_PANEL = "analisis-metricas-panel";
const PERIODO: AnalyticsPeriod = "30d";

const AYUDA = {
  what: "Tus ventas, productos y clientes en gráficos, con las seis cifras del negocio arriba en Indicadores.",
  affects: "Resumen: tendencia, alertas y los mejores clientes · Ventas: cuándo te compran · Productos: ABC, BCG, márgenes y qué se compra junto · Clientes: segmentos y fiados.",
  example: "En Ventas › Mapa de calor ves que el sábado de 6 a 8 p. m. es tu hora fuerte.",
};

function graficosDe(seccion: Seccion, vuelta: number): ChartDefinition[] {
  switch (seccion) {
    case "resumen":
      return [
        { id: "sales-trend", label: "Tendencia de ventas", description: "Ventas diarias con media móvil y proyección", component: (
          <AnalyticsCard title="Tendencia de ventas" subtitle="Ventas diarias con media móvil y proyección" icon={TrendingUp}>
            <div className="min-h-80"><SalesTrendChart /></div>
          </AnalyticsCard>
        ) },
        { id: "alerts-highlights", label: "Alertas y destacados", description: "Ventas fuera de lo normal y producto estrella", component: (
          <TabbedCard title="Alertas y destacados" subtitle="Lo más importante de un vistazo" icon={AlertTriangle} tabs={[
            { id: "alertas", label: "Alertas de ventas", content: <AnomalyDetectorWrapper refreshKey={vuelta} /> },
            { id: "estrella", label: "Producto estrella", content: <StarProductCard refreshKey={vuelta} /> },
          ]} />
        ) },
        { id: "top-clients", label: "Top 10 clientes", description: "Ranking por gasto total acumulado", component: (
          <AnalyticsCard title="Top 10 clientes" subtitle="Ranking por gasto total acumulado" icon={Trophy}>
            <Top10Clientes refreshKey={vuelta} />
          </AnalyticsCard>
        ) },
      ];
    case "ventas":
      return [
        { id: "ventas-trend", label: "Tendencia de ventas", description: "Ventas diarias con media móvil y predicción", component: (
          <AnalyticsCard title="Tendencia de ventas" subtitle="Ventas diarias con media móvil y predicción" icon={TrendingUp}>
            <div className="min-h-80"><SalesTrendChart /></div>
          </AnalyticsCard>
        ) },
        { id: "ventas-patterns", label: "Patrones de venta", description: "Mapa de calor y distribución por hora", component: (
          <TabbedCard title="Patrones de venta" subtitle="¿Cuándo te compran? Mapa de calor y distribución por hora" icon={Clock} tabs={[
            { id: "heatmap", label: "Mapa de calor", content: <div className="min-h-70"><VentasHeatmap /></div> },
            { id: "horario", label: "Por hora", content: <div className="min-h-70"><PeakHoursTab period={PERIODO} /></div> },
          ]} />
        ) },
      ];
    case "productos":
      return [
        { id: "product-classification", label: "Clasificación de productos", description: "ABC y matriz BCG", component: (
          <TabbedCard title="Clasificación de productos" subtitle="ABC: cuáles generan más ingresos · BCG: en qué etapa de vida están" icon={Package} tabs={[
            { id: "abc", label: "ABC (80/20)", content: <div className="min-h-87.5"><ABCAnalysisTab /></div> },
            { id: "bcg", label: "Matriz BCG", content: <div className="min-h-87.5"><BCGMatrixTab /></div> },
          ]} />
        ) },
        { id: "profitability", label: "Rentabilidad y comportamiento", description: "Márgenes por producto y cesta de compra", component: (
          <TabbedCard title="Rentabilidad y comportamiento" subtitle="Márgenes por producto · Qué se compra junto" icon={DollarSign} tabs={[
            { id: "margenes", label: "Márgenes", content: <div className="min-h-75"><MarginWaterfallChart /></div> },
            { id: "cesta", label: "Cesta de compra", content: <BasketAnalysisTab /> },
          ]} />
        ) },
      ];
    case "clientes":
      return [
        { id: "client-intelligence", label: "Segmentos y ranking", description: "Segmentación RFM y ranking de mejores clientes", component: (
          <TabbedCard title="Segmentos y ranking" subtitle="Por cómo compran (recencia, frecuencia y monto) · los mejores" icon={Users} tabs={[
            { id: "rfm", label: "Segmentos", content: <RFMWrapper refreshKey={vuelta} /> },
            { id: "top10", label: "Top 10", content: <Top10Clientes refreshKey={vuelta} reportEmpty={false} /> },
          ]} />
        ) },
        { id: "fiados-analytics", label: "Fiados: deuda y cobranza", description: "Resumen de deudas y quién te debe", component: (
          <TabbedCard title="Fiados: deuda y cobranza" subtitle="Cuánto te deben, quién paga y quién no" icon={CreditCard} tabs={[
            { id: "resumen-fiados", label: "Resumen", content: <div className="min-h-75"><FiadoAnalyticsPanel /></div> },
            { id: "ia-fiados", label: "Quién te debe", content: <div className="min-h-75"><FiadosRiesgoIA /></div> },
          ]} />
        ) },
      ];
  }
}

export default function AnalyticsBIModule() {
  const { vista: seccion, irA } = useSubvistaModulo<Seccion>("analisis-metricas", SECCIONES, "resumen");
  const [vuelta, setVuelta] = useState(0);
  const kpis = useIndicadoresMetricas(vuelta);

  // Sin NINGUNA venta ni pedido, el estado vacío en vez del muro de gráficos en
  // cero (mismo criterio que Inicio, Brandon 2026-06-21).
  const [datos, setDatos] = useState<"cargando" | "vacio" | "hay">("cargando");
  useEffect(() => {
    let cancelado = false;
    const contar = (url: string, clave: "sales" | "orders") =>
      fetch(url, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => (Array.isArray(d) ? d.length : ((d?.[clave] as unknown[] | undefined)?.length ?? 0)))
        .catch(() => 0);
    Promise.all([contar("/api/sales?limit=1", "sales"), contar("/api/orders?limit=1", "orders")]).then(([v, p]) => {
      if (!cancelado) setDatos(v > 0 || p > 0 ? "hay" : "vacio");
    });
    return () => { cancelado = true; };
  }, [vuelta]);

  return (
    <div className="space-y-4">
      <CabeceraAnalisis
        titulo="Métricas"
        ayuda={AYUDA}
        secciones={
          <BarraDeSecciones
            secciones={SECCIONES.map((clave) => ({ clave, rotulo: ROTULO[clave] }))}
            activa={seccion}
            onCambiar={irA}
            etiqueta="Secciones de Métricas"
            idPanel={ID_PANEL}
          />
        }
        acciones={[{ id: "recargar", label: "Actualizar", hint: "Vuelve a pedir las cifras y los gráficos", icon: RefreshCw, onSelect: () => setVuelta((v) => v + 1) }]}
        tituloMas="Actualizar"
      >
        {kpis.boton}
      </CabeceraAnalisis>

      {kpis.panel}

      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}>
        {datos === "vacio" ? (
          <ChartsEmptyState
            title="Todavía no hay datos para analizar"
            description="Cuando registres tus primeras ventas, aquí verás tendencias, productos top y clientes. No te mostramos gráficos vacíos."
          />
        ) : (
          <AnimatePresence mode="wait">
            <m.div
              key={`${seccion}-${vuelta}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="mx-auto max-w-[1600px]"
            >
              <Suspense fallback={<S />}>
                <ChartManager moduleId={`analytics-${seccion}`} charts={graficosDe(seccion, vuelta)} />
              </Suspense>
            </m.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
