"use client";

/**
 * «Repartir respetando medidas» (ADR-505): el interruptor, el reparto de
 * ANTES (el mismo, con todos los bloques «sin respetar medidas») y lo que
 * cambió entre uno y otro. El de antes va diferido, como el reparto por tipo:
 * una tecla en un bloque no espera a los dos.
 */

import { useCallback, useDeferredValue, useMemo } from "react";
import { distribuirPorCapacidad, esAserradaDirecta, type BloqueRolliza, type Distribucion } from "@/lib/forestal/cubicacion-reparto";
import type { DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { FuentesDeTrozas } from "@/lib/forestal/cuadre-medidas-rolliza";
import { distConVolumenOficial } from "@/lib/forestal/reparto-oficial";
import { compararRepartoPorMedidas, type DiffRepartoMedidas } from "@/lib/forestal/reparto-medidas-diff";

type PrecioDe = Parameters<typeof distribuirPorCapacidad>[3];

const conMedidas = (b: BloqueRolliza) => !esAserradaDirecta(b) && (b.trozasMedidas?.length ?? 0) > 0;
const sinRespetar = (b: BloqueRolliza): BloqueRolliza => (b.ignorarMedidas ? b : { ...b, ignorarMedidas: true });

export interface BloqueConMedidas {
  id: string;
  etiqueta: string;
  permiso: string | null;
  trozas: number;
  respeta: boolean;
}

export interface RepartoMedidas {
  /** Bloques de rolliza que traen las medidas de sus trozas. */
  bloques: BloqueConMedidas[];
  /** Todos los que tienen medidas las respetan (el interruptor prendido). */
  prendido: boolean;
  /** `null` mientras nadie respeta medidas: no hay antes/después que mostrar. */
  diff: DiffRepartoMedidas | null;
  /** Prende o apaga la regla en todos, o sólo en un bloque. */
  fijar: (respetar: boolean, bloqueId?: string) => void;
}

export function useRepartoMedidas(args: {
  bloques: BloqueRolliza[];
  piezas: PiezaCubicada[];
  dim: DimensionResumen;
  precioDe: PrecioDe;
  /** El reparto que se dibuja (con volumen oficial): el «después». */
  distVista: Distribucion;
  fuentes: FuentesDeTrozas;
  marcadas: ReadonlySet<string>;
  guardar: (next: BloqueRolliza[]) => void;
}): RepartoMedidas {
  const { bloques, piezas, dim, precioDe, distVista, fuentes, marcadas, guardar } = args;
  const lista = useMemo(
    () =>
      bloques.filter(conMedidas).map((b) => ({
        id: b.id,
        etiqueta: b.etiqueta.trim() || "Sin etiqueta",
        permiso: (b.permiso ?? "").trim() || null,
        trozas: b.trozasMedidas?.length ?? 0,
        respeta: !b.ignorarMedidas,
      })),
    [bloques],
  );
  const alguno = lista.some((b) => b.respeta);

  const bloquesDif = useDeferredValue(bloques);
  const piezasDif = useDeferredValue(piezas);
  const antes = useMemo(
    () => (alguno ? distConVolumenOficial(distribuirPorCapacidad(bloquesDif.map(sinRespetar), piezasDif, dim, precioDe)) : null),
    [alguno, bloquesDif, piezasDif, dim, precioDe],
  );
  const diff = useMemo(() => (antes ? compararRepartoPorMedidas(antes, distVista, fuentes, marcadas) : null), [antes, distVista, fuentes, marcadas]);

  const fijar = useCallback(
    (respetar: boolean, bloqueId?: string) => {
      guardar(
        bloques.map((b) => {
          if (!conMedidas(b) || (bloqueId != null && b.id !== bloqueId)) return b;
          if (respetar) return b.ignorarMedidas ? { ...b, ignorarMedidas: null } : b;
          return sinRespetar(b);
        }),
      );
    },
    [bloques, guardar],
  );

  return { bloques: lista, prendido: lista.length > 0 && lista.every((b) => b.respeta), diff, fijar };
}
