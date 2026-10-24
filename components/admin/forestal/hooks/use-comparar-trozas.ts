"use client";

/**
 * El estado del comparador de dos cubicaciones de TROZAS guardadas: cuál es A,
 * cuál es B, por qué lectura se mira, y las medidas de cada una (la lista no
 * las trae: se piden por id, una vez cada una). Las cuentas son todas de
 * `cubicacion-trozas-diferencias`; acá sólo se elige, se pide y se memoiza.
 *
 * Sólo se comparan dos de la MISMA fórmula: al cambiar A por otra de otra
 * fórmula, B se busca de nuevo entre las de esa fórmula.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cambiosPorTroza, cambioTrozas, diferenciasTrozasPor, esDeTrozas, mismaFormula, ordenRecientesTrozas,
  parejaPorDefectoTrozas, totalesTrozasComparados, type DimensionTrozas,
} from "@/lib/forestal/cubicacion-trozas-diferencias";
import { leerCubicacionTrozas, type CubicacionTrozas } from "./use-cubicaciones-trozas";

export function useCompararTrozas(lista: readonly CubicacionTrozas[], inicialA: string | null) {
  const recientes = useMemo(() => ordenRecientesTrozas(lista.filter((c) => c.material !== "aserrada" && esDeTrozas(c.formula))), [lista]);
  const [idA, setIdA] = useState(() => inicialA ?? recientes[0]?.id ?? "");
  const [idB, setIdB] = useState(() => {
    const a = recientes.find((c) => c.id === (inicialA ?? recientes[0]?.id));
    return (a && parejaPorDefectoTrozas(recientes, a)?.id) || "";
  });
  const [dim, setDim] = useState<DimensionTrozas>("especie");
  const [soloCambios, setSoloCambios] = useState(false);

  /* Las medidas de cada una, pedidas una sola vez. */
  const [medidas, setMedidas] = useState<Record<string, CubicacionTrozas>>({});
  const [error, setError] = useState<string | null>(null);
  const pedidas = useRef(new Set<string>());
  useEffect(() => {
    for (const id of [idA, idB]) {
      if (!id || pedidas.current.has(id)) continue;
      pedidas.current.add(id);
      void leerCubicacionTrozas(id).then((r) => {
        if (r.ok) { setMedidas((m) => ({ ...m, [id]: r.data })); setError(null); }
        else { pedidas.current.delete(id); setError(r.mensaje); }
      });
    }
    /* Sin guarda de «vivo»: cada id se pide una vez (`pedidas`) y su respuesta es del id, no del render; el StrictMode desmonta y vuelve a montar, y una guarda así tiraba la respuesta sin volver a pedirla. */
  }, [idA, idB]);

  const resumenA = useMemo(() => recientes.find((c) => c.id === idA) ?? null, [recientes, idA]);
  const resumenB = useMemo(() => recientes.find((c) => c.id === idB) ?? null, [recientes, idB]);
  const a = idA ? medidas[idA] ?? null : null;
  const b = idB ? medidas[idB] ?? null : null;
  const cargando = Boolean(((idA && !a) || (idB && !b)) && !error);
  const comparables = Boolean(resumenA && resumenB && mismaFormula(resumenA, resumenB));
  const formula = comparables && resumenA && esDeTrozas(resumenA.formula) ? resumenA.formula : null;

  const diferencias = useMemo(() => (formula && a && b ? diferenciasTrozasPor(a.trozas ?? [], b.trozas ?? [], formula, dim) : null), [a, b, formula, dim]);
  const totales = useMemo(() => (formula && a && b ? totalesTrozasComparados(a, b, formula) : null), [a, b, formula]);
  const trozaATroza = useMemo(() => (formula && a && b ? cambiosPorTroza(a.trozas ?? [], b.trozas ?? [], formula) : null), [a, b, formula]);
  const filas = useMemo(
    () => (diferencias ? (soloCambios ? diferencias.filas.filter(cambioTrozas) : diferencias.filas) : []),
    [diferencias, soloCambios],
  );

  /* B sólo puede ser de la fórmula de A. */
  const opcionesB = useMemo(() => recientes.filter((c) => c.id !== idA && (!resumenA || mismaFormula(c, resumenA))), [recientes, idA, resumenA]);

  const elegirA = useCallback((id: string) => {
    if (id === idB) { setIdB(idA); setIdA(id); return; }
    setIdA(id);
    const nueva = recientes.find((c) => c.id === id);
    const actualB = recientes.find((c) => c.id === idB);
    /* Otra fórmula: la B de antes ya no vale; se busca una de la nueva. */
    if (nueva && (!actualB || !mismaFormula(nueva, actualB))) setIdB(parejaPorDefectoTrozas(recientes, nueva)?.id ?? "");
  }, [idA, idB, recientes]);
  const elegirB = useCallback((id: string) => {
    if (id === idA) setIdA(idB);
    setIdB(id);
  }, [idA, idB]);
  const intercambiar = useCallback(() => { setIdA(idB); setIdB(idA); }, [idA, idB]);

  return {
    recientes, opcionesB, resumenA, resumenB, a, b, formula, comparables, cargando, error,
    elegirA, elegirB, intercambiar, dim, setDim, soloCambios, setSoloCambios, diferencias, totales, filas, trozaATroza,
  };
}
