/**
 * medidas-troza.ts — qué se guarda cuando el aserradero mide una troza en el
 * patio (Brandon, 2026-09-26). PURO y client-safe: el endpoint valida con
 * `medidasTrozasSchema` y la DB class decide con `planearMedida`; la pantalla
 * puede usar los mismos topes.
 *
 * Dos medidas distintas viajan juntas porque se toman con la misma cinta:
 *
 * 1. **Oxapampa** (pulgadas y pies → pt, `cubicacion-oxapampa.ts`). Dato
 *    COMERCIAL: con él se paga la madera, el flete y el servicio. No es del
 *    libro, así que no lo frena el mes cerrado (como `etiquetadaEn`, ADR-436),
 *    y se puede corregir: una medida nueva recalcula y vuelve a congelar el pt.
 * 2. **D1/D2 en cm** cuando la guía no los trajo (en Blas, 77 de 84 trozas).
 *    Éstos SÍ son del libro: sólo se escriben sobre vacío —el dato de SERFOR
 *    nunca se pisa— y los frena el período cerrado. `volumenM3` no se toca.
 */

import { z } from "zod";
import { LIMITES_OXAPAMPA, ptOxapampa } from "./cubicacion-oxapampa";

/** Tope de piezas por pedido: una guía grande entera, no el patio de un año. */
export const MAX_TROZAS_POR_MEDICION = 500;

/** Tope de un diámetro en cm (4 m): más es un dedo que se fue. */
export const MAX_DIAMETRO_CM = 400;

/** Dos decimales: lo que admite la columna (`Decimal(8,2)`). */
export const redondear2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

const pulgadas = z.number().positive("Debe ser mayor que 0").max(LIMITES_OXAPAMPA.pulgadasMax, `Máximo ${LIMITES_OXAPAMPA.pulgadasMax}"`);
const pies = z.number().positive("Debe ser mayor que 0").max(LIMITES_OXAPAMPA.piesMax, `Máximo ${LIMITES_OXAPAMPA.piesMax} pies`);
const centimetros = z.number().positive("Debe ser mayor que 0").max(MAX_DIAMETRO_CM, `Máximo ${MAX_DIAMETRO_CM} cm`);

/**
 * Una pieza. En Oxapampa, ausente = no se toca y `null` = se borra esa medida
 * (se tipeó en la troza equivocada). En cm, `null` y ausente son lo mismo: no
 * hay forma de BORRAR un centímetro del libro desde acá.
 */
export const medidaTrozaSchema = z.object({
  id: z.string().trim().min(1).max(60),
  oxD1Pulg: pulgadas.nullable().optional(),
  oxD2Pulg: pulgadas.nullable().optional(),
  oxLargoPies: pies.nullable().optional(),
  d1Cm: centimetros.nullable().optional(),
  d2Cm: centimetros.nullable().optional(),
});

export const medidasTrozasSchema = z.object({
  trozas: z.array(medidaTrozaSchema).min(1).max(MAX_TROZAS_POR_MEDICION),
});

export type CambioMedidaTroza = z.infer<typeof medidaTrozaSchema>;

/** Lo que la DB class lee de cada pieza (bajo lock) para decidir. */
export interface EstadoTrozaParaMedir {
  id: string;
  oxD1Pulg: number | null;
  oxD2Pulg: number | null;
  oxLargoPies: number | null;
  d1Cm: number | null;
  d2Cm: number | null;
  noRecepcionada: boolean;
  /** Ni borrada ni anulada/rechazada. */
  guiaViva: boolean;
  /** Etiqueta del período cerrado de su guía («Agosto 2026»), o `null` si está abierto. */
  periodoCerrado: string | null;
}

export interface PlanMedida {
  id: string;
  /** `null` = no se toca la cubicación Oxapampa. Si viene, son los valores FINALES. */
  ox: { d1: number | null; d2: number | null; largo: number | null; pt: number | null } | null;
  /** Centímetros a escribir sobre vacío. `null` en una punta = esa no se escribe. */
  cm: { d1: number | null; d2: number | null } | null;
  /** Lo que NO se guardó de esta pieza, en palabras. El resto de la pieza sí. */
  rechazos: string[];
}

const mismo = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Decide qué se escribe de UNA pieza. `t` indefinido = el id no es de este
 * negocio (o no existe): se rechaza sin decir más — no se confirma que exista
 * en otro.
 */
export function planearMedida(c: CambioMedidaTroza, t: EstadoTrozaParaMedir | undefined): PlanMedida {
  const plan: PlanMedida = { id: c.id, ox: null, cm: null, rechazos: [] };
  if (!t) {
    plan.rechazos.push("No existe en este negocio.");
    return plan;
  }
  if (!t.guiaViva) {
    plan.rechazos.push("Su guía está anulada o rechazada: no se mide.");
    return plan;
  }
  if (t.noRecepcionada) {
    plan.rechazos.push("Figura como no llegada al patio: márcala como recibida antes de medirla.");
    return plan;
  }

  // ── Oxapampa: dato comercial, se corrige libre ────────────────────────────
  const tocaOx = c.oxD1Pulg !== undefined || c.oxD2Pulg !== undefined || c.oxLargoPies !== undefined;
  if (tocaOx) {
    const valor = (nuevo: number | null | undefined, actual: number | null) =>
      nuevo === undefined ? actual : nuevo === null ? null : redondear2(nuevo);
    const d1 = valor(c.oxD1Pulg, t.oxD1Pulg);
    const d2 = valor(c.oxD2Pulg, t.oxD2Pulg);
    const largo = valor(c.oxLargoPies, t.oxLargoPies);
    plan.ox = { d1, d2, largo, pt: ptOxapampa({ d1Pulg: d1, d2Pulg: d2, largoPies: largo }) };
  }

  // ── D1/D2 en cm: del libro, sólo sobre vacío y con el período abierto ─────
  const punta = (nombre: "D1" | "D2", nuevo: number | null | undefined, actual: number | null): number | null => {
    if (nuevo == null) return null;
    const v = redondear2(nuevo);
    if (actual != null) {
      if (!mismo(actual, v)) plan.rechazos.push(`${nombre} ya tiene ${actual} cm cargado: no se pisa.`);
      return null;
    }
    if (t.periodoCerrado) {
      plan.rechazos.push(
        `${nombre}: el período ${t.periodoCerrado} está cerrado y los centímetros son del libro. Reábrelo para cargarlos.`,
      );
      return null;
    }
    return v;
  };
  const d1Cm = punta("D1", c.d1Cm, t.d1Cm);
  const d2Cm = punta("D2", c.d2Cm, t.d2Cm);
  if (d1Cm != null || d2Cm != null) plan.cm = { d1: d1Cm, d2: d2Cm };

  const trajoCm = c.d1Cm != null || c.d2Cm != null;
  if (!tocaOx && !trajoCm) plan.rechazos.push("No trae ninguna medida.");
  return plan;
}
