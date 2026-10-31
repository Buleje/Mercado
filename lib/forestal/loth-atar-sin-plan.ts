/**
 * loth-atar-sin-plan.ts — contrato de «Atar las líneas sin permiso» (02-10-2026).
 *
 * Una línea del libro con `planId` null cuenta en el saldo de TODOS los planes
 * (`ForestPlanDB.balanceExtraccion` suma plan + sin plan). Atarlas a su permiso
 * lo corrige. Regla: la TALA toma el permiso elegido; el trozado hereda el de su
 * tala, el despacho y el consumo el de su troza; sin fuente (o fuente sin plan
 * vivo) toma el elegido. PURO: lo importan la DB class, la ruta y la pantalla.
 */

import { z } from "zod";

export const atarSinPlanSchema = z.object({
  planId: z
    .string()
    .trim()
    .min(1, "Elige el permiso al que se atan las líneas.")
    .max(64, "El permiso no es válido.")
    .regex(/^[A-Za-z0-9_-]+$/, "El permiso no es válido."),
});

export interface AtarSeccion {
  section: string;
  /** Líneas vivas y sin plan de la sección (las de un mes cerrado incluidas). */
  total: number;
  /** A qué plan va cada tanda (sin las de mes cerrado). `heredado` = lo decidió su fuente. */
  porPlan: Array<{ planId: string; n: number; heredado: number }>;
  /** Líneas de meses cerrados: no se tocan. */
  cerradas: number;
}

export interface AtarSinPlanResultado {
  simulado: boolean;
  /** El permiso elegido para las talas (y el respaldo del resto). */
  planId: string;
  /** Líneas sin plan, vivas y registradas, en todo el libro. */
  total: number;
  /** Las que se ataron (o se atarían). */
  atadas: number;
  porSeccion: AtarSeccion[];
  /** Líneas que NO se tocan porque su mes está cerrado, y los meses. */
  cerradas: { n: number; periodos: string[] };
  /**
   * Aviso, no bloqueo (T6/T7 no se re-evalúan): líneas cuya especie no está en
   * el registro del plan al que van. En un plan sin especies cargadas no se juzga.
   */
  fueraDelRegistro: { n: number; especies: string[] };
}

export interface AtarSinPlanConteo {
  total: number;
  cerradas: number;
}
