"use client";

/**
 * El cuadre de cifras de la distribución + el estado del modal que lo abre.
 *
 * Vive aparte para que `ResumenReparto` sólo monte la etiqueta, el botón y el
 * modal: la lógica es `lib/forestal/reparto-cuadre.ts` (pura, con tests).
 */

import { useCallback, useMemo, useState } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { Distribucion } from "@/lib/forestal/cubicacion-reparto";
import type { AnexoDePermiso } from "@/lib/forestal/anexo-por-permiso";
import { cuadrarReparto, type CuadreReparto, type IdControl } from "@/lib/forestal/reparto-cuadre";

export interface RepartoCuadre {
  cuadre: CuadreReparto;
  /** `null` = cerrado; si no, el control en el que se abrió. */
  abierto: IdControl | "todo" | null;
  abrir: (id?: IdControl) => void;
  cerrar: () => void;
}

/**
 * @param piezas las que entran al reparto (Variado ya abierto).
 * @param cubicado el lote tal cual se cubicó (`rows`): si es el mismo arreglo
 *   que `piezas`, el control «Cubicado = lo que entra al reparto» no aparece.
 */
export function useRepartoCuadre(
  dist: Distribucion,
  piezas: readonly PiezaCubicada[],
  cubicado: readonly PiezaCubicada[],
  anexos: readonly AnexoDePermiso[],
): RepartoCuadre {
  const cuadre = useMemo(
    () => cuadrarReparto({ dist, piezas, cubicado: cubicado === piezas ? undefined : cubicado, anexos }),
    [dist, piezas, cubicado, anexos],
  );
  const [abierto, setAbierto] = useState<IdControl | "todo" | null>(null);
  const abrir = useCallback((id?: IdControl) => setAbierto(id ?? "todo"), []);
  const cerrar = useCallback(() => setAbierto(null), []);
  return { cuadre, abierto, abrir, cerrar };
}
