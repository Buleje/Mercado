"use client";

/**
 * El estado de la planilla «Cubicar Oxapampa» (2026-09-26): lo tipeado por
 * troza, lo guardado contra lo que se compara, los errores por celda y el
 * guardado por `useGuardarMedidas` (el mismo PATCH que usa el patio).
 *
 * La base se toma UNA vez, cuando llegan las trozas: si la lista de atrás se
 * relee mientras la planilla está abierta, lo tipeado no se pisa. Después de
 * guardar, la base pasa a ser lo que el SERVIDOR devolvió (con su pt
 * congelado); las filas rechazadas conservan lo tipeado para corregirlo.
 *
 * `conCm` apagado = las celdas en cm no existen: ni viajan, ni frenan con un
 * error escondido, ni cuentan como «sin guardar» (lo tipeado queda en la fila
 * y vuelve al prender la pastilla).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cambioDeFila,
  erroresDeFila,
  faltaDeFila,
  filaDeTroza,
  filaSinCm,
  filaSinGuardar,
  totalDePlanilla,
  type BaseTrozaPlanilla,
  type CampoPlanilla,
  type FilaPlanilla,
} from "@/lib/forestal/planilla-oxapampa";
import { useGuardarMedidas } from "./use-medidas-trozas";

export interface ResultadoPlanilla {
  guardadas: number;
  rechazadas: number;
}

export function usePlanillaOxapampa<T extends BaseTrozaPlanilla>(
  trozas: readonly T[] | null,
  { conCm }: { conCm: boolean },
) {
  const [bases, setBases] = useState<Map<string, BaseTrozaPlanilla> | null>(null);
  const [filas, setFilas] = useState<Record<string, FilaPlanilla>>({});
  /** id → motivos de lo que el servidor NO guardó en el último intento. */
  const [rechazos, setRechazos] = useState<Map<string, string[]>>(new Map());
  const [ultimo, setUltimo] = useState<ResultadoPlanilla | null>(null);
  const { guardar, guardando, error } = useGuardarMedidas();

  useEffect(() => {
    if (bases || !trozas) return;
    setBases(new Map(trozas.map((t) => [t.id, t])));
    setFilas(Object.fromEntries(trozas.map((t) => [t.id, filaDeTroza(t)])));
  }, [bases, trozas]);

  const set = useCallback((id: string, campo: CampoPlanilla, texto: string) => {
    setFilas((f) => (f[id] ? { ...f, [id]: { ...f[id], [campo]: texto } } : f));
    setUltimo(null);
  }, []);

  /** Lo que cuenta de cada fila: sin los cm si la pastilla está apagada. */
  const efectivas = useMemo(
    () =>
      conCm
        ? filas
        : Object.fromEntries(Object.entries(filas).map(([id, f]) => [id, filaSinCm(f)])),
    [filas, conCm],
  );

  const errores = useMemo(() => {
    const out = new Map<string, Partial<Record<CampoPlanilla, string>>>();
    for (const [id, f] of Object.entries(efectivas)) {
      const e = erroresDeFila(f);
      if (Object.keys(e).length > 0) out.set(id, e);
    }
    return out;
  }, [efectivas]);

  const cambios = useMemo(() => {
    if (!bases) return [];
    const out = [];
    for (const b of bases.values()) {
      const f = efectivas[b.id];
      if (!f || errores.has(b.id)) continue;
      const c = cambioDeFila(b, f);
      if (c) out.push(c);
    }
    return out;
  }, [bases, efectivas, errores]);

  /* Filas con algo tipeado que se pierde al cerrar: los cambios válidos Y las
     filas en rojo (que no están en `cambios` porque no viajan). */
  const sinGuardar = useMemo(() => {
    if (!bases) return 0;
    let n = 0;
    for (const b of bases.values()) {
      const f = efectivas[b.id];
      if (f && filaSinGuardar(b, f)) n += 1;
    }
    return n;
  }, [bases, efectivas]);

  /** Filas con una o dos celdas: sin pt hasta completarlas (media medida = sin cubicar). */
  const aMedias = useMemo(
    () => Object.values(filas).filter((f) => faltaDeFila(f) != null).length,
    [filas],
  );
  const listaBases = useMemo(() => (bases ? [...bases.values()] : []), [bases]);
  const total = useMemo(() => totalDePlanilla(listaBases, filas), [listaBases, filas]);

  const guardarCambios = useCallback(async (): Promise<ResultadoPlanilla | null> => {
    if (cambios.length === 0 || errores.size > 0) return null;
    const r = await guardar(cambios);
    if (!r) return null;
    const porId = new Map<string, string[]>();
    for (const x of r.rechazadas) porId.set(x.id, [...(porId.get(x.id) ?? []), x.motivo]);
    setBases((prev) => {
      const next = new Map(prev ?? []);
      for (const t of r.trozas) {
        const antes = next.get(t.id);
        if (antes) next.set(t.id, { ...antes, ...t });
      }
      return next;
    });
    setFilas((prev) => {
      const next = { ...prev };
      for (const t of r.trozas) {
        if (porId.has(t.id)) continue;
        const guardada = filaDeTroza(t);
        /* Con la pastilla apagada los cm no viajaron: lo tipeado en ellos se queda. */
        const antes = prev[t.id];
        next[t.id] = conCm || !antes ? guardada : { ...guardada, d1Cm: antes.d1Cm, d2Cm: antes.d2Cm };
      }
      return next;
    });
    setRechazos(porId);
    const res = { guardadas: cambios.length - porId.size, rechazadas: porId.size };
    setUltimo(res);
    return res;
  }, [cambios, errores.size, guardar, conCm]);

  return {
    listo: bases != null,
    bases,
    filas,
    set,
    errores,
    cambios,
    sinGuardar,
    total,
    aMedias,
    rechazos,
    ultimo,
    guardar: guardarCambios,
    guardando,
    error,
  };
}
