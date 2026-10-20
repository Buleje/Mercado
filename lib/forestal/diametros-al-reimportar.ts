/**
 * Re-subir el inventario «Rolliza en patio» del SNIFFS completa los D1/D2 que
 * faltan en las trozas que YA están en el libro (Brandon, 20-10: «diámetros de
 * tus trozas»).
 *
 * Por qué hace falta: el inventario entra troza por troza y, si la guía ya
 * tiene su lista, `agregarTrozas` responde «ya tiene su lista de piezas» y el
 * archivo nuevo —que ahora sí trae D1(cm)/D2(cm)— no dejaba nada. Blas, 20-10:
 * 65 trozas de Tornillo con largo y ningún diámetro, y la distribución
 * (ADR-505) sólo podía controlar el largo.
 *
 * Reglas (las mismas de ADR-503/504: «sólo llenar lo vacío»):
 *  · se empareja por **Código Planta** (el que este centro pinta en la pieza:
 *    único en la guía) y, si no hay, por **Código Troza** — sólo cuando el
 *    código aparece UNA vez en cada lado. Repetido = no se adivina;
 *  · sólo la punta VACÍA viaja: un D1/D2 ya cargado (de la guía, de la planta,
 *    de otro archivo) nunca se pisa;
 *  · si el largo del libro y el del archivo difieren más de 30 cm no es la
 *    misma pieza (o se retrozó): no se toca.
 * El mes cerrado y la troza no recibida los decide `planearMedida` en el
 * servidor, bajo lock.
 *
 * PURO: sin red ni base.
 */

import { esSinCodigo } from "./consumo-trozas";
import { TOLERANCIA_LARGO_M } from "./medidas-desde-guia";

export interface TrozaYaEnElLibro {
  id: string;
  codigoPlanta: string | null;
  codificacion: string | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
}

export interface TrozaDelArchivo {
  codigoPlanta?: string | null;
  codificacion?: string | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
  largoM?: number | null;
}

export interface DiametroACompletar {
  id: string;
  d1Cm?: number;
  d2Cm?: number;
}

export interface PlanDiametros {
  completar: DiametroACompletar[];
  /** Ya tenían las dos puntas: el archivo no les agrega nada. */
  yaTenian: number;
  /** Código repetido (en el libro o en el archivo): no se adivina cuál es cuál. */
  ambiguas: string[];
  /** Mismo código y otro largo: no es la misma pieza. */
  largoDistinto: string[];
}

const positivo = (v: unknown): number | null => {
  const n = v == null || v === "" ? Number.NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const clave = (v: string | null | undefined): string | null =>
  v == null || esSinCodigo({ codificacion: v }) ? null : v.trim().toUpperCase();

function contar<T>(xs: readonly T[], k: (x: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const c = k(x);
    if (!c) continue;
    const l = m.get(c);
    if (l) l.push(x);
    else m.set(c, [x]);
  }
  return m;
}

export function diametrosParaCompletar(
  libro: readonly TrozaYaEnElLibro[],
  archivo: readonly TrozaDelArchivo[],
): PlanDiametros {
  const plan: PlanDiametros = { completar: [], yaTenian: 0, ambiguas: [], largoDistinto: [] };
  const conDiametro = archivo.filter((a) => positivo(a.d1Cm) != null || positivo(a.d2Cm) != null);
  if (conDiametro.length === 0) return plan;

  const libroPorPlanta = contar(libro, (t) => clave(t.codigoPlanta));
  const libroPorCodigo = contar(libro, (t) => clave(t.codificacion));
  const archivoPorPlanta = contar(conDiametro, (a) => clave(a.codigoPlanta));
  const archivoPorCodigo = contar(conDiametro, (a) => clave(a.codificacion));

  const usadas = new Set<string>();
  for (const a of conDiametro) {
    const cp = clave(a.codigoPlanta);
    const cod = clave(a.codificacion);
    let t: TrozaYaEnElLibro | undefined;
    let nombre = cp ?? cod ?? "";
    if (cp && libroPorPlanta.has(cp)) {
      const l = libroPorPlanta.get(cp)!;
      if (l.length > 1 || (archivoPorPlanta.get(cp)?.length ?? 0) > 1) {
        plan.ambiguas.push(cp);
        continue;
      }
      t = l[0];
    } else if (cod && libroPorCodigo.has(cod)) {
      nombre = cod;
      const l = libroPorCodigo.get(cod)!;
      if (l.length > 1 || (archivoPorCodigo.get(cod)?.length ?? 0) > 1) {
        plan.ambiguas.push(cod);
        continue;
      }
      t = l[0];
    }
    if (!t || usadas.has(t.id)) continue;
    usadas.add(t.id);

    const largoLibro = positivo(t.largoM);
    const largoArchivo = positivo(a.largoM);
    if (largoLibro != null && largoArchivo != null && Math.abs(largoLibro - largoArchivo) > TOLERANCIA_LARGO_M) {
      plan.largoDistinto.push(nombre);
      continue;
    }
    const d1 = positivo(t.d1Cm) == null ? positivo(a.d1Cm) : null;
    const d2 = positivo(t.d2Cm) == null ? positivo(a.d2Cm) : null;
    if (d1 == null && d2 == null) {
      plan.yaTenian++;
      continue;
    }
    plan.completar.push({ id: t.id, ...(d1 != null ? { d1Cm: d1 } : {}), ...(d2 != null ? { d2Cm: d2 } : {}) }); // sólo la punta vacía viaja
  }
  return plan;
}
