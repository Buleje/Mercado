/**
 * Colores de una nota. Las claves son las de la base (`Note.color`) y los
 * tokens, los mismos de Notas (`components/admin/QuickNotesTab.tsx`, donde la
 * paleta es local): una nota del día se ve igual en las dos vistas.
 */
export type ColorNota = "yellow" | "green" | "blue" | "pink" | "purple" | "orange";

export const PALETA_NOTA: Record<ColorNota, { nombre: string; tarjeta: string; punto: string }> = {
  yellow: { nombre: "Amarillo", tarjeta: "bg-[var(--data-warning-500)]/10 border-[var(--data-warning-500)]/40", punto: "bg-[var(--data-warning-500)]" },
  green: { nombre: "Turquesa", tarjeta: "bg-[var(--data-5)]/10 border-[var(--data-5)]/40", punto: "bg-[var(--data-5)]" },
  blue: { nombre: "Azul", tarjeta: "bg-[var(--data-6)]/10 border-[var(--data-6)]/40", punto: "bg-[var(--data-6)]" },
  pink: { nombre: "Rojo", tarjeta: "bg-[var(--data-error-500)]/10 border-[var(--data-error-500)]/40", punto: "bg-[var(--data-error-500)]" },
  purple: { nombre: "Morado", tarjeta: "bg-[var(--data-8)]/10 border-[var(--data-8)]/40", punto: "bg-[var(--data-8)]" },
  orange: { nombre: "Gris", tarjeta: "bg-[var(--surface-sunken)] border-[var(--rule-base)]", punto: "bg-[var(--data-3)]" },
};

export const COLORES_NOTA = Object.keys(PALETA_NOTA) as ColorNota[];

export function colorNota(color: string): ColorNota {
  return (COLORES_NOTA as string[]).includes(color) ? (color as ColorNota) : "yellow";
}
