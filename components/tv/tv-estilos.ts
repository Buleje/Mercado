/**
 * Clases del Modo TV: se mira a 3 m y se maneja con el control remoto. El foco
 * se ve ENORME (anillo turquesa de 6 px separado del borde): en un TV no hay
 * mouse que diga dónde está uno parado. Sólo tokens del DS (el TV va en `.dark`).
 */

export const FOCO_TV =
  "outline-none transition focus:ring-[6px] focus:ring-[var(--accent)] focus:ring-offset-4 focus:ring-offset-[var(--surface-canvas)]";

export const BOTON_TV = `${FOCO_TV} inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl border-2 border-[var(--rule-strong)] bg-[var(--surface-raised)] px-6 text-2xl font-bold text-[var(--text-primary)] focus:border-[var(--accent)]`;

export const BOTON_TV_CHICO = `${FOCO_TV} inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-lg font-bold text-[var(--text-secondary)] focus:border-[var(--accent)] focus:text-[var(--text-primary)]`;
