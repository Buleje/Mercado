"use client";

/**
 * El estado del comparador de dos cubicaciones GUARDADAS (Brandon 24-10):
 * cuál es A, cuál es B, por qué lectura se mira y si se esconden los grupos
 * que quedaron iguales. Las cuentas son todas de `cubicacion-diferencias`; acá
 * sólo se elige y se memoiza.
 *
 * El modal se monta al abrir (con `key` por la A elegida), así que el estado
 * nace de nuevo cada vez: B arranca en la más reciente de la misma especie.
 */
import { useCallback, useMemo, useState } from "react";
import {
  cambio,
  cambiosPorPieza,
  diferenciasPor,
  totalesComparados,
  ordenRecientes,
  parejaPorDefecto,
  type DimensionComparar,
} from "@/lib/forestal/cubicacion-diferencias";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";

export function useCompararCubicaciones(lista: readonly CubicacionRegistro[], inicialA: string | null) {
  const recientes = useMemo(() => ordenRecientes(lista), [lista]);
  const [idA, setIdA] = useState(() => inicialA ?? recientes[0]?.id ?? "");
  const [idB, setIdB] = useState(() => {
    const a = lista.find((c) => c.id === (inicialA ?? recientes[0]?.id));
    return (a && parejaPorDefecto(lista, a)?.id) || "";
  });
  const [dim, setDim] = useState<DimensionComparar>("especie");
  const [soloCambios, setSoloCambios] = useState(false);

  const a = useMemo(() => lista.find((c) => c.id === idA) ?? null, [lista, idA]);
  const b = useMemo(() => lista.find((c) => c.id === idB) ?? null, [lista, idB]);
  const diferencias = useMemo(() => (a && b ? diferenciasPor(a, b, dim) : null), [a, b, dim]);
  const totales = useMemo(() => (a && b ? totalesComparados(a, b) : null), [a, b]);
  const piezaAPieza = useMemo(() => (a && b ? cambiosPorPieza(a, b) : null), [a, b]);
  const filas = useMemo(
    () => (diferencias ? (soloCambios ? diferencias.filas.filter(cambio) : diferencias.filas) : []),
    [diferencias, soloCambios],
  );

  /* Elegir del otro lado la que ya está de este: se cambian de lugar (comparar
     una consigo misma no dice nada). */
  const elegirA = useCallback((id: string) => {
    if (id === idB) setIdB(idA);
    setIdA(id);
  }, [idA, idB]);
  const elegirB = useCallback((id: string) => {
    if (id === idA) setIdA(idB);
    setIdB(id);
  }, [idA, idB]);
  const intercambiar = useCallback(() => {
    setIdA(idB);
    setIdB(idA);
  }, [idA, idB]);

  return { recientes, a, b, elegirA, elegirB, intercambiar, dim, setDim, soloCambios, setSoloCambios, diferencias, totales, filas, piezaAPieza };
}
