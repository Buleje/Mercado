"use client";

/**
 * ¿De qué permiso es la GTF X? — el pedido que cualquier pantalla hace cuando
 * el servidor contesta 409 `GUIA_AMBIGUA` (ADR-504: el mismo N° de guía en
 * dos talonarios, dos permisos).
 *
 * Un store de módulo y no un estado por pantalla: el 409 llega a formularios,
 * a modales y a hooks sin JSX (`usePlataDeGuia`, `useFletesForestales`). Las
 * raíces del módulo forestal montan UNA ventana (`ElegirPermisoDeGuia`) y
 * cualquiera la pide con `fetchConPermisoDeGuia`:
 *
 *   const r = await fetchConPermisoDeGuia((contratoId) =>
 *     fetch(url, { method: "POST", body: JSON.stringify({ ...cuerpo, ...(contratoId ? { contratoId } : {}) }) }));
 *
 * 1. Manda sin permiso. 2. Si vuelve 409 `GUIA_AMBIGUA`, abre la ventana con
 * las candidatas. 3. Elegida una, reintenta con su `contratoId`. Si nadie
 * montó la ventana o se cierra sin elegir, devuelve el 409 tal cual: la
 * pantalla muestra el mensaje del servidor («está en 2 permisos…») como
 * cualquier error. Nunca se elige «la primera».
 */

import { useEffect, useId, useSyncExternalStore } from "react";
import {
  contratoDeCandidata,
  leerGuiaAmbigua,
  type CandidataDeGuia,
  type GuiaAmbigua,
} from "@/lib/forestal/guia-por-permiso";

export interface PedidoDePermiso {
  n: number;
  ambigua: GuiaAmbigua;
  elegir: (c: CandidataDeGuia | null) => void;
}

let pedido: PedidoDePermiso | null = null;
let contador = 0;
/** Las ventanas montadas, en orden: pinta sólo la primera (dos raíces no abren dos). */
let anfitriones: string[] = [];
const oyentes = new Set<() => void>();
const avisar = () => {
  for (const o of oyentes) o();
};

/** Abre la ventana y espera la elección. `null` = no hay ventana montada o se cerró sin elegir. */
export function pedirPermisoDeGuia(ambigua: GuiaAmbigua): Promise<CandidataDeGuia | null> {
  if (anfitriones.length === 0) return Promise.resolve(null);
  /* Un pedido que seguía abierto (dos guardados seguidos) se cierra sin elegir. */
  pedido?.elegir(null);
  const n = ++contador;
  return new Promise((resolve) => {
    pedido = {
      n,
      ambigua,
      elegir: (c) => {
        if (pedido?.n === n) {
          pedido = null;
          avisar();
        }
        resolve(c);
      },
    };
    avisar();
  });
}

/**
 * `fetch` que sabe preguntar el permiso. `hacer(contratoId?)` arma el pedido:
 * sin argumento la primera vez; con el id elegido (o `SIN_PERMISO`) en el
 * reintento. Devuelve la última respuesta.
 */
export async function fetchConPermisoDeGuia(
  hacer: (contratoId?: string) => Promise<Response>,
): Promise<Response> {
  const r = await hacer();
  if (r.status !== 409) return r;
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.clone().json();
  } catch {
    return r;
  }
  const ambigua = leerGuiaAmbigua(r.status, cuerpo);
  if (!ambigua) return r;
  const elegida = await pedirPermisoDeGuia(ambigua);
  if (!elegida) return r;
  return hacer(contratoDeCandidata(elegida));
}

/**
 * El cuerpo JSON de un pedido con el permiso elegido adentro. Sin permiso, o si
 * el cuerpo no es un objeto JSON, va tal cual: así cualquier `fetch` se
 * envuelve sin rearmar su cuerpo —
 * `fetchConPermisoDeGuia((id) => fetch(url, { ...init, body: cuerpoConPermiso(init.body, id) }))`.
 */
export function cuerpoConPermiso<B extends BodyInit | null | undefined>(body: B, contratoId?: string): B | string {
  if (!contratoId || typeof body !== "string") return body;
  try {
    const o: unknown = JSON.parse(body);
    if (!o || typeof o !== "object" || Array.isArray(o)) return body;
    return JSON.stringify({ ...o, contratoId });
  } catch {
    return body;
  }
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}
const leer = () => pedido;
const leerAnfitriones = () => anfitriones;

/**
 * Para la ventana: el pedido abierto, si esta instancia es la que pinta.
 * Al desmontarse la última, el pedido pendiente se cierra sin elegir.
 */
export function usePedidoDePermiso(): PedidoDePermiso | null {
  const id = useId();
  useEffect(() => {
    anfitriones = [...anfitriones, id];
    avisar();
    return () => {
      anfitriones = anfitriones.filter((x) => x !== id);
      if (anfitriones.length === 0) pedido?.elegir(null);
      avisar();
    };
  }, [id]);
  const actual = useSyncExternalStore(suscribir, leer, () => null);
  const lista = useSyncExternalStore(suscribir, leerAnfitriones, () => anfitriones);
  return lista[0] === id ? actual : null;
}

/** Sólo para tests: vuelve el store a cero. */
export function reiniciarPedidoDePermiso() {
  pedido = null;
  anfitriones = [];
  avisar();
}
