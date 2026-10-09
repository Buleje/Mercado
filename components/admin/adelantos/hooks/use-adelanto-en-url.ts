"use client";

/**
 * La ficha de UN adelanto en `?adelanto=<código o id>` (lista de Adelantos).
 *
 * Antes el Resultado del negocio mandaba ese parámetro y nadie lo leía: el clic
 * en «Adelanto ADL-2026-0007» caía en la lista sin marcar nada. Ahora, al
 * llegar:
 *  - se abre su ficha (`DetalleAdelantoModal`), y el «atrás» la cierra;
 *  - si el filtro o la búsqueda lo escondían, se limpian;
 *  - la lista salta a la página donde está y la fila queda resaltada (también
 *    después de cerrar la ficha: es la que se vino a ver).
 * El clic en una fila de la lista abre la ficha por el mismo camino, así el
 * link se puede copiar y el «atrás» la cierra igual.
 *
 * Va DESPUÉS del `setPagina(1)` de la lista: si los dos corren en el mismo
 * render (al montar, o al limpiar el filtro), gana la página del adelanto.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { MARCA_FICHA_DESDE } from "@/components/admin/shared/ir-a-enlace";
import { PARAM_ADELANTO, PARAM_LIQUIDACION, esElAdelanto } from "@/lib/adelantos/enlace-adelanto";
import { ordenarAdelantos, type ColumnaOrden, type Direccion } from "@/lib/adelantos/ordenar-lista";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { ACCION_LIQUIDAR, PARAM_ACCION } from "../cuentas/liquidar-por-url";

/** Los parámetros que sólo lee Adelantos: se van de la URL al salir del módulo. */
export const PARAMS_DE_ADELANTOS = [PARAM_ADELANTO, PARAM_LIQUIDACION] as const;

/** ¿La URL sigue mostrando Adelantos? (Mi Plata › Adelantos, cualquier sub-vista). */
const sigueEnAdelantos = (q: URLSearchParams) => q.get("tab") === "plata" && q.get("vista") === "adelantos";

/**
 * La URL sin los parámetros de Adelantos, o `null` si no hay nada que borrar
 * (no tenía ninguno, o la URL todavía es la de Adelantos).
 *
 * `accion` sólo si es `liquidar`: el parámetro es genérico y otro módulo puede
 * haber llegado con el suyo. `persona` no se toca: ya está en `PARAMS_DE_VISTA`
 * y otro módulo (RRHH) lo usa para su ficha.
 */
export function urlAlSalirDeAdelantos(href: string): string | null {
  const u = new URL(href);
  if (sigueEnAdelantos(u.searchParams)) return null;
  let borro = false;
  for (const p of PARAMS_DE_ADELANTOS) {
    if (!u.searchParams.has(p)) continue;
    u.searchParams.delete(p);
    borro = true;
  }
  if (u.searchParams.get(PARAM_ACCION) === ACCION_LIQUIDAR) {
    u.searchParams.delete(PARAM_ACCION);
    borro = true;
  }
  return borro ? u.toString() : null;
}

/**
 * Al salir de Adelantos (a otro módulo o a otra vista de Mi Plata), sus
 * parámetros se van de la URL. `navigateTab` sólo borra `PARAMS_DE_VISTA` al
 * cambiar de módulo, y entre vistas de Mi Plata no borra nada: un `?adelanto=`
 * que viajaba reabría la ficha al volver.
 *
 * Espera un tick: el desmontaje de prueba de StrictMode (desarrollo) vuelve a
 * montar enseguida, y ahí no hay que borrar nada. Conserva la marca de la ficha
 * (`MARCA_FICHA_DESDE`) de la entrada; sin `__NA` en el estado, Next relee la URL.
 */
export function useLimpiarAlSalirDeAdelantos(): void {
  const montado = useRef(false);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      window.setTimeout(() => {
        if (montado.current) return;
        const limpia = urlAlSalirDeAdelantos(window.location.href);
        if (!limpia) return;
        const estado: unknown = window.history.state;
        const marca = estado && typeof estado === "object" ? (estado as Record<string, unknown>)[MARCA_FICHA_DESDE] : undefined;
        window.history.replaceState(typeof marca === "string" ? { [MARCA_FICHA_DESDE]: marca } : null, "", limpia);
      }, 0);
    };
  }, []);
}

interface OpcionesAdelantoEnUrl {
  /** Todos los adelantos cargados. */
  adelantos: DbAdelanto[];
  /** Los que la lista muestra con el filtro y la búsqueda de ahora. */
  filtrados: DbAdelanto[];
  loading: boolean;
  orden: { columna: ColumnaOrden; direccion: Direccion };
  porPagina: number;
  /** Setters de la lista (estables: los de `useState`). */
  setFiltro: (f: string) => void;
  setQ: (q: string) => void;
  setPagina: (p: number) => void;
}

export interface AdelantoEnUrl {
  /** El adelanto con la ficha abierta, o `null`. */
  abierto: DbAdelanto | null;
  /** La fila a resaltar: la última ficha que se abrió. */
  resaltadoId: string | null;
  /** La URL pide un adelanto que ya no está en la lista (anulado y borrado, o de otro negocio). */
  noEncontrado: string | null;
  abrir: (a: DbAdelanto) => void;
  cerrar: () => void;
}

export function useAdelantoEnUrl({
  adelantos,
  filtrados,
  loading,
  orden,
  porPagina,
  setFiltro,
  setQ,
  setPagina,
}: OpcionesAdelantoEnUrl): AdelantoEnUrl {
  useLimpiarAlSalirDeAdelantos();
  const ficha = useFichaEnUrl(PARAM_ADELANTO);
  const pedido = ficha.id;
  const abierto = useMemo(
    () => (pedido ? adelantos.find((a) => esElAdelanto(a, pedido)) ?? null : null),
    [pedido, adelantos],
  );
  const [resaltadoId, setResaltadoId] = useState<string | null>(null);
  /** El último adelanto ya ubicado: el filtro y la página se tocan UNA vez por llegada. */
  const ubicado = useRef<string | null>(null);

  useEffect(() => {
    if (!abierto || ubicado.current === abierto.id) return;
    if (!filtrados.some((a) => a.id === abierto.id)) {
      // El filtro o la búsqueda lo escondían: el render siguiente lo vuelve a intentar.
      setFiltro("TODOS");
      setQ("");
      return;
    }
    ubicado.current = abierto.id;
    setResaltadoId(abierto.id);
    const i = ordenarAdelantos(filtrados, orden.columna, orden.direccion).findIndex((a) => a.id === abierto.id);
    if (i >= 0) setPagina(Math.floor(i / porPagina) + 1);
  }, [abierto, filtrados, orden.columna, orden.direccion, porPagina, setFiltro, setQ, setPagina]);

  const noEncontrado = pedido && !loading && adelantos.length > 0 && !abierto ? pedido : null;

  return {
    abierto,
    resaltadoId,
    noEncontrado,
    abrir: (a) => ficha.abrir(a.codigoOperacion?.trim() || a.id),
    cerrar: ficha.cerrar,
  };
}
