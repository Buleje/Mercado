"use client";

/**
 * Las corridas del Libro con saldo, para poder declarar un reproceso **desde la
 * distribución** sin ir al Libro y volver.
 *
 * Por qué hace falta: la sugerencia sabe QUÉ conviene reprocesar y CUÁNTO, pero
 * el reproceso se declara contra una corrida de producción con saldo — y esa
 * corrida no la puede adivinar el cálculo (ADR-404 → ADR-316). Antes eso
 * obligaba a saltar al Libro por cada línea; ahora la lista viaja hasta acá y
 * el operario elige.
 *
 * Falla en silencio como `use-reprocesos-declarados`: esta pantalla es del
 * cubicador y no puede romperse porque el Libro esté apagado. Cuando eso pasa
 * queda `disponible: false` y la UI ofrece el camino de siempre (ir al Libro).
 */
import { useCallback, useEffect, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { tipoComercialDelProducto } from "@/lib/forestal/loctp-catalogos";

export interface CorridaParaReproceso {
  id: string;
  lineNo: number | null;
  fecha: string;
  especie: string | null;
  producto: string | null;
  unidad: string | null;
  /** Lo que la corrida todavía tiene en planta: el techo del reproceso. */
  disponible: number;
}

/** Sin tildes ni mayúsculas — la misma comparación que usa el resto del módulo. */
const norma = (v: string | null | undefined): string =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function useCorridasParaReproceso(): {
  corridas: CorridaParaReproceso[];
  cargando: boolean;
  /** `false` = el Libro no contestó (apagado o sin permiso): no es un error. */
  disponible: boolean;
  recargar: () => void;
} {
  const [corridas, setCorridas] = useState<CorridaParaReproceso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [disponible, setDisponible] = useState(true);
  const [token, setToken] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    ctpGet<{ corridas?: CorridaParaReproceso[] }>("/api/admin/forestal/ctp?disponibles=1")
      .then((r) => {
        if (!vivo) return;
        setCorridas((r.corridas ?? []).filter((c) => c.disponible > 0));
        setDisponible(true);
      })
      .catch(() => {
        if (!vivo) return;
        setCorridas([]);
        setDisponible(false);
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [token]);

  return {
    corridas,
    cargando,
    disponible,
    recargar: useCallback(() => setToken((t) => t + 1), []),
  };
}

/**
 * Las corridas de las que PUEDE salir este reproceso: mismo tipo comercial de
 * origen y, cuando las dos puntas la declaran, la misma especie.
 *
 * La especie se compara sólo si ambas la dicen: una corrida sin especie no se
 * esconde —el Libro admite huecos— pero tampoco se afirma que sea la de la
 * sugerencia. Las más grandes primero: es de donde se saca sin partir el saldo.
 */
export function corridasDelTipo(
  corridas: readonly CorridaParaReproceso[],
  desdeTipo: string,
  especie?: string,
): CorridaParaReproceso[] {
  const tipo = norma(desdeTipo);
  const esp = norma(especie);
  return corridas
    .filter((c) => norma(tipoComercialDelProducto(c.producto)) === tipo)
    .filter((c) => !esp || !c.especie || norma(c.especie) === esp)
    .sort((a, b) => b.disponible - a.disponible);
}
