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
