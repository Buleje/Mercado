/**
 * Agrupa lo tildado en «Llevar al cubicador» por PERMISO × especie × tipo
 * (Brandon, 2026-10-19: «que sólo separe según el permiso, no irá todo
 * unificado»). Las trozas del patio se parten por el permiso de cada troza;
 * un lote o una corrida es una sola parte. Cada fila = Σ exacta de sus partes
 * redondeada UNA vez a 3 decimales; el total = Σ de las filas ya redondeadas
 * (regla GTF 2026-10-03, `lib/forestal/gtf-redondeo.ts`). La agrupación vive
 * en `lib/forestal/capacidad-por-permiso.ts`: la misma que usan los totales
 * de rolliza/aserrada del modal, así no pueden decir números distintos.
 */

import { totalizarGTF } from "@/lib/forestal/gtf-redondeo";
import { itemsPorPermiso, type CandidatoDeCapacidad } from "@/lib/forestal/capacidad-a-bloques";
import { agruparPorPermiso, claveDePermiso, type FilaPorPermiso } from "@/lib/forestal/capacidad-por-permiso";

export type FilaResumenLlevar = FilaPorPermiso;

export interface ResumenLlevar {
  filas: FilaResumenLlevar[];
  totalM3: number;
  totalPiezas: number;
  /** m³ de TODO lo que ofrece el modal (mismas reglas), para «de X disponibles». */
  disponibleM3: number;
  /** Subtotal por tipo: la rolliza y la ya aserrada no se miden igual, así que se ven también por separado. */
  porTipo: { rolliza: number; aserrada: number };
  /** Cuántos permisos CON código hay en lo tildado («sin permiso» y «mezclados» no son un permiso). */
  permisos: number;
}

type Cand = Pick<CandidatoDeCapacidad, "especie" | "tipo" | "m3" | "piezas"> &
  Partial<Pick<CandidatoDeCapacidad, "permiso" | "partes" | "trozaIds">>;

const agrupar = (candidatos: readonly Cand[]) => agruparPorPermiso(itemsPorPermiso(candidatos));

export function resumenDeLlevar(
  seleccion: readonly Cand[],
  todos: readonly Cand[],
): ResumenLlevar {
  const filas = agrupar(seleccion);
  const t = totalizarGTF(filas);
  return {
    filas,
    totalM3: t.m3,
    totalPiezas: t.piezas,
    disponibleM3: totalizarGTF(agrupar(todos)).m3,
    porTipo: {
      rolliza: totalizarGTF(filas.filter((f) => f.tipo === "rolliza")).m3,
      aserrada: totalizarGTF(filas.filter((f) => f.tipo === "aserrada")).m3,
    },
    permisos: new Set(filas.filter((f) => f.permiso).map(claveDePermiso)).size,
  };
}
