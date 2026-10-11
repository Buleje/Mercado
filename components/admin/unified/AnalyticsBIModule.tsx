"use client";

/**
 * Análisis › Métricas: ventas, productos y clientes en gráficos.
 *
 * Patrón del panel (11-10): UNA fila con título + ⓘ · secciones (`?sub=`) ·
 * Indicadores · «Más». Las cifras van en un solo panel de Indicadores
 * (`use-indicadores-metricas`).
 *
 * Cada sección es UNA tarjeta con un gráfico a la vista a la vez
 * (`PanelDeGraficos`), no tarjetas apiladas (Brandon 11-10: «muchos datos →
 * secciones»). Medido antes: Resumen 1,51 pantallas, Ventas 1,82, Productos
 * 2,4, Clientes 1,55. La sección Resumen se repartió: la tendencia y las
 * alertas eran de Ventas (la tendencia estaba DOS veces), el producto estrella
 * de Productos y el Top 10 de Clientes (también dos veces). `?sub=resumen`
 * viejo cae en Ventas. El enlace a los segmentos (vivían en Campañas) pasó a
 * «Más». El período es uno para todos los gráficos que lo usan y se recuerda.
 */

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { m, AnimatePresence } from "@/components/admin/providers";
import { RefreshCw, Users } from "@buleje/design-system/icons";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { CabeceraAnalisis } from "@/components/admin/analisis/CabeceraAnalisis";
import {
  PanelDeGraficos, ProveedorPeriodo, PERIODOS, VacioMetricas,
  type GraficoMetricas, type PeriodoMetricas,
} from "@/components/admin/analisis/metricas-tarjetas";
import { AnomalyDetectorWrapper, StarProductCard, Top10Clientes } from "@/components/admin/analisis/metricas-bloques";
import { useIndicadoresMetricas } from "@/components/admin/analisis/use-indicadores-metricas";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useLocalStorage } from "@/hooks/use-local-storage";
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

const SECCIONES = ["ventas", "productos", "clientes"] as const;
type Seccion = (typeof SECCIONES)[number];
const ROTULO: Record<Seccion, string> = { ventas: "Ventas", productos: "Productos", clientes: "Clientes" };
const ID_PANEL = "analisis-metricas-panel";

const AYUDA = {
  what: "Tus ventas, productos y clientes en gráficos, uno a la vez, con las seis cifras del negocio en Indicadores.",
  affects: "Ventas: tendencia, cuándo te compran y días fuera de lo normal · Productos: estrella, ABC, BCG, márgenes y qué se compra junto · Clientes: los mejores y los fiados.",
  example: "En Ventas › Mapa de calor ves que el sábado de 6 a 8 p. m. es tu hora fuerte.",
};

