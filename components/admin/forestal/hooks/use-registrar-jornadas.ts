"use client";

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { registrarJornadas, type ResumenJornadas } from "@/lib/forestal/registrar-jornadas";
import type { Jornada } from "@/lib/forestal/consumo-en-jornadas";
import type { EstadoLotesAserrio } from "./use-lotes-aserrio";
import { paquetesDeGrupos } from "@/lib/forestal/paquetes-de-jornada";

/**
 * use-registrar-jornadas — el cableado entre el reparto y el libro (ADR-373).
 *
 * La política de qué hacer cuando una escritura falla vive en
 * `registrar-jornadas.ts` (pura, con tests). Acá sólo se arma el cuerpo: las
 * trozas del día y sus paquetes, en UN pedido por jornada (ADR-519, fase 2):
 * el servidor consume y declara en una transacción, así que un corte no deja
 * una corrida abierta a medio registrar.
 *
 * Los códigos de paquete se piden **una vez** antes de empezar y se van
 * reservando en memoria: pedirlos por jornada devolvería el mismo número dos
 * veces —el anterior todavía no está escrito— y el servidor rechazaría la
 * segunda por código duplicado.
 */

export async function codigosExistentes(): Promise<string[]> {
  try {
    const r = await fetch("/api/admin/forestal/ctp?codigosPaquete=1", { credentials: "include" });
    if (!r.ok) return [];
    const j = (await r.json()) as { codigos?: string[] };
    return j.codigos ?? [];
  } catch {
    /* Sin la lista se arranca una serie nueva: es peor no poder registrar. */
    return [];
  }
}

/* Los paquetes de una jornada se arman en `lib/forestal/paquetes-de-jornada.ts` (lo usa también el servidor). */
export { paquetesDeGrupos, type PaqueteParaLibro } from "@/lib/forestal/paquetes-de-jornada";

/** Lo único del estado de lotes que hace falta para escribir jornadas: recargarlo al terminar. */
export type LotesParaJornadas = Pick<EstadoLotesAserrio, "recargar">;

export interface OpcionesRegistro {
  loteId: string;
  /** Nota del consumo (casillero 11) mientras la producción está por declarar. */
  observaciones?: string | null;
  /** Línea de producción de la corrida; sin valor, el servidor pone `LP`. */
  lineaProduccion?: "LP" | "LPC";
  /** Nota de la producción declarada; sin valor, «Jornada N de M». */
  notaProduccion?: (j: Jornada) => string;
  /**
   * Exigir que entren TODAS las trozas pedidas (ADR-464): si una se fue a otra
   * corrida entre el plan y el pedido, la producción del día NO se declara
   * sobre menos madera (I1: nunca atribuir de más). Desde ADR-519 el servidor
   * lo decide antes de escribir: el día no se registra y no queda corrida.
   */
  exigirTodas?: boolean;
}

export function useRegistrarJornadas(estado: LotesParaJornadas) {
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const registrar = useCallback(
    async (jornadas: readonly Jornada[], opts: OpcionesRegistro): Promise<ResumenJornadas> => {
      setOcupado(true);
      setAvance({ hechas: 0, total: jornadas.length });
      const existentes = await codigosExistentes();
      const reservados: string[] = [];
      try {
        return await registrarJornadas(jornadas, {
          onAvance: (hechas, total) => setAvance({ hechas, total }),
          /* UN pedido por jornada: consumir + declarar en una transacción del
             servidor. Si falla, no queda nada escrito y el día se reintenta. */
          registrar: async (j) => {
            const paquetes = paquetesDeGrupos(j.grupos, j.fecha, existentes, reservados);
            const r = await fetch("/api/admin/forestal/lotes-aserrio", {
              method: "PATCH",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              credentials: "include",
              body: JSON.stringify({
                accion: "registrar-jornada",
                loteId: opts.loteId,
                trozaIds: j.trozaIds,
                fecha: j.fecha,
                observaciones: opts.observaciones ?? `Jornada ${j.dia} del turno cubicado`,
                ...(opts.exigirTodas ? { exigirTodas: true } : {}),
                produccion: {
                  quantity: j.m3,
                  unit: "m3",
                  observations: opts.notaProduccion?.(j) ?? `Jornada ${j.dia} de ${jornadas.length} · cubicación repartida`,
                  ...(opts.lineaProduccion ? { lineaProduccion: opts.lineaProduccion } : {}),
                  pieces: j.piezas,
                  productType: paquetes[0]?.productType ?? null,
                  presentacion: paquetes[0]?.presentacion ?? null,
                  codigoProducto: paquetes[0]?.codigo ?? null,
                  paquetes,
                },
              }),
            });
            const json = (await r.json().catch(() => ({}))) as {
              corrida?: { id: string; lineNo: number };
              message?: string;
              error?: string;
            };
            if (!r.ok || !json.corrida) throw new Error(json.message ?? json.error ?? `El servidor respondió ${r.status}`);
            return json.corrida;
          },
        });
      } finally {
        invalidarCtp("/forestal/");
        await estado.recargar();
        setOcupado(false);
        setAvance(null);
      }
    },
    [estado],
  );

  return { registrar, avance, ocupado };
}
