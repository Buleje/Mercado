import type { ElementType } from "react";
import { ChevronDown } from "@buleje/design-system/icons";

/**
 * El botón que pliega un bloque del Resumen y dice qué hace (mismo aspecto
 * que «Indicadores» del Libro TH, `LothSeccionKpis`): abierto se pinta con el
 * acento, cerrado es neutro. El bloque recuerda su estado con `useLocalStorage`.
 */
export default function BotonPlegar({
  abierto,
  onAlternar,
  controla,
  texto,
  textoAbierto = texto,
  ayuda,
  icono: Icono,
}: {
  abierto: boolean;
  onAlternar: () => void;
  /** id del panel que pliega. */
  controla: string;
  texto: string;
  /** Lo que dice abierto, si cambia («Revisar» → «Ocultar»). */
  textoAbierto?: string;
  /** Tooltip: qué pasa al tocarlo. */
  ayuda: string;
  icono?: ElementType;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={abierto}
      aria-controls={controla}
      title={ayuda}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
        abierto
          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
      }`}
    >
      {Icono && <Icono className="h-4 w-4" aria-hidden="true" />}
      {abierto ? textoAbierto : texto}
      <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}
