"use client";

/**
 * La selección del explorador del Archivo, como la de Windows:
 *
 * - clic = sólo ese; Ctrl/⌘+clic = lo suma o lo saca; Shift+clic = el tramo
 *   desde el último que tocaste (el «ancla»);
 * - el rectángulo y Ctrl+A fijan varios de una;
 * - clic derecho sobre algo que no está elegido lo elige solo (el menú actúa
 *   sobre lo que se ve resaltado).
 *
 * Los archivos elegidos son los mismos `selectedIds` del módulo (así la barra
 * de acciones en lote los ve); las carpetas elegidas viven acá. Las claves son
 * `c:<id>` / `d:<id>` (las de `contenido-explorador`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { claveCarpeta, claveDoc } from "./contenido-explorador";

/** Las claves de `desde` a `hasta` (en cualquier sentido) según el orden en pantalla. */
export function rango(orden: readonly string[], desde: string, hasta: string): string[] {
  const a = orden.indexOf(desde);
  const b = orden.indexOf(hasta);
  if (a < 0 || b < 0) return b < 0 ? [] : [hasta];
  return orden.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** Saca o pone `clave` en el conjunto. */
export function alternarEn(base: ReadonlySet<string>, clave: string): Set<string> {
  const out = new Set(base);
  if (out.has(clave)) out.delete(clave);
  else out.add(clave);
  return out;
}

export const idDeClave = (clave: string) => clave.slice(2);
export const esClaveCarpeta = (clave: string) => clave.startsWith("c:");

interface Deps {
  /** Todas las claves en el orden en que se ven. */
  orden: readonly string[];
  docsSel: ReadonlySet<string>;
  setDocsSel: (s: Set<string>) => void;
  /** Cambia al entrar a otra carpeta o vista: la selección se vacía. */
  lugar: string;
  activo: boolean;
}

export interface Mods {
  ctrl?: boolean;
  shift?: boolean;
}

export function useSeleccionExplorador({ orden, docsSel, setDocsSel, lugar, activo }: Deps) {
  const [carpetasSel, setCarpetasSel] = useState<ReadonlySet<string>>(() => new Set());
  const [marcado, setMarcado] = useState<string | null>(null);
  const [ancla, setAncla] = useState<string | null>(null);

  const enOrden = useMemo(() => new Set(orden), [orden]);
  const explicita = useMemo(() => {
    const s = new Set<string>();
    for (const id of carpetasSel) if (enOrden.has(claveCarpeta(id))) s.add(claveCarpeta(id));
    for (const id of docsSel) if (enOrden.has(claveDoc(id))) s.add(claveDoc(id));
    return s;
  }, [carpetasSel, docsSel, enOrden]);

  const fijar = useCallback(
    (claves: Iterable<string>) => {
      const carpetas = new Set<string>();
      const docs = new Set<string>();
      for (const c of claves) (esClaveCarpeta(c) ? carpetas : docs).add(idDeClave(c));
      setCarpetasSel(carpetas);
      setDocsSel(docs);
    },
    [setDocsSel],
  );

  const limpiar = useCallback(() => {
    fijar([]);
    setMarcado(null);
    setAncla(null);
  }, [fijar]);

  // Otra carpeta = otra cosa en pantalla: lo elegido allá no se arrastra.
  const lugarPrevio = useRef(lugar);
  useEffect(() => {
    if (lugarPrevio.current === lugar) return;
    lugarPrevio.current = lugar;
    if (activo) limpiar();
  }, [lugar, activo, limpiar]);

  const esta = useCallback(
    (clave: string) => (explicita.size > 0 ? explicita.has(clave) : marcado === clave),
    [explicita, marcado],
  );

  /** Lo que tocan las acciones (Cortar, Eliminar, el menú): en el orden en pantalla. */
  const efectiva = useMemo(
    () => (explicita.size > 0 ? orden.filter((c) => explicita.has(c)) : marcado && enOrden.has(marcado) ? [marcado] : []),
    [explicita, marcado, orden, enOrden],
  );

  const clic = useCallback(
    (clave: string, m: Mods = {}) => {
      const base = explicita.size > 0 ? explicita : marcado ? new Set([marcado]) : new Set<string>();
      if (m.shift && ancla) {
        const tramo = rango(orden, ancla, clave);
        fijar(m.ctrl ? new Set([...base, ...tramo]) : tramo);
        setMarcado(clave);
        return;
      }
      if (m.ctrl) {
        fijar(alternarEn(base, clave));
      } else {
        fijar([]);
      }
      setMarcado(clave);
      setAncla(clave);
    },
    [explicita, marcado, ancla, orden, fijar],
  );

  const alMenu = useCallback((clave: string) => { if (!esta(clave)) clic(clave); }, [esta, clic]);

  return {
    marcado,
    esta,
    efectiva,
    hayAlgo: explicita.size > 0 || marcado !== null,
    clic,
    alMenu,
    fijar,
    limpiar,
    /** Ctrl+A: todo lo que hay en la carpeta (también lo que todavía no se dibujó). */
    todo: useCallback(() => fijar(orden), [fijar, orden]),
    /** El rectángulo con Ctrl suma a lo que ya había. */
    base: explicita,
  };
}

export type SeleccionExplorador = ReturnType<typeof useSeleccionExplorador>;
