"use client";

/**
 * useAbrirFichaAlLlegar — el LECTOR de `?<param>=<id>` en una pantalla cuya
 * ficha vive en su propio estado (un objeto, un teléfono, una fila expandida).
 *
 * `useFichaEnUrl` dice qué id pide la URL; esto lo traduce a la ficha de la
 * pantalla sin tocar cómo carga ni filtra su lista:
 *  - llegar por enlace (o «adelante»): espera a que la lista cargue, busca la
 *    cosa y la abre; si no está en lo cargado, `noEsta` (traerla por id, o
 *    avisar y limpiar la URL) — una sola vez por id;
 *  - «atrás» (el parámetro se fue): cierra lo que estaba abierto;
 *  - ya abierta (la abrió el clic, que escribió la URL): no hace nada.
 *
 * Corre cuando cambia el id de la URL o cuando la lista termina de cargar —
 * NO cuando cambia lo abierto: cerrar con la X saca el parámetro un instante
 * después (`history.back` es asíncrono) y reabrirla en ese hueco parpadeaba.
 * Por eso lo abierto y las funciones se leen de una ref.
 */

import { useEffect, useLayoutEffect, useRef } from "react";

export interface OpcionesAbrirFichaAlLlegar<T> {
  /** El id que pide la URL (`useFichaEnUrl(…).id`). */
  idEnUrl: string | null;
  /** El id (en la forma de la URL) de la ficha que la pantalla tiene abierta, o `null`. */
  idAbierto: string | null;
  /** La lista ya cargó: recién ahí se puede decir que la cosa no está. */
  listo: boolean;
  /** Busca la cosa en lo cargado. */
  buscar: (id: string) => T | null | undefined;
  /** Abre la ficha (estado de la pantalla: la URL ya la tiene). */
  abrir: (cosa: T) => void;
  /** Cierra la ficha (estado de la pantalla: el parámetro ya se fue). */
  cerrar: () => void;
  /** No está en lo cargado (archivada, de otra página, borrada): traerla por id o avisar. */
  noEsta: (id: string) => void;
}

export function useAbrirFichaAlLlegar<T>(opciones: OpcionesAbrirFichaAlLlegar<T>): void {
  const ultimo = useRef(opciones);
  useLayoutEffect(() => {
    ultimo.current = opciones;
  });
  /** El id que ya se mandó a `noEsta`: una recarga de la lista no lo vuelve a pedir. */
  const reclamado = useRef<string | null>(null);
  const { idEnUrl, listo } = opciones;

  useEffect(() => {
    const { idAbierto, buscar, abrir, cerrar, noEsta } = ultimo.current;
    if (!idEnUrl) {
      reclamado.current = null;
      if (idAbierto) cerrar();
      return;
    }
    if (idAbierto === idEnUrl) return;
    const cosa = buscar(idEnUrl);
    if (cosa) {
      abrir(cosa);
      return;
    }
    if (!listo || reclamado.current === idEnUrl) return;
    reclamado.current = idEnUrl;
    noEsta(idEnUrl);
  }, [idEnUrl, listo]);
}
