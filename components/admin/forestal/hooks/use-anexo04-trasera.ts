"use client";

/**
 * La parte trasera del camión que el PDF del ANEXO N° 04 lleva como última
 * hoja (Brandon, 2026-10-03: «el chofer lleva una sola hoja»).
 *
 * Sigue al papel, no al lote:
 *  · Sólo con el lote del cubicador como origen. Si el anexo se arma con una
 *    cubicación guardada o un emitido, la trasera de HOY no es la de aquel
 *    viaje: mejor ninguna que una equivocada.
 *  · Con un dueño elegido, sólo sus piezas (cada dueño se lleva su papel).
 *  · Con medidas corregidas en «Editar medidas», el croquis usa las corregidas:
 *    la hoja y el dibujo no pueden decir dos largos distintos.
 */
import { useMemo } from "react";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { TraseraParaPdf } from "@/lib/forestal/anexo04-pdf";

type Correcciones = Record<string, Partial<PiezaCubicada>>;

export function useTraseraDelPapel(
  trasera: TraseraParaPdf | null | undefined,
  ctx: { origenActual: boolean; dueno: string | "todos"; correcciones: Correcciones },
): TraseraParaPdf | null {
  const { origenActual, dueno, correcciones } = ctx;
  return useMemo(() => {
    if (!trasera || trasera.piezas.length === 0 || !origenActual) return null;
    const piezas = trasera.piezas
      .filter((r) => dueno === "todos" || (r.dueno?.trim() || "") === dueno)
      .map((r) => {
        const c = correcciones[r.id];
        if (!c) return r;
        const upd = { ...r, ...c };
        return { ...upd, ...cubicarPieza(upd) };
      });
    return piezas.length > 0 ? { piezas, anchoM: trasera.anchoM, catalogo: trasera.catalogo } : null;
  }, [trasera, origenActual, dueno, correcciones]);
}
