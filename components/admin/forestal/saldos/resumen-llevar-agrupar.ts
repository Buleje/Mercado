/**
 * Agrupa lo tildado en «Llevar al cubicador» por especie × tipo (rolliza / ya
 * aserrada): son las dos cosas que la lista ya muestra en cada línea (chip de
 * especie y chip de tipo). Cada fila = Σ exacta de sus líneas redondeada UNA
 * vez a 3 decimales; el total = Σ de las filas ya redondeadas (regla GTF
 * 2026-10-03, `lib/forestal/gtf-redondeo.ts`).
 */

import { m3OficialDeFila, totalizarGTF } from "@/lib/forestal/gtf-redondeo";
import type { CandidatoDeCapacidad } from "@/lib/forestal/capacidad-a-bloques";

export interface FilaResumenLlevar {
  clave: string;
  /** Vacía = «Sin especie». */
  especie: string;
  tipo: "rolliza" | "aserrada";
  piezas: number;
  m3: number;
}

export interface ResumenLlevar {
  filas: FilaResumenLlevar[];
  totalM3: number;
  totalPiezas: number;
  /** m³ de TODO lo que ofrece el modal (mismas reglas), para «de X disponibles». */
  disponibleM3: number;
  /** Subtotal por tipo: la rolliza y la ya aserrada no se miden igual, así que se ven también por separado. */
  porTipo: { rolliza: number; aserrada: number };
}

type Cand = Pick<CandidatoDeCapacidad, "especie" | "tipo" | "m3" | "piezas">;

function agrupar(candidatos: readonly Cand[]): FilaResumenLlevar[] {
  const grupos = new Map<string, { especie: string; tipo: "rolliza" | "aserrada"; m3: number[]; piezas: number }>();
  for (const c of candidatos) {
    const especie = c.especie.trim();
    const clave = `${especie.toLowerCase()}|${c.tipo}`;
    const g = grupos.get(clave) ?? { especie, tipo: c.tipo, m3: [], piezas: 0 };
    g.m3.push(c.m3);
    g.piezas += c.piezas > 0 ? c.piezas : 0;
    grupos.set(clave, g);
  }
  return [...grupos.entries()]
    .map(([clave, g]) => ({ clave, especie: g.especie, tipo: g.tipo, piezas: g.piezas, m3: m3OficialDeFila(g.m3) }))
    .sort((a, b) => b.m3 - a.m3);
}

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
  };
}
