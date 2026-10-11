"use client";

/**
 * Mi Plata › Movimientos › Gastos y presupuesto — en SECCIONES (`?sub=`).
 *
 * Hasta el 11-10 era una pila: la lista de gastos arriba y, debajo, tres
 * bloques plegables (el presupuesto, el catálogo de fijos y el historial que
 * llegó de Compras). Brandon (11-10): «muchos datos → secciones, una cosa a la
 * vista a la vez, clasificada». Ahora la cabecera de la vista —«Gastos» + ⓘ,
 * las secciones y, a la derecha, lo de cada una— es UNA fila, y debajo se ve
 * una sola sección:
 *
 *   Anotados     la lista del período (ExpensesTab), con «Anotar gasto».
 *   Presupuesto  el techo por rubro del mes (PresupuestoMensualTab).
 *   Metas        meta de ventas y máximo de gastos contra lo real (BudgetVsRealTab).
 *   Fijos        el catálogo de gastos fijos (llegó de Compras › Comprar).
 *   Con compras  el historial de gastos y compras recibidas (llegó de Compras).
 *
 * Nada se borró: cada bloque es el mismo componente de antes. Hay TRES
 * presupuestos (el del mes, el de Compras y el mensual por categoría):
 * unificarlos es la decisión 7 de Brandon y no se toca.
 *
 * Permisos (como antes): Fijos y Con compras sólo para quien veía Compras; lo
 * propio con el `origen` del resto de Mi Plata, o si no pasa ninguno de los
 * dos (la regla del hub). El servidor los sigue cerrando sólo a admin.
 *
 * `?vista=presupuesto` (dirección vieja, ver `estructura.ts`) abre en la
 * sección Presupuesto.
 */

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { RefreshCw } from "@buleje/design-system/icons";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { CabeceraVista } from "@/components/admin/inventario/movimientos/CabeceraVista";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { usePermisoDe } from "@/hooks/use-vistas-permitidas";

const ExpensesTab = dynamic(() => import("@/components/admin/ExpensesTab"), { loading: S });
const BudgetVsRealTab = dynamic(() => import("@/components/admin/BudgetVsRealTab"), { loading: S });
const PresupuestoMensualTab = dynamic(() => import("@/components/admin/finanzas/PresupuestoMensualTab"), { loading: S });
const CatalogoDeGastosFijos = dynamic(() => import("./gastos/CatalogoDeGastosFijos"), { loading: S });
const HistorialGastosTab = dynamic(() => import("@/components/admin/compras/HistorialGastosTab"), { loading: S });

/** Las secciones de la vista (`?sub=`), en el orden de la barra. */
export const SUBS_GASTOS = ["anotados", "presupuesto", "metas", "fijos", "historial"] as const;
export type SubGastos = (typeof SUBS_GASTOS)[number];

const ROTULO: Record<SubGastos, string> = {
  anotados: "Anotados",
  presupuesto: "Presupuesto",
  metas: "Metas",
  fijos: "Fijos",
  historial: "Compras",
};
/** Las que llegaron de Compras: sólo para quien veía Compras. */
const DE_COMPRAS: readonly SubGastos[] = ["fijos", "historial"];

const MODULE_ID = "plata-gastos";
const ID_PANEL = "panel-plata-gastos";
/** Quién ve los gastos y el presupuesto propios: el mismo `origen` del resto de Mi Plata. */
const ORIGEN_PROPIO = ["plata", "activos"] as const;
const ORIGEN_COMPRAS = ["compras"] as const;

interface Props {
  /** Se entró por `?vista=presupuesto`: abrir en la sección Presupuesto. */
  pedidoPorUrl: boolean;
  /** Si hay categorías de presupuesto cargadas. `undefined` = todavía no se sabe. */
  hayPresupuesto: boolean | undefined;
}

export default function GastosConPresupuesto({ pedidoPorUrl, hayPresupuesto }: Props) {
  const veCompras = usePermisoDe(ORIGEN_COMPRAS);
  /* La vista se abre también a quien veía Compras (por lo que llegó de ahí):
     sin esto el almacenero estrenaba los gastos y el presupuesto del negocio
     (revisión 10-10). Si no pasa ninguno de los dos orígenes (un enlace en un
     negocio cuya plantilla los oculta, o el rol que no llegó), lo propio se ve
     como antes —la regla del hub—. */
  const veLoPropio = usePermisoDe(ORIGEN_PROPIO) || !veCompras;

  const secciones = useMemo(
    () =>
      SUBS_GASTOS.filter((s) => (DE_COMPRAS.includes(s) ? veCompras : veLoPropio)).map((clave) => ({
        clave,
        rotulo: ROTULO[clave],
      })),
    [veCompras, veLoPropio],
  );
  /* Al hook van TODAS las secciones (constante estable): con sólo las
     visibles, un `?sub=fijos` que llega antes de confirmar el rol se perdería. */
  const { vista: pedida, irA } = useSubvistaModulo<SubGastos>(
    MODULE_ID,
    SUBS_GASTOS,
    "anotados",
    pedidoPorUrl ? "presupuesto" : undefined,
  );
  const sub: SubGastos = secciones.some((s) => s.clave === pedida) ? pedida : (secciones[0]?.clave ?? "anotados");

  /* «Actualizar» de las secciones que traen sus datos solas (Fijos y Con
     compras): se vuelven a montar. Un fijo pagado o quitado en el catálogo
     también vale como vuelta: la lista de Anotados se relee al volver. */
  const [vuelta, setVuelta] = useState(0);
  const releer = useCallback(() => setVuelta((n) => n + 1), []);
  const verCatalogo = useCallback(() => irA("fijos"), [irA]);

  const barra = (
    <BarraDeSecciones secciones={secciones} activa={sub} onCambiar={irA} etiqueta="Secciones de Gastos" idPanel={ID_PANEL} />
  );
  const actualizar: MenuAccion = { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: releer };

  return (
    <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, sub)} className="space-y-4">
      {sub === "anotados" && (
        <ExpensesTab barra={barra} accionCompacta={secciones.length > 3} recarga={vuelta} onVerCatalogo={veCompras ? verCatalogo : undefined} />
      )}
      {sub === "presupuesto" && <PresupuestoMensualTab barra={barra} hayPresupuesto={hayPresupuesto} />}
      {sub === "metas" && <BudgetVsRealTab barra={barra} />}
      {sub === "fijos" && (
        <>
          <CabeceraVista
            titulo="Gastos"
            ayuda={{
              what: "El catálogo de gastos fijos: lo que se paga todos los meses (alquiler, servicios, combustible). Llegó de Compras › Comprar.",
              affects: "Un fijo no suma a tus gastos hasta que registras su pago: ahí pasa a Anotados.",
              example: "Toca la tarjeta del alquiler para registrar el pago de este mes.",
            }}
            secciones={barra}
            acciones={[actualizar]}
            tituloMenu="Actualizar el catálogo"
          />
          <CatalogoDeGastosFijos key={vuelta} onCambio={releer} />
        </>
      )}
      {sub === "historial" && (
        <>
          <CabeceraVista
            titulo="Gastos"
            ayuda={{
              what: "Gastos y compras recibidas juntos: lo gastado y lo pagado, los fijos del período y el presupuesto por categoría. Llegó de Compras.",
              affects: "La mercadería recibida sin cancelar sale en «Queda por pagar» y en Deudas › Lo que debo.",
            }}
            secciones={barra}
            acciones={[actualizar]}
            tituloMenu="Actualizar el historial"
          />
          <HistorialGastosTab key={vuelta} />
        </>
      )}
    </div>
  );
}
