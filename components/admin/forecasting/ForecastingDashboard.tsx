"use client";

/**
 * Análisis › Predicción: cuánto se va a vender, qué se acaba, quién no vuelve
 * y a qué precio conviene vender.
 *
 * Patrón del panel (11-10, «todo parejo»): UNA fila con título + ⓘ · las
 * secciones · «Más» (Actualizar y el reorden, que vive en Compras). Debajo, UNA
 * sección a la vez, recordada en `?sub=`:
 *   · pronostico «Ventas»          → ventas de la próxima semana, hora pico,
 *                                    mejor día para el proveedor (3 cifras).
 *   · reponer «Stock y compras»    → lo que se agota + top 5 por demanda.
 *   · recuperar «Clientes»         → los que no compran hace 30+ días.
 *   · precios «Precios»            → sugerencias de precio con «Aplicar».
 * Medido antes en main (1280): 1,56 pantallas con siete tarjetas apiladas,
 * cada una con su estilo. Las claves no repiten las de Métricas (`ventas`,
 * `clientes`…): el hub no borra `?sub=` al salir de Predicción.
 *
 * Cada fuente carga por su lado y cada sección muestra SU carga: el pronóstico
 * (`/api/analytics/predictions`, ~0,3 s), el reorden (~4 s) y los precios
 * (~11 s) ya no se esperan entre sí. Antes los dos últimos compartían un solo
 * «cargando» y el top 5 esperaba a los precios.
 *
 * Lo que salió de aquí antes (sigue igual):
 *   · «Ventas Proyectadas — 7 días» (panel A): era UN producto, en unidades
 *     mostradas como soles. Lo reemplaza el pronóstico del negocio.
 *   · «Productos para Reordenar» + Auto-reorden (`ForecastReorden`): está en
 *     Compras › Sugerencias, donde se generan las órdenes. Queda en «Más».
 */

import { useState } from "react";
import { RefreshCw } from "@buleje/design-system/icons";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { CabeceraAnalisis } from "@/components/admin/analisis/CabeceraAnalisis";
import { useMudanzasAnalisis } from "@/components/admin/analisis/use-mudanzas-analisis";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useForecasting, type PanelForecast } from "./use-forecasting";
import { usePredicciones } from "./use-predicciones";
import { ayudaDeSeccion, SECCIONES_PREDICCION, type SeccionPrediccion } from "./prediccion-ayuda";
import { PrediccionAgotan, PrediccionClientes, PrediccionVentas } from "./PrediccionNegocio";
import { ForecastProyeccionPanel } from "./ForecastProyeccion";
import { ForecastPreciosPanel } from "./ForecastPrecios";

const ROTULO: Record<SeccionPrediccion, string> = {
  pronostico: "Ventas",
  reponer: "Stock y compras",
  recuperar: "Clientes",
  precios: "Precios",
};

/** Una carga por fuente: el reorden (~4 s) no espera a los precios (~11 s). */
const PANEL_REORDEN: readonly PanelForecast[] = ["reorder"];
const PANEL_PRECIOS: readonly PanelForecast[] = ["prices"];
const ID_PANEL = "analisis-prediccion-panel";

const conCuenta = (n: number | undefined) => (n && n > 0 ? n : undefined);

export default function ForecastingDashboard() {
  const { vista: seccion, irA } = useSubvistaModulo<SeccionPrediccion>("analisis-prediccion", SECCIONES_PREDICCION, "pronostico");
  const [vuelta, setVuelta] = useState(0);
  const pred = usePredicciones(vuelta);
  const reorden = useForecasting(PANEL_REORDEN);
  const precios = useForecasting(PANEL_PRECIOS);
  const mudanzas = useMudanzasAnalisis(["reorden"]);

  const actualizar = () => {
    setVuelta((v) => v + 1);
    void reorden.cargarDatos();
    void precios.cargarDatos();
  };

  const cuenta: Partial<Record<SeccionPrediccion, number>> = {
    reponer: conCuenta(pred.data?.stockRisk.length),
    recuperar: conCuenta(pred.data?.churnRisk.length),
    precios: precios.state.loading ? undefined : conCuenta(precios.state.prices.length),
  };

  return (
    <div className="space-y-3">
      <CabeceraAnalisis
        titulo="Predicción"
        ayuda={ayudaDeSeccion(seccion, pred.data)}
        secciones={
          <BarraDeSecciones
            secciones={SECCIONES_PREDICCION.map((clave) => ({ clave, rotulo: ROTULO[clave], cuenta: cuenta[clave] }))}
            activa={seccion}
            onCambiar={irA}
            etiqueta="Secciones de Predicción"
            idPanel={ID_PANEL}
          />
        }
        acciones={[
          { id: "recargar", label: "Actualizar", hint: "Vuelve a calcular con las ventas de hoy", icon: RefreshCw, onSelect: actualizar },
          ...mudanzas,
        ]}
        tituloMas="Actualizar y qué reponer (Compras)"
      />

      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}>
        {seccion === "pronostico" && <PrediccionVentas estado={pred} />}
        {seccion === "reponer" && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <PrediccionAgotan estado={pred} />
            <ForecastProyeccionPanel f={reorden} sinProyeccion />
          </div>
        )}
        {seccion === "recuperar" && <PrediccionClientes estado={pred} />}
        {seccion === "precios" && <ForecastPreciosPanel f={precios} />}
      </div>
    </div>
  );
}
