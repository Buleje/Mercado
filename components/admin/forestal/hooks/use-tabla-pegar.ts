"use client";

/**
 * El estado de la «tabla para pegar» del cubicador: las celdas, la unidad de
 * cada medida, lo marcado y el historial para Ctrl+Z. Reducer PURO a propósito
 * (StrictMode llama dos veces al reducer: nada de efectos adentro).
 *
 * Lo cargado sobrevive a cerrar la ventana (un Escape o un clic afuera con 300
 * filas pegadas no las pierde): queda como borrador en memoria hasta que se
 * agregan al lote o se vacía la tabla. «Nada se borra».
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  aplicarPegado,
  COLUMNAS_PEGAR,
  conFilasDeSobra,
  esFilaVacia,
  leerFila,
  resumirPegado,
  UNIDADES_DE_FABRICA,
  type FilaLeida,
  type FilaPegar,
  type RangoPegar,
  type UnidadesPegar,
} from "@/lib/forestal/cubicacion-pegar";

export type CeldaPegar = { fila: number; col: number };
type Foto = { filas: FilaPegar[]; unidades: UnidadesPegar };
interface Estado extends Foto {
  ancla: CeldaPegar | null;
  foco: CeldaPegar | null;
  aviso: string | null;
  atras: Foto[];
  /** La celda donde se está tipeando: todo lo tipeado en ella es UN paso de Ctrl+Z. */
  editando: string | null;
}
type Accion =
  | { tipo: "pegar"; texto: string; en: CeldaPegar | null }
  | { tipo: "escribir"; fila: number; col: number; valor: string }
  | { tipo: "borrarRango" }
  | { tipo: "deshacer" }
  | { tipo: "vaciar" }
  | { tipo: "unidad"; columna: keyof UnidadesPegar; valor: string }
  | { tipo: "seleccionar"; celda: CeldaPegar; extender: boolean }
  | { tipo: "extender"; df: number; dc: number }
  | { tipo: "cerrarAviso" };

const PASOS_DE_HISTORIA = 50;
const ULTIMA_COL = COLUMNAS_PEGAR.length - 1;
const conPaso = (e: Estado): Foto[] => [...e.atras.slice(-(PASOS_DE_HISTORIA - 1)), { filas: e.filas, unidades: e.unidades }];
const limitar = (n: number, max: number) => Math.min(Math.max(n, 0), max);

export function rangoDe(ancla: CeldaPegar | null, foco: CeldaPegar | null): RangoPegar | null {
  if (!ancla || !foco) return null;
  return {
    f0: Math.min(ancla.fila, foco.fila),
    f1: Math.max(ancla.fila, foco.fila),
    c0: Math.min(ancla.col, foco.col),
    c1: Math.max(ancla.col, foco.col),
  };
}
export const esRangoDeVarias = (r: RangoPegar | null): r is RangoPegar => !!r && (r.f1 > r.f0 || r.c1 > r.c0);

function reducir(e: Estado, a: Accion): Estado {
  switch (a.tipo) {
    case "pegar": {
      const r = aplicarPegado(e, a.texto, a.en, rangoDe(e.ancla, e.foco));
      if (!r.rango) return { ...e, aviso: r.aviso, editando: null };
      return {
        ...e, filas: r.filas, unidades: r.unidades, aviso: r.aviso, atras: conPaso(e), editando: null,
        ancla: { fila: r.rango.f0, col: r.rango.c0 }, foco: { fila: r.rango.f1, col: r.rango.c1 },
      };
    }
    case "escribir": {
      const clave = `${a.fila}:${a.col}`;
      const filas = e.filas.slice();
      filas[a.fila] = { ...filas[a.fila], [COLUMNAS_PEGAR[a.col]]: a.valor };
      // Tipear deja marcada sólo esa celda: un Supr para corregir no vacía lo recién pegado.
      const celda = { fila: a.fila, col: a.col };
      return { ...e, filas: conFilasDeSobra(filas), atras: e.editando === clave ? e.atras : conPaso(e), editando: clave, ancla: celda, foco: celda };
    }
    case "borrarRango": {
      const r = rangoDe(e.ancla, e.foco);
      if (!r) return e;
      const filas = e.filas.slice();
      for (let f = r.f0; f <= r.f1; f++) {
        const fila = { ...filas[f] };
        for (let c = r.c0; c <= r.c1; c++) fila[COLUMNAS_PEGAR[c]] = "";
        filas[f] = fila;
      }
      return { ...e, filas, atras: conPaso(e), editando: null };
    }
    case "deshacer": {
      const previa = e.atras.at(-1);
      if (!previa) return e;
      return { ...e, ...previa, atras: e.atras.slice(0, -1), editando: null, aviso: null };
    }
    case "vaciar":
      if (e.filas.every(esFilaVacia)) return e;
      return {
        ...e, filas: conFilasDeSobra([]), atras: conPaso(e), editando: null, ancla: null, foco: null,
        aviso: "Vacié la tabla. «Deshacer» (Ctrl+Z) la trae de vuelta.",
      };
    case "unidad":
      return { ...e, unidades: { ...e.unidades, [a.columna]: a.valor }, atras: conPaso(e), editando: null };
    case "seleccionar":
      return { ...e, ancla: a.extender && e.ancla ? e.ancla : a.celda, foco: a.celda };
    case "extender": {
      const desde = e.foco ?? e.ancla;
      if (!desde) return e;
      const foco = { fila: limitar(desde.fila + a.df, e.filas.length - 1), col: limitar(desde.col + a.dc, ULTIMA_COL) };
      return { ...e, ancla: e.ancla ?? desde, foco };
    }
    case "cerrarAviso":
      return { ...e, aviso: null };
  }
}

