/**
 * Una especie del plan de manejo — o del REGISTRO de una plantación (ADR-459).
 *
 * Dos cosas que comparten el alta del plan (`POST /api/admin/forestal/plan`,
 * con `species[]`), el alta suelta (`/plan/species`) y el libro (T7):
 *
 *  1. Los campos de una especie y cómo se validan. Una sola definición: si cada
 *     ruta tuviera la suya, la segunda se quedaría corta el día que se sume un
 *     campo (memoria «campos copiados a mano se quedan cortos»).
 *  2. Cuándo la especie de una línea del libro ES una del registro. Siempre por
 *     clave (`claveEspecie`): el registro copia «Tornillo (Cedrelinga
 *     catenaeformis)» y el libro anota «Tornillo»; compararlos como texto
 *     acusaba de infracción a quien estaba en regla.
 *
 * Client-safe: Zod y funciones puras, sin base.
 */

import { z } from "zod";
import { claveEspecie, resolverEspecie, type EspecieReconocible } from "./loth-constants";

/** Tope de especies que entran con el alta del plan (contrato ADR-459). */
export const MAX_ESPECIES_ALTA = 60;
export const ANIO_INSTALACION_MIN = 1900;
export const ANIO_INSTALACION_MAX = 2100;

/**
 * Un casillero vacío es «no se sabe» (`null`), nunca 0. Sin esto,
 * `z.coerce.number()` convierte `""` en 0 y una superficie que nadie declaró
 * quedaría guardada como «0 ha».
 */
const vacioANull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** Los campos de una especie, sin el plan al que pertenece. */
export const especieDelPlanSchema = z.object({
  speciesCommon: z.string().trim().min(1).max(120),
  speciesScientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),
  categoria: z.string().trim().max(10).nullable().optional(),
  volumenAutorizadoM3: z.coerce.number().positive().max(9999999),
  arbolesAutorizados: z.coerce.number().int().nonnegative().max(999999).nullable().optional(),
  valorEstadoNaturalSoles: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  precioVentaSoles: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  /** Plantación: año en que se instaló la especie (ADR-459). */
  anioInstalacion: z.preprocess(
    vacioANull,
    z.coerce.number().int().min(ANIO_INSTALACION_MIN).max(ANIO_INSTALACION_MAX).nullable().optional(),
  ),
  /** Plantación: hectáreas que ocupa la especie (ADR-459). */
  superficieHa: z.preprocess(vacioANull, z.coerce.number().nonnegative().max(9999999).nullable().optional()),
});
export type EspecieDelPlanInput = z.infer<typeof especieDelPlanSchema>;

/**
 * La lista de especies que entra con el alta del plan: hasta 60 y sin la misma
 * especie dos veces (por clave). Dos filas «Bolaina» y «bolaina» harían que
 * cada una se lleve el volumen talado entero: el saldo se contaría doble.
 */
export const especiesDelAltaSchema = z
  .array(especieDelPlanSchema)
  .max(MAX_ESPECIES_ALTA)
  .superRefine((filas, ctx) => {
    const vistas = new Map<string, number>();
    filas.forEach((f, i) => {
      const k = claveEspecie(f.speciesCommon);
      const antes = vistas.get(k);
      if (k && antes != null) {
        ctx.addIssue({
          code: "custom",
          path: [i, "speciesCommon"],
          message: `«${f.speciesCommon}» ya está en la fila ${antes + 1}: una especie va una sola vez en el registro.`,
        });
      } else if (k) vistas.set(k, i);
    });
  });

/** Lo que hace falta de una especie del registro para reconocerla. */
export type EspecieRegistrada = EspecieReconocible;

/**
 * ¿La especie de la línea está en el registro? Es `resolverEspecie` (por clave
 * común o, si los dos lo traen, por el científico): la MISMA regla con la que
 * T6 busca el techo y el saldo descuenta. «Bolaina» y «Bolaina blanca» con el
 * mismo *Guazuma crinita* son la misma especie escrita distinto.
 */
export function especieEnRegistro(
  registro: readonly EspecieRegistrada[],
  comun: string | null | undefined,
  cientifico?: string | null,
): boolean {
  return resolverEspecie(registro, comun, cientifico) != null;
}

/** Mensaje de T7 en la tala de una plantación (el contrato del ADR-459). */
export function mensajeEspecieFueraDelRegistro(especie: string): string {
  return `La especie ${especie} no está en el registro de la plantación: agrégala en Plan de manejo → Registro.`;
}
