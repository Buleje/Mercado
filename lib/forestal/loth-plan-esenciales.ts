/**
 * Qué campos del alta de un plan son esenciales, según el tipo de documento.
 *
 * Brandon (2026-10-07): «resalta los campos a rellenar esenciales». Veinte
 * campos con un « *» suelto no dicen cuáles importan. Pero tampoco se pueden
 * inventar obligatorios: **el servidor sólo exige el titular**
 * (`app/api/admin/forestal/plan/route.ts` → `titularName: min(2)`). Todo lo
 * demás es opcional para guardar, y se muestra como **recomendado**, con el
 * motivo concreto que lo hace importar:
 *
 *   · N° de documento / código del registro → con él se nombra el plan en el
 *     libro (`nombreDelPlan`); sin él aparece con el nombre del titular.
 *   · Regente forestal → sólo donde la norma lo pide (`meta.regente ===
 *     "obligatorio"`: PGMF, PO, PMFI). Firma el informe de ejecución.
 *   · Vigencia hasta → sólo bosque natural (en plantación es opcional): de ahí
 *     salen el aviso de vencimiento y el plazo del informe de ejecución.
 *   · Especies registradas → sólo el ALTA de una plantación: son la base del
 *     saldo (ADR-459).
 *
 * PURO: sin React ni fetch.
 */

import { metaDe, rotulosDe } from "./loth-tipos-plan";

export type CampoEsencial = "titularName" | "planNumber" | "regenteName" | "vigenciaHasta" | "especies";
export type NivelEsencial = "obligatorio" | "recomendado";

export interface Esencial {
  campo: CampoEsencial;
  /** Cómo se llama el campo en ESTE tipo de documento. */
  rotulo: string;
  nivel: NivelEsencial;
  /** Por qué importa, en una línea. */
  motivo: string;
  lleno: boolean;
}

export interface DatosEsenciales {
  planType: string;
  titularName: string;
  planNumber: string;
  regenteName: string;
  vigenciaHasta: string;
}

/** El id del control de cada esencial: el contador lleva el foco ahí. */
export const idEsencial = (campo: CampoEsencial): string => `plan-esencial-${campo}`;

const conTexto = (v: string, min = 1) => v.trim().length >= min;

export function esencialesDe(
  f: DatosEsenciales,
  opts: { llevaEspecies: boolean; especiesConVolumen: number },
): Esencial[] {
  const meta = metaDe(f.planType);
  const rot = rotulosDe(f.planType);
  const lista: Esencial[] = [
    {
      campo: "titularName",
      rotulo: "Titular",
      nivel: "obligatorio",
      motivo: "Sin titular el plan no se puede crear.",
      // El servidor pide 2 caracteres como mínimo: la misma regla acá.
      lleno: conTexto(f.titularName, 2),
    },
    {
      campo: "planNumber",
      rotulo: rot.numero,
      nivel: "recomendado",
      motivo: "Con este número se reconoce el plan en el libro.",
      lleno: conTexto(f.planNumber),
    },
  ];
  if (meta.regente === "obligatorio") {
    lista.push({
      campo: "regenteName",
      rotulo: "Regente forestal",
      nivel: "recomendado",
      motivo: `La norma lo pide para un ${meta.sigla}: firma el informe de ejecución con el titular.`,
      lleno: conTexto(f.regenteName, 2),
    });
  }
  if (!rot.vigenciaOpcional) {
    lista.push({
      campo: "vigenciaHasta",
      rotulo: "Vigencia hasta",
      nivel: "recomendado",
      motivo: "Con esta fecha se avisa el vencimiento y el plazo del informe de ejecución.",
      lleno: conTexto(f.vigenciaHasta),
    });
  }
  if (opts.llevaEspecies) {
    lista.push({
      campo: "especies",
      rotulo: "Especies registradas",
      nivel: "recomendado",
      motivo: "Son la base del saldo: la tala y el despacho descuentan de acá.",
      lleno: opts.especiesConVolumen > 0,
    });
  }
  return lista;
}

export interface ResumenEsenciales {
  total: number;
  faltan: number;
  faltanObligatorios: number;
  /** El primero que falta: los obligatorios van antes. */
  primero: Esencial | null;
}

export function resumirEsenciales(lista: readonly Esencial[]): ResumenEsenciales {
  const faltantes = lista.filter((e) => !e.lleno);
  const obligatorios = faltantes.filter((e) => e.nivel === "obligatorio");
  return {
    total: lista.length,
    faltan: faltantes.length,
    faltanObligatorios: obligatorios.length,
    primero: obligatorios[0] ?? faltantes[0] ?? null,
  };
}

/** «Te faltan 2 de 4 esenciales» · «Te falta 1 de 3 esenciales» · «Esenciales completos». */
export function textoContador(r: ResumenEsenciales): string {
  if (r.faltan === 0) return "Esenciales completos";
  return `Te falta${r.faltan === 1 ? "" : "n"} ${r.faltan} de ${r.total} esenciales`;
}
