"use client";

/**
 * Compras › Sugerencias: UN solo lugar para «qué reponer» (plan «panel
 * unificado», ola 3; fusiones F5 y F7).
 *
 * Arriba, el motor de Compras (`/api/compras/sugerencias`): los productos que
 * llegan a su punto de pedido según lo vendido y, marcándolos, las órdenes por
 * proveedor. Abajo, plegados y diciendo de dónde vienen, los otros dos motores
 * que respondían la misma pregunta con otra cuenta:
 *   · Análisis › Predicción: reorden por la demanda durante el tiempo de
 *     entrega, con «Auto-reorden» (crea órdenes de compra).
 *   · Sugerencias IA › Compras: lo que se acaba según la venta de la semana.
 * Motores distintos dan cifras distintas: se muestran juntos, sin unificar,
 * hasta que Brandon decida. Cada bloque se ve sólo para quien lo veía en su
 * pestaña de antes (`PermisoDe`, regla R2) y no pide datos hasta que lo abres.
 */

import dynamic from "next/dynamic";
import Plegable from "@/components/admin/shared/Plegable";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { usePermisoDe } from "@/hooks/use-vistas-permitidas";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const SugerenciasCompraTab = dynamic(() => import("./SugerenciasCompraTab"), { loading: S });
const ForecastReorden = dynamic(() => import("@/components/admin/forecasting/ForecastReorden"), { ssr: false, loading: S });
const TabCompras = dynamic(() => import("@/components/admin/sugerencias/TabCompras"), { ssr: false, loading: S });

const ORIGEN_COMPRAS = ["compras"] as const;
const ORIGEN_PREDICCION = ["forecasting"] as const;
const ORIGEN_IA = ["sugerencias-ia"] as const;

export default function SugerenciasVista() {
  /* La vista se ofrece también a quien sólo veía Predicción o Sugerencias IA
     (su origen son las 3): el motor de Compras, que genera órdenes, no se le
     regala a quien llegó sólo por ellas. Pero es el contenido PROPIO de la
     vista: si no pasa ninguno de los 3 (un enlace a Compras en un negocio cuya
     plantilla la oculta, como `main`, o el rol que no llegó), se ve como antes
     —es la regla del hub: «si no pasa ninguna, van todas»—. */
  const compras = usePermisoDe(ORIGEN_COMPRAS);
  const prediccion = usePermisoDe(ORIGEN_PREDICCION);
  const ia = usePermisoDe(ORIGEN_IA);
  const verMotor = compras || (!prediccion && !ia);

  return (
    /* `pb-32`: espacio para la barra fija de «Generar órdenes» del motor de
       arriba, que aparece al marcar productos y tapaba el último bloque. */
    <div className="space-y-4 pb-32">
      {verMotor && <SugerenciasCompraTab />}

      <PermisoDe origen={ORIGEN_PREDICCION}>
        <Plegable
          clave="compras:sugerencias:prediccion"
          titulo="Reorden por predicción"
          resumen="Venía de Análisis › Predicción: demanda durante la entrega del proveedor, con Auto-reorden"
        >
          <ForecastReorden />
        </Plegable>
      </PermisoDe>

      <PermisoDe origen={ORIGEN_IA}>
        <Plegable
          clave="compras:sugerencias:ia"
          titulo="Qué se acaba esta semana"
          resumen="Venía de Sugerencias IA › Compras: cuenta con la venta de los últimos 7 días"
        >
          <TabCompras />
        </Plegable>
      </PermisoDe>
    </div>
  );
}
