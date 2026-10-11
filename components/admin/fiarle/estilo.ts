/**
 * Cómo se dice y de qué color es cada veredicto de «A quién fiarle». Sin React
 * (sólo referencias a íconos): lo comparten la vista y cada fila.
 */

import { CheckCircle, AlertTriangle, XCircle } from "@buleje/design-system/icons";
import type { Veredicto } from "@/lib/credit/a-quien-fiarle";

export const VEREDICTO: Record<Veredicto, { label: string; filtro: string; icon: typeof CheckCircle; chip: string }> = {
  no: {
    label: "No le fíes",
    filtro: "No",
    icon: XCircle,
    chip: "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)] ring-1 ring-inset ring-[var(--data-error-500)]/40",
  },
  cuidado: {
    label: "Con cuidado",
    filtro: "Con cuidado",
    icon: AlertTriangle,
    chip: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]",
  },
  si: {
    label: "Sí",
    filtro: "Sí",
    icon: CheckCircle,
    chip: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  },
};

export const ORDEN_VEREDICTOS: readonly Veredicto[] = ["no", "cuidado", "si"];
