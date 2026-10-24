/**
 * lib/tienda-cliente/celular.ts — el celular peruano que escribe el cliente,
 * limpio y listo para guardar o mandar por WhatsApp. Contrato en `./contrato.ts`.
 *
 * Acepta lo que la gente escribe de verdad: «987 654 321», «987-654-321»,
 * «+51 987654321», «51987654321», «0051 987 654 321», «(+51) 987.654.321».
 * Devuelve los 9 dígitos (empiezan con 9) o `null` si no es un celular.
 */

/** 9 dígitos que empiezan con 9, o `null`. Nunca lanza. */
export function normalizarCelularPe(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  // Sólo separadores comunes: si trae letras u otros signos, no es un celular.
  if (/[^\d\s+().\-]/.test(raw)) return null;
  let digitos = raw.replace(/\D/g, "");
  if (digitos.startsWith("0051")) digitos = digitos.slice(4);
  else if (digitos.length === 11 && digitos.startsWith("51")) digitos = digitos.slice(2);
  return /^9\d{8}$/.test(digitos) ? digitos : null;
}

/** «987 654 321» para mostrar (entrada ya normalizada o cruda). */
export function formatearCelularPe(raw: string | null | undefined): string {
  const n = normalizarCelularPe(raw);
  if (!n) return typeof raw === "string" ? raw.trim() : "";
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** Para enlaces `wa.me/<numero>`: 51 + 9 dígitos, o `null`. */
export function celularPeParaWhatsapp(raw: string | null | undefined): string | null {
  const n = normalizarCelularPe(raw);
  return n ? `51${n}` : null;
}
