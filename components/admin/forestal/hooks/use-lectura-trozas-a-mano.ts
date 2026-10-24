"use client";

/**
 * Leer en voz alta las trozas anotadas a mano del despacho con guía, fila por
 * fila (Brandon 15-10: «igual como el cubicador de madera»). Es la MISMA
 * lectura del cubicador (`use-lectura-en-voz`: pausa que retoma la fila
 * cortada, sin huecos entre filas, sigue la fila con la vista) y la misma voz
 * de sus Ajustes (`loadConfig`). Lo propio es sólo el texto de cada fila
 * (`textoDeFilaAMano`: «Fila 1: 45, 40, 3 coma 2»).
 *
 * La lista se relee en cada paso: corregir, ordenar o quitar una fila mientras
 * lee entra sola.
 */

import { useCallback, useEffect, useRef } from "react";
import { useLecturaEnVoz } from "@/hooks/use-lectura-en-voz";
import { loadConfig } from "@/lib/forestal/cubicador-config";
import { textoDeFilaAMano, type FilaEnVoz } from "@/lib/forestal/loth-trozas-a-mano-planilla";
import type { FilaAMano } from "./use-trozas-a-mano";

/** Id del `<tr>` de una fila: la lectura lo usa para traerla a la vista. */
export const idDeFilaAMano = (id: number | string): string => `troza-a-mano-${id}`;

export function useLecturaTrozasAMano(filas: readonly FilaAMano[]) {
  const filasRef = useRef(filas);
  useEffect(() => {
    filasRef.current = filas;
  }, [filas]);
  const lectura = useLecturaEnVoz<FilaEnVoz>({
    rate: () => loadConfig().voiceRate,
    voiceURI: () => loadConfig().voiceURI,
    pitch: () => loadConfig().voicePitch,
    volume: () => loadConfig().voiceVolume,
    idDeFila: idDeFilaAMano,
  });
  const lista = useCallback(
    (): FilaEnVoz[] =>
      filasRef.current.map((f) => ({
        id: String(f.key),
        d1Cm: f.d1Cm,
        d2Cm: f.d2Cm,
        largoM: f.largoM,
        cantidad: f.cantidad,
        especie: f.especie?.trim() || undefined,
      })),
    [],
  );
  const { leer: leerLista } = lectura;
  /** Leer / Detener: el mismo botón arranca y corta. */
  const leer = useCallback(() => leerLista(lista, textoDeFilaAMano), [leerLista, lista]);
  return { ...lectura, leer };
}

export type LecturaTrozasAMano = ReturnType<typeof useLecturaTrozasAMano>;