function graficosDe(seccion: Seccion, vuelta: number, periodo: PeriodoMetricas): GraficoMetricas[] {
  switch (seccion) {
    case "ventas":
      return [
        { clave: "tendencia", rotulo: "Tendencia", conPeriodo: true, ayuda: "Lo vendido cada día, con la media de 7 días y hacia dónde va si sigues igual.", contenido: <div className="min-h-80"><SalesTrendChart period={periodo} /></div> },
        { clave: "calor", rotulo: "Mapa de calor", conPeriodo: true, ayuda: "Qué día y a qué hora te compran más: el cuadro más oscuro es tu hora fuerte.", contenido: <div className="min-h-70"><VentasHeatmap period={periodo} /></div> },
        { clave: "hora", rotulo: "Por hora", conPeriodo: true, ayuda: "Cuántas ventas haces en cada hora del día, para saber cuándo reforzar la atención.", contenido: <div className="min-h-70"><PeakHoursTab period={periodo} vista="horas" /></div> },
        { clave: "dia", rotulo: "Por día", conPeriodo: true, ayuda: "Cuántas ventas haces cada día de la semana.", contenido: <div className="min-h-70"><PeakHoursTab period={periodo} vista="dias" /></div> },
        { clave: "alertas", rotulo: "Alertas", ayuda: "Días con ventas muy por encima o por debajo de lo normal. Necesita al menos 10 días con ventas.", contenido: <AnomalyDetectorWrapper refreshKey={vuelta} /> },
      ];
    case "productos":
      return [
        { clave: "estrella", rotulo: "Estrella", ayuda: "El producto que más te deja este mes.", contenido: <StarProductCard refreshKey={vuelta} /> },
        { clave: "abc", rotulo: "ABC (80/20)", ayuda: "Clase A: los pocos productos que hacen el 80 % de tus ingresos; C: los que casi no pesan. Toca una clase para filtrar.", contenido: <ABCAnalysisTab /> },
        { clave: "bcg", rotulo: "Matriz BCG", ayuda: "En qué etapa está cada producto: crece y vende mucho (estrella), vende mucho sin crecer (vaca), crece poco (perro) o es una apuesta (interrogante).", contenido: <BCGMatrixTab /> },
        { clave: "margenes", rotulo: "Márgenes", ayuda: "De lo que vendes, cuánto se va en mercadería y gastos y cuánto te queda; y qué productos dejan más margen.", contenido: <div className="min-h-75"><MarginWaterfallChart /></div> },
        { clave: "cesta", rotulo: "Cesta", conPeriodo: true, ayuda: "Qué productos se compran juntos: sirve para ponerlos cerca o armar combos.", contenido: <BasketAnalysisTab period={periodo} /> },
      ];
    case "clientes":
      return [
        { clave: "top10", rotulo: "Mejores clientes", ayuda: "Los 10 que más te han comprado en total.", contenido: <Top10Clientes refreshKey={vuelta} /> },
        { clave: "fiados", rotulo: "Fiados", ayuda: "Cuánto se venció, cuánto cobraste este mes y cómo vienes recuperando lo fiado.", contenido: <div className="min-h-75"><FiadoAnalyticsPanel /></div> },
        { clave: "riesgo", rotulo: "Quién te debe", ayuda: "Cada cliente con deuda y qué tan probable es que te pague.", contenido: <div className="min-h-75"><FiadosRiesgoIA /></div> },
      ];
  }
}

export default function AnalyticsBIModule() {
  const { vista: seccion, irA } = useSubvistaModulo<Seccion>("analisis-metricas", SECCIONES, "ventas", undefined, {
    alias: { resumen: "ventas" },
  });
  const [vuelta, setVuelta] = useState(0);
  const kpis = useIndicadoresMetricas(vuelta);
  // El gráfico elegido en cada sección y el período: se recuerdan (claves
  // `admin-*`, las que borra medir-orden-admin antes de medir).
  const [elegidos, setElegidos] = useLocalStorage<Partial<Record<Seccion, string>>>("admin-analisis-graficos", {});
  const [periodoGuardado, setPeriodo] = useLocalStorage<PeriodoMetricas>("admin-analisis-periodo", "30d");
  const periodo = PERIODOS.some((p) => p.clave === periodoGuardado) ? periodoGuardado : "30d";

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

  const graficos = graficosDe(seccion, vuelta, periodo);
  const activo = graficos.find((g) => g.clave === elegidos[seccion])?.clave ?? graficos[0].clave;

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
        acciones={[
          { id: "recargar", label: "Actualizar", hint: "Vuelve a pedir las cifras y los gráficos", icon: RefreshCw, onSelect: () => setVuelta((v) => v + 1) },
          { id: "segmentos", label: "Segmentos de clientes", hint: "Los mejores, fieles, en riesgo y dormidos, en Campañas", icon: Users, onSelect: () => { irAEnlace("/admin?tab=campanas&vista=rfm"); } },
        ]}
        tituloMas="Actualizar y segmentos de clientes"
      >
        {kpis.boton}
      </CabeceraAnalisis>

      {kpis.panel}

      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}>
        <ProveedorPeriodo value={{ periodo, cambiar: setPeriodo }}>
          {datos === "vacio" ? (
            <VacioMetricas titulo="Todavía no hay ventas para analizar" descripcion="Con tus primeras ventas aquí verás tendencias, productos y clientes." />
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
                <PanelDeGraficos
                  id={`metricas-${seccion}`}
                  etiqueta={`Gráficos de ${ROTULO[seccion]}`}
                  graficos={graficos}
                  activo={activo}
                  onCambiar={(clave) => setElegidos((e) => ({ ...e, [seccion]: clave }))}
                />
              </m.div>
            </AnimatePresence>
          )}
        </ProveedorPeriodo>
      </div>
    </div>
  );
}
