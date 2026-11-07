"use client";

/**
 * Las trozas que el repaso necesita para mirar llegada, especie, repetidas y
 * Ø (`reparto-revision-condiciones.ts`), armadas con lo que `useLotesAserrio`
 * ya trajo: el patio y los lotes del Libro. Sin pedidos nuevos.
 *
 * La troza de un lote no trae fechas (el GET de lotes no las manda): se le da
 * la de su GUÍA —recepción o, si no, el asiento—, tomada de cualquier troza
 * del patio que entró por la misma guía. Sin ninguna en el patio, queda sin
 * llegada y la condición calla en vez de adivinar.
 */

import { useMemo } from "react";
import { fechaIngresoDeTroza } from "@/lib/forestal/consumo-trozas";
import type { ContextoTrozasRevision, TrozaRevision } from "@/lib/forestal/reparto-revision";
import type { EstadoLotesAserrio } from "./use-lotes-aserrio";

export function useContextoRevision(estado: Pick<EstadoLotesAserrio, "lotes" | "trozas">): ContextoTrozasRevision {
  return useMemo(() => {
    const llegadaDeGuia = new Map<string, string>();
    const patio: TrozaRevision[] = estado.trozas.map((t) => {
      const guia = fechaIngresoDeTroza({ fechaRecepcion: null, guiaFechaRecepcion: t.guiaFechaRecepcion, fechaIngreso: t.fechaIngreso });
      if (guia && t.woodEntryId && !llegadaDeGuia.has(t.woodEntryId)) llegadaDeGuia.set(t.woodEntryId, guia);
      return { ...t, codigo: t.codigoPlanta ?? t.codificacion, llegada: fechaIngresoDeTroza(t) };
    });
    const lotes = new Map<string, { code: string; trozas: TrozaRevision[] }>();
    const deLotes: TrozaRevision[] = [];
    for (const l of estado.lotes) {
      const trozas = l.trozas.map((t) => ({
        ...t,
        permiso: t.permiso ?? l.permiso ?? null,
        codigo: t.codigoPlanta ?? t.codificacion,
        llegada: t.woodEntryId ? llegadaDeGuia.get(t.woodEntryId) ?? null : null,
      }));
      lotes.set(l.id, { code: l.code, trozas });
      deLotes.push(...trozas);
    }
    return { libro: [...patio, ...deLotes], lotes };
  }, [estado.lotes, estado.trozas]);
}
