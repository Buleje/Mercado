"use client";

/**
 * useTrozasAMano — las filas que se anotan a mano en «Despachar con guía»
 * (15-10): D1, D2, largo y cantidad. Sólo guarda las filas; numerarlas y
 * cubicarlas es de `piezasAMano` (la misma función que corre el servidor).
 *
 * Además (15-10, planilla): corregir una medida ya anotada (`editar`) y
 * «Ordenar Ø» con el mayor en D1, con Deshacer y Rehacer
 * (`loth-trozas-a-mano-planilla`). El historial guarda QUÉ filas se dieron
 * vuelta, no una foto de la lista: deshacer no se lleva las filas agregadas
 * ni las correcciones hechas después.
 *
 * «Medir por foto» (16-10): `agregarVarias` pasa la carga entera de una vez y
 * `desde` es el primer N° de las trozas sin árbol (el correlativo del permiso;
 * 1 = lo de siempre). Corregir D1 de una troza pareja (`d2Supuesto`) mueve D2
 * con él; tipear D2 le saca la marca: ya no es supuesto.
 */

import { useCallback, useRef, useState } from "react";
import type { TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";
import {
  deshacerOrden,
  ordenarDiametros,
  rehacerOrden,
  type CambioDeOrden,
} from "@/lib/forestal/loth-trozas-a-mano-planilla";

/** Una fila anotada, con una clave estable para la lista (quitar una no renumera las keys). */
export interface FilaAMano extends TrozaAMano {
  key: number;
}

interface Historial {
  deshacer: CambioDeOrden[];
  rehacer: CambioDeOrden[];
}
const SIN_HISTORIAL: Historial = { deshacer: [], rehacer: [] };

/** El cambio aplicado a una fila; la troza pareja (D2 supuesto) sigue a D1 hasta que D2 se tipea. */
function conCambio(f: FilaAMano, cambio: Partial<TrozaAMano>): FilaAMano {
  if (!f.d2Supuesto) return { ...f, ...cambio };
  if (cambio.d2Cm !== undefined && cambio.d2Cm !== f.d2Cm) return { ...f, ...cambio, d2Supuesto: false };
  if (cambio.d1Cm !== undefined) return { ...f, ...cambio, d2Cm: cambio.d1Cm };
  return { ...f, ...cambio };
}

export function useTrozasAMano() {
  const [filas, setFilas] = useState<FilaAMano[]>([]);
  const [historial, setHistorial] = useState<Historial>(SIN_HISTORIAL);
  const [desde, setDesdeCrudo] = useState(1);
  const siguiente = useRef(0);
  const agregar = useCallback((t: TrozaAMano) => {
    siguiente.current += 1;
    const key = siguiente.current;
    setFilas((prev) => [...prev, { ...t, key }]);
  }, []);
  const agregarVarias = useCallback((ts: readonly TrozaAMano[]) => {
    const nuevas = ts.map((t) => {
      siguiente.current += 1;
      return { ...t, key: siguiente.current };
    });
    setFilas((prev) => [...prev, ...nuevas]);
  }, []);
  const setDesde = useCallback((n: number) => setDesdeCrudo(Number.isInteger(n) && n >= 1 ? n : 1), []);
  const quitar = useCallback((key: number) => setFilas((prev) => prev.filter((f) => f.key !== key)), []);
  /** Corrige medidas de una fila ya anotada (ya revisadas con `revisarCeldaAMano`). */
  const editar = useCallback(
    (key: number, cambio: Partial<TrozaAMano>) =>
      setFilas((prev) => prev.map((f) => (f.key === key ? conCambio(f, cambio) : f))),
    [],
  );

  /** Mayor en D1, menor en D2. Devuelve cuántas filas dio vuelta (0 = ya estaban). */
  const ordenar = useCallback((): number => {
    const r = ordenarDiametros(filas);
    if (r.cambio.antes.length === 0) return 0;
    setFilas(r.filas);
    setHistorial((h) => ({ deshacer: [...h.deshacer, r.cambio], rehacer: [] }));
    return r.cambio.antes.length;
  }, [filas]);

  /** Devuelve las filas del último orden a como estaban. Cuántas volvieron. */
  const deshacer = useCallback((): number => {
    const cambio = historial.deshacer.at(-1);
    if (!cambio) return 0;
    const r = deshacerOrden(filas, cambio);
    setFilas(r.filas);
    setHistorial((h) => ({ deshacer: h.deshacer.slice(0, -1), rehacer: [...h.rehacer, cambio] }));
    return r.cambiadas;
  }, [filas, historial.deshacer]);

  /** Vuelve a aplicar el último orden deshecho. Cuántas filas dio vuelta. */
  const rehacer = useCallback((): number => {
    const cambio = historial.rehacer.at(-1);
    if (!cambio) return 0;
    const r = rehacerOrden(filas, cambio);
    setFilas(r.filas);
    setHistorial((h) => ({ deshacer: [...h.deshacer, cambio], rehacer: h.rehacer.slice(0, -1) }));
    return r.cambiadas;
  }, [filas, historial.rehacer]);

  return {
    filas,
    desde,
    setDesde,
    agregar,
    agregarVarias,
    quitar,
    editar,
    ordenar,
    deshacer,
    rehacer,
    puedeDeshacer: historial.deshacer.length > 0,
    puedeRehacer: historial.rehacer.length > 0,
  };
}

export type TrozasAMano = ReturnType<typeof useTrozasAMano>;
