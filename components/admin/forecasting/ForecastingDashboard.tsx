"use client";

/**
 * Análisis › Predicción: cuánto se va a vender y a qué precio conviene vender.
 *
 * Patrón del panel (11-10): UNA fila con título + ⓘ · «Más» (Actualizar y el
 * reorden, que vive en Compras). Debajo:
 *   1. El pronóstico del negocio entero (`PredictiveAnalyticsTab`,
 *      `/api/analytics/predictions`): ventas de la semana, lo que se agota,
 *      mejor día para el proveedor, clientes que no vuelven, hora pico. Era la
 *      sección «Predicciones» de Métricas.
 *   2. Top 5 por demanda y sugerencias de precio (`ForecastProyeccion` panel D,
 *      `ForecastPrecios`).
 *
 * Lo que salió de aquí:
 *   · «Ventas Proyectadas — 7 días» (panel A): era UN producto, en unidades
 *     mostradas como soles, presentado como el negocio. Lo reemplaza (1).
 *   · «Productos para Reordenar» + Auto-reorden (`ForecastReorden`): el mismo
 *     panel está en Compras › Sugerencias (SugerenciasVista.tsx:51-58), donde
 *     se generan las órdenes. Queda en «Más» para quien puede abrirlo.
 *
 * Piezas: forecast-datos.ts (schemas), use-forecasting.ts (carga),
 * ForecastProyeccion, ForecastReorden (también en Compras), ForecastPrecios,
 * ForecastPiezas.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw } from "@buleje/design-system/icons";
import { CabeceraAnalisis } from "@/components/admin/analisis/CabeceraAnalisis";
import { useMudanzasAnalisis } from "@/components/admin/analisis/use-mudanzas-analisis";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { useForecasting, type PanelForecast } from "./use-forecasting";
import { ForecastProyeccionPanel } from "./ForecastProyeccion";
import { ForecastPreciosPanel } from "./ForecastPrecios";

const PredictiveAnalyticsTab = dynamic(() => import("@/components/admin/PredictiveAnalyticsTab"), { loading: S });

/** Sin «forecast»: ya no se pide el pronóstico de un producto suelto. */
const PANELES: readonly PanelForecast[] = ["reorder", "prices"];

const AYUDA = {
  what: "Cuánto vas a vender la próxima semana, qué productos se agotan, qué día conviene ir al proveedor y a qué precio vender.",
  affects: "Sale de tus ventas de las últimas 4 semanas. Lo que hay que reponer, con auto-reorden, está en Compras › Sugerencias (en «Más»).",
  example: "«Ventas próxima semana S/ 4 820, +6 % vs. el promedio de 4 semanas»: compra un poco más para el sábado.",
};

export default function ForecastingDashboard() {
  const f = useForecasting(PANELES);
  const [vuelta, setVuelta] = useState(0);
  const mudanzas = useMudanzasAnalisis(["reorden"]);

  const actualizar = () => {
    setVuelta((v) => v + 1);
    void f.cargarDatos();
  };

  return (
    <div className="space-y-3">
      <CabeceraAnalisis
        titulo="Predicción"
        ayuda={AYUDA}
        acciones={[
          { id: "recargar", label: "Actualizar", hint: "Vuelve a calcular con las ventas de hoy", icon: RefreshCw, onSelect: actualizar },
          ...mudanzas,
        ]}
        tituloMas="Actualizar y qué reponer (Compras)"
      />

      <PredictiveAnalyticsTab embebido vuelta={vuelta} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ForecastProyeccionPanel f={f} sinProyeccion />
        <ForecastPreciosPanel f={f} />
      </div>
    </div>
  );
}
