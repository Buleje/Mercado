/**
 * Valida un número de teléfono peruano (móvil 9 dígitos empieza con 9).
 * Devuelve un mensaje localizado y un color tailwind para el helper text.
 *
 * Función pura — separada para poder testearla aisladamente.
 */

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
  if (digits.length === 9 && /^9/.test(digits))
    return { valid: true, hint: "Número válido", color: "text-[var(--data-success-600)]" };
  if (digits.length === 9)
    return { valid: false, hint: "Debe empezar con 9", color: "text-[var(--data-error-500)]" };
  return { valid: false, hint: "Máximo 9 dígitos", color: "text-[var(--data-error-500)]" };
}
