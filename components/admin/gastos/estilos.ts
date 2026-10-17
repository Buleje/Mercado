/**
 * Clases de los campos del alta de gasto.
 *
 * Funciones y no constantes que se combinan: en el oscuro del panel,
 * `.dark [data-admin-shell] .border-[var(--rule-base)]` (globals.css) le gana a
 * cualquier otro color de borde que se sume después, y los `input` sin una
 * clase `dark:bg-` pierden el borde (memoria `ambar-falta-oscuro-admin-pisado`).
 * Por eso cada campo lleva UN solo color de borde y siempre su `dark:bg-`.
 */

const BASE_CAMPO =
  "w-full h-10 px-3 rounded-xl border text-sm text-[var(--text-primary)] bg-[var(--surface-raised)] dark:bg-[var(--surface-sunken)]";

/** Un input o select del formulario; con `error`, el borde en rojo. */
export function campo(error = false): string {
  return `${BASE_CAMPO} ${error ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]"}`;
}

const BASE_CHIP =
  "inline-flex min-h-10 items-center rounded-xl border px-3 text-sm font-semibold transition-colors";

/** Una opción de un grupo (método de pago, tipo de comprobante, IGV). */
export function chip(activo: boolean): string {
  return `${BASE_CHIP} ${
    activo
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
  }`;
}
