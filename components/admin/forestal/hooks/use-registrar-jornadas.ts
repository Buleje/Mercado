"use client";

import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { presentacionSugerida, productoDelTipoComercial } from "@/lib/forestal/loctp-catalogos";
import { sugerirCodigoPaquete } from "@/lib/forestal/produccion-paquetes";
import { registrarJornadas, type ResumenJornadas } from "@/lib/forestal/registrar-jornadas";
import type { Jornada } from "@/lib/forestal/consumo-en-jornadas";
import type { AsignacionGrupo } from "@/lib/forestal/cubicacion-reparto";
import type { EstadoLotesAserrio } from "./use-lotes-aserrio";

/**
 * use-registrar-jornadas — el cableado entre el reparto y el libro (ADR-373).
 *
 * La política de qué hacer cuando una escritura falla vive en
 * `registrar-jornadas.ts` (pura, con tests). Acá sólo se arman los cuerpos:
 * consumir las trozas del día y declarar sus paquetes.
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

/** Un paquete tal como lo pide `declarar_produccion` / `ampliar_produccion`. */
export interface PaqueteParaLibro {
  codigo: string;
  productType: string;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  observations: string | null;
}

/**
 * Los grupos de una jornada (o de un complemento) como paquetes del Libro:
 * uno por grupo, con un código nuevo reservado en `reservados` para que dos
 * pedidos seguidos no repitan número.
 */
export function paquetesDeGrupos(
  grupos: readonly AsignacionGrupo[],
  fecha: string,
  existentes: readonly string[],
  reservados: string[],
): PaqueteParaLibro[] {
  return grupos.map((g) => {
    const codigo = sugerirCodigoPaquete(existentes, { hoy: new Date(`${fecha}T12:00:00`), ocupados: reservados });
    reservados.push(codigo);
    /* Una medida por grupo es lo común; con varias se declara la primera y el
       resto queda en la observación, porque el paquete del libro tiene UN
       juego de medidas. */
    const m = g.medidas[0];
    /* El libro se escribe con el nombre del CATÁLOGO, no con el del patio:
       «Comercial» entraba tal cual y la presentación quedaba vacía porque el
       catálogo busca «MADERA ASERRADA (COMERCIAL)». */
    const producto = productoDelTipoComercial(g.label) ?? g.label;
    return {
      codigo,
      productType: producto,
      presentacion: presentacionSugerida(producto) ?? null,
      cantidad: g.piezas,
      volumenM3: g.m3,
      espesorCm: m?.espesor ?? null,
      anchoCm: m?.ancho ?? null,
      largoM: m?.largo ?? null,
      observations:
        g.medidas.length > 1 ? `Medidas: ${g.medidas.map((x) => `${x.medida} (${x.piezas})`).join(", ")}` : null,
    };
  });
}

/** Lo único del estado de lotes que hace falta para escribir jornadas. */
export type LotesParaJornadas = Pick<EstadoLotesAserrio, "consumirEnPatio" | "recargar">;

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
   * sobre menos madera (I1: nunca atribuir de más) y la corrida queda abierta
   * con su N° para revisarla.
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
      /** Cuántas piezas entraron de verdad en cada corrida abierta. */
      const entraron = new Map<string, number>();
      try {
        return await registrarJornadas(jornadas, {
          onAvance: (hechas, total) => setAvance({ hechas, total }),
          consumir: async (j) => {
            const r = await estado.consumirEnPatio({
              loteId: opts.loteId,
              trozaIds: j.trozaIds,
              fecha: j.fecha,
              observaciones: opts.observaciones ?? `Jornada ${j.dia} del turno cubicado`,
            });
            entraron.set(r.corrida.id, r.piezas);
            return r.corrida;
          },
          declarar: async (corridaId, j) => {
            const piezasQueEntraron = entraron.get(corridaId);
            if (opts.exigirTodas && piezasQueEntraron != null && piezasQueEntraron < j.trozaIds.length) {
              throw new Error(
                `Entraron ${piezasQueEntraron} de ${j.trozaIds.length} trozas: la producción del día no se declara sobre menos madera. ` +
                  "Revisa la corrida en el Libro.",
              );
            }
            const paquetes = paquetesDeGrupos(j.grupos, j.fecha, existentes, reservados);
            const r = await fetch("/api/admin/forestal/ctp", {
              method: "PATCH",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              credentials: "include",
              body: JSON.stringify({
                action: "declarar_produccion",
                id: corridaId,
                quantity: j.m3,
                unit: "m3",
                observations: opts.notaProduccion?.(j) ?? `Jornada ${j.dia} de ${jornadas.length} · cubicación repartida`,
                ...(opts.lineaProduccion ? { lineaProduccion: opts.lineaProduccion } : {}),
                pieces: j.piezas,
                productType: paquetes[0]?.productType ?? null,
                presentacion: paquetes[0]?.presentacion ?? null,
                codigoProducto: paquetes[0]?.codigo ?? null,
                paquetes,
              }),
            });
            if (!r.ok) {
              const j2 = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
              throw new Error(j2.message ?? j2.error ?? `El servidor respondió ${r.status}`);
            }
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
