/**
 * Valida un número de teléfono peruano (móvil 9 dígitos empieza con 9).
 * Devuelve un mensaje localizado y un color tailwind para el helper text.
 *
 * Función pura — separada para poder testearla aisladamente.
 */

import { normalizarCelularPe } from "@/lib/tienda-cliente/celular";

export type PhoneValidationResult = {
  valid: boolean;
  hint: string;
  color: string;
};

export function validatePhone(value: string): PhoneValidationResult {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return { valid: false, hint: "", color: "" };
  if (digits.length < 9)
    return {
      valid: false,
      hint: `${9 - digits.length} dígitos más`,
      color: "text-[var(--data-warning-500)]",
    };
  if (digits.length === 9 && digits.startsWith("9"))
    return { valid: true, hint: "Número válido", color: "text-[var(--data-success-600)]" };
  if (digits.length === 9)
    return { valid: false, hint: "Debe empezar con 9", color: "text-[var(--data-error-500)]" };
  return { valid: false, hint: "Máximo 9 dígitos", color: "text-[var(--data-error-500)]" };
}

/**
 * Lo que escribió o pegó el cliente en un campo de celular → hasta 9 dígitos.
 * Un celular entero con prefijo («+51 987 654 321», «0051…») sale limpio con
 * `normalizarCelularPe`; si no, se quedan los primeros 9 dígitos (igual que antes).
 */
export function limpiarCelularEscrito(raw: string): string {
  return normalizarCelularPe(raw) ?? raw.replace(/\D/g, "").slice(0, 9);
}

/** Tope del input: deja pegar «(+51) 987.654.321» entero; el estado queda en 9 dígitos. */
export const LARGO_MAX_CELULAR_ESCRITO = 20;
