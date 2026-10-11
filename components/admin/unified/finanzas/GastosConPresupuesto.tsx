"use client";

/**
 * Gastos con su presupuesto adentro — y, desde la ola 3 del panel unificado
 * (2026-10-10), con lo que de gastos vivía en Compras.
 *
 * El presupuesto no es otra sección: es el TECHO de estos mismos gastos. Verlos
 * en dos pestañas distintas obligaba a ir y volver para contestar una sola
 * pregunta —«¿me pasé?»—, y encima la pestaña estaba vacía para quien nunca
 * cargó una categoría (cero en el tenant real, medido 2026-09-21).
 *
 * Por eso vive acá abajo, plegado, y se abre solo cuando hay presupuesto
 * cargado o cuando se entró por su propia dirección (`?vista=presupuesto`, que
 * sigue funcionando: ver `estructura.ts`).
 *
 * LO QUE LLEGÓ DE COMPRAS (plan, regla R1: lo operativo de la plata se mira
 * acá): el catálogo de gastos fijos del Punto de compra y el Historial de
 * Gastos (con su panel de fijos del período y su presupuesto por categoría).
 * Son los mismos componentes, plegados, con su origen en el título y visibles
 * sólo para quien veía Compras. Hay TRES presupuestos (el del mes acá, el de
 * Compras y el mensual por categoría): unificarlos es la decisión 7 de
 * Brandon y no se toca.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import Plegable from "@/components/admin/shared/Plegable";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { usePermisoDe } from "@/hooks/use-vistas-permitidas";
import BloqueMudado from "./BloqueMudado";

const ExpensesTab = dynamic(() => import("@/components/admin/ExpensesTab"), { loading: S });
const BudgetVsRealTab = dynamic(() => import("@/components/admin/BudgetVsRealTab"), { loading: S });
const PresupuestoMensualTab = dynamic(() => import("@/components/admin/finanzas/PresupuestoMensualTab"), { loading: S });
const CatalogoDeGastosFijos = dynamic(() => import("./gastos/CatalogoDeGastosFijos"), { loading: S });
const HistorialGastosTab = dynamic(() => import("@/components/admin/compras/HistorialGastosTab"), { loading: S });

/** Claves del navegador: la misma clave = la misma preferencia de plegado. */
const CLAVE_PRESUPUESTO = "plata:gastos:presupuesto";
const CLAVE_CATALOGO = "plata:gastos:catalogo-fijos";
/** El ancla del catálogo: «Ver el catálogo» de la lista de gastos lleva acá. */
export const ANCLA_CATALOGO = "plata-catalogo-fijos";
/** Quién ve los gastos y el presupuesto propios: el mismo `origen` del resto de Mi Plata. */
const ORIGEN_PROPIO = ["plata", "activos"] as const;
const ORIGEN_COMPRAS = ["compras"] as const;

interface Props {
  /** Se entró por `?vista=presupuesto`: abrir y llevar el ojo ahí. */
  pedidoPorUrl: boolean;
  /** Si hay categorías de presupuesto cargadas. `undefined` = todavía no se sabe. */
  hayPresupuesto: boolean | undefined;
}

export default function GastosConPresupuesto({ pedidoPorUrl, hayPresupuesto }: Props) {
  const [, setPresupuestoAbierto] = useLocalStorage<boolean>(CLAVE_PRESUPUESTO, false);
  const [, setCatalogoAbierto] = useLocalStorage<boolean>(CLAVE_CATALOGO, false);
  /** El catálogo es de Compras: sin ese permiso no se dibuja y «Ver el catálogo» no se ofrece. */
  const veCompras = usePermisoDe(ORIGEN_COMPRAS);
  /* La vista se abre también a quien veía Compras (por lo que llegó de ahí):
     sin esto el almacenero estrenaba los gastos y el presupuesto del negocio
     (revisión 10-10). Pero son lo PROPIO de la vista: si no pasa ninguno de
     los dos orígenes (un enlace en un negocio cuya plantilla los oculta, o el
     rol que no llegó), se ven como antes —la regla del hub, igual que el motor
     de Compras › Sugerencias—. El servidor los sigue cerrando sólo a admin. */
  const veLoPropio = usePermisoDe(ORIGEN_PROPIO) || !veCompras;
  /* Un pago, un fijo borrado o uno nuevo en el catálogo cambian la lista de
     arriba: se relee SIN remontarla (con `key` se perdían las fechas elegidas,
     la categoría y el formulario abierto). */
  const [vueltaDeLista, setVueltaDeLista] = useState(0);
  const releerLista = useCallback(() => setVueltaDeLista((n) => n + 1), []);

  /* Con presupuesto cargado arranca abierto, salvo que ya lo hayas plegado tú
     (lo recordado manda: el dato que llega tarde no te lo reabre). */
  useEffect(() => {
    if (!hayPresupuesto) return;
    try {
      if (window.localStorage.getItem(CLAVE_PRESUPUESTO) === null) setPresupuestoAbierto(true);
    } catch {
      /* sin localStorage (modo privado estricto): queda como esté */
    }
  }, [hayPresupuesto, setPresupuestoAbierto]);

  useEffect(() => {
    if (!pedidoPorUrl) return;
    setPresupuestoAbierto(true);
    document.getElementById("plata-presupuesto")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [pedidoPorUrl, setPresupuestoAbierto]);

  /** «Ver el catálogo» de la lista: abre el bloque y lleva el ojo ahí (antes saltaba a Compras). */
  const verCatalogo = useCallback(() => {
    setCatalogoAbierto(true);
    requestAnimationFrame(() =>
      document.getElementById(ANCLA_CATALOGO)?.scrollIntoView?.({ behavior: "smooth", block: "start" }),
    );
  }, [setCatalogoAbierto]);

  return (
    <div className="space-y-6">
      {/* Lo propio, con `veLoPropio`; lo que llegó de Compras, el permiso de
          Compras (`BloqueMudado`). */}
      {veLoPropio && (
        <>
          <ExpensesTab recarga={vueltaDeLista} onVerCatalogo={veCompras ? verCatalogo : undefined} />

          <div id="plata-presupuesto" className="scroll-mt-24">
            <Plegable
              clave={CLAVE_PRESUPUESTO}
              variante="franja"
              resumenAbierto
              titulo="Presupuesto del mes"
              resumen={
                hayPresupuesto === false
                  ? "Todavía no le pusiste techo a ningún rubro"
                  : "El techo de estos mismos gastos"
              }
            >
              <div className="space-y-6">
                <BudgetVsRealTab />
                <PresupuestoMensualTab />
              </div>
            </Plegable>
          </div>
        </>
      )}

      <BloqueMudado
        id={ANCLA_CATALOGO}
        origen="compras"
        deDonde="Compras › Comprar"
        clave={CLAVE_CATALOGO}
        variante="franja"
        titulo="Catálogo de gastos fijos"
        resumen="Pagar con un toque, agregar uno que se repite o quitarlo"
      >
        <CatalogoDeGastosFijos onCambio={releerLista} />
      </BloqueMudado>

      <BloqueMudado
        origen="compras"
        deDonde="Compras"
        clave="plata:gastos:historial-compras"
        variante="franja"
        titulo="Historial de gastos y compras"
        resumen="Gastos y compras recibidas: lo gastado y lo pagado, los fijos del período y el presupuesto por categoría"
      >
        <HistorialGastosTab />
      </BloqueMudado>
    </div>
  );
}