/** Lo cargado y no agregado todavía (sobrevive a cerrar y abrir la ventana). */
let borrador: Foto | null = null;
/** Tras agregar las piezas al lote: lo agregado ya no es borrador. */
export function olvidarBorradorPegar(): void {
  borrador = null;
}
const vacio = (): Estado => ({ filas: conFilasDeSobra([]), unidades: { ...UNIDADES_DE_FABRICA }, ancla: null, foco: null, aviso: null, atras: [], editando: null });

/** Arranque: el borrador si había; con texto pegado, tabla nueva (el borrador queda a un Ctrl+Z). */
function arrancar(texto: string | null): Estado {
  if (!texto) return borrador ? { ...vacio(), ...borrador } : vacio();
  const pegado = reducir(vacio(), { tipo: "pegar", texto, en: null });
  return { ...pegado, atras: borrador ? [borrador] : [] };
}

export function useTablaPegar(textoInicial: string | null, especies: readonly string[]) {
  const [e, despachar] = useReducer(reducir, textoInicial, arrancar);

  useEffect(() => {
    borrador = e.filas.some((f) => !esFilaVacia(f)) ? { filas: e.filas, unidades: e.unidades } : null;
  }, [e.filas, e.unidades]);

  /* Leer una fila cuesta poco, pero 300 filas por tecla se sienten: cada fila
     se lee una vez por contenido (la fila sin cambios conserva su objeto). */
  const cache = useRef(new WeakMap<FilaPegar, { clave: string; leida: FilaLeida }>());
  const claveBase = `${e.unidades.espesor}|${e.unidades.ancho}|${e.unidades.largo}|${especies.join(",")}`;
  const leidas = useMemo(
    () =>
      e.filas.map((f, i) => {
        const clave = `${i}|${claveBase}`;
        const guardada = cache.current.get(f);
        if (guardada?.clave === clave) return guardada.leida;
        const leida = leerFila(f, i, e.unidades, especies);
        cache.current.set(f, { clave, leida });
        return leida;
      }),
    [e.filas, e.unidades, especies, claveBase],
  );
  const resumen = useMemo(() => resumirPegado(leidas), [leidas]);
  const rango = useMemo(() => rangoDe(e.ancla, e.foco), [e.ancla, e.foco]);

  const pegar = useCallback((texto: string, en: CeldaPegar | null) => despachar({ tipo: "pegar", texto, en }), []);
  const escribir = useCallback((fila: number, col: number, valor: string) => despachar({ tipo: "escribir", fila, col, valor }), []);
  const seleccionar = useCallback((celda: CeldaPegar, extender: boolean) => despachar({ tipo: "seleccionar", celda, extender }), []);
  const extender = useCallback((df: number, dc: number) => despachar({ tipo: "extender", df, dc }), []);
  const borrarRango = useCallback(() => despachar({ tipo: "borrarRango" }), []);
  const deshacer = useCallback(() => despachar({ tipo: "deshacer" }), []);
  const vaciar = useCallback(() => despachar({ tipo: "vaciar" }), []);
  const cerrarAviso = useCallback(() => despachar({ tipo: "cerrarAviso" }), []);
  const cambiarUnidad = useCallback(
    (columna: keyof UnidadesPegar, valor: string) => despachar({ tipo: "unidad", columna, valor }),
    [],
  );

  return {
    filas: e.filas, unidades: e.unidades, aviso: e.aviso, rango, foco: e.foco, leidas, resumen,
    puedeDeshacer: e.atras.length > 0,
    pegar, escribir, seleccionar, extender, borrarRango, deshacer, vaciar, cerrarAviso, cambiarUnidad,
  };
}
