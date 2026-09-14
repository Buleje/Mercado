/**
 * documento.ts — el documento de identidad de un `Colaborador` (ADR-414 §1).
 *
 * Misma semántica que `normalizarDocumento` de
 * `lib/adelantos/cuenta-unificada.ts` (sólo letras y dígitos, sin separadores)
 * para que el cruce con Adelantos («¿es la misma persona?») compare lo mismo
 * de los dos lados. Acá se guarda en MAYÚSCULAS (así lo pide el schema —
 * `Colaborador_documento_chk`); allá se compara en minúscula: el CHECK de la
 * base no cambia lo que significa "igual documento".
 *
 * PURO: sin Prisma, React ni fetch.
 */

import type { TipoDocumento } from "./tipos";

/** Sólo letras y dígitos, en MAYÚSCULAS. `""` o vacío → `null`: nunca une nada. */
export function normalizarDocumento(v: string | null | undefined): string | null {
  const t = (v ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return t || null;
}

/** ¿Es el mismo documento? Compara normalizado, sin mirar mayúsculas ni separadores. */
export function mismoDocumento(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarDocumento(a);
  const nb = normalizarDocumento(b);
  return na !== null && na === nb;
}

/** `"12345678"` → `"•••• 5678"`. `null`/vacío → `null`: no hay nada que enmascarar. */
export function enmascararDocumento(v: string | null | undefined): string | null {
  const n = normalizarDocumento(v);
  if (!n) return null;
  if (n.length <= 4) return `•••• ${n}`;
  return `•••• ${n.slice(-4)}`;
}

/** DNI peruano: exactamente 8 dígitos, nada más. */
export function esDniValido(v: string | null | undefined): boolean {
  const n = normalizarDocumento(v);
  return n !== null && /^\d{8}$/.test(n);
}

/**
 * El `tipoDocumento` de un `Colaborador` (DNI · CE · PASAPORTE · OTRO) sale
 * del FORMATO del número, no de lo que otro módulo tenga guardado en su
 * propio campo — ese puede estar mal tipeado, o ser un valor que
 * `Colaborador` no admite (p. ej. Adelantos guarda "RUC"). DNI = exactamente
 * 8 dígitos; cualquier otro documento no vacío es OTRO — nunca inventa un CE
 * o un PASAPORTE que nadie confirmó a mano.
 */
export function tipoDocumentoPorFormato(v: string | null | undefined): TipoDocumento | null {
  const n = normalizarDocumento(v);
  if (!n) return null;
  return /^\d{8}$/.test(n) ? "DNI" : "OTRO";
}

/**
 * ¿Es el RUC de una empresa? Persona jurídica = empieza con 20 (RUC-10 es
 * persona natural con RUC, no una empresa — no se le puede aplicar la misma
 * regla). `false` para cualquier cosa que no sea un RUC de 11 dígitos.
 */
export function esRucEmpresa(v: string | null | undefined): boolean {
  const n = normalizarDocumento(v);
  return n !== null && /^20\d{9}$/.test(n);
}

/** Lo que puede mostrar `CandidatoDesdeAdelantosDTO.tipoDocumento`. */
type TipoDocumentoCandidato = "DNI" | "RUC" | "CE" | "PASAPORTE" | null;

/**
 * El `tipoDocumento` que se MUESTRA en la lista de «traer desde Adelantos»
 * (nunca lo que se guarda — para eso está `tipoDocumentoPorFormato`, más
 * estricto porque `Colaborador` no admite "RUC"). Primero el FORMATO del
 * número: 8 dígitos → DNI, 11 → RUC — acá "RUC" sí es una respuesta válida,
 * es sólo para leer la fila, no para escribir un `Colaborador`. Si el número
 * no dice nada (ni 8 ni 11 dígitos, o vacío), recién ahí cae al valor que
 * Adelantos tenga guardado, si es uno de los cuatro que el candidato puede
 * mostrar — nunca al revés: un DNI de 8 dígitos con el campo de Adelantos
 * vacío (nunca se lo consultó contra RENIEC) no puede salir "sin tipo"
 * (bug medido en QA 2026-09-14, «QA Trabajadora Con DNI»).
 */
export function tipoDocumentoCandidato(
  documento: string | null | undefined,
  guardado: string | null | undefined,
): TipoDocumentoCandidato {
  const n = normalizarDocumento(documento);
  if (n && /^\d{8}$/.test(n)) return "DNI";
  if (n && /^\d{11}$/.test(n)) return "RUC";
  return guardado === "DNI" || guardado === "RUC" || guardado === "CE" || guardado === "PASAPORTE" ? guardado : null;
}
