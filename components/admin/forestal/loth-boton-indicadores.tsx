"use client";

import { BarChart3, ChevronDown } from "@buleje/design-system/icons";

/**
 * «Indicadores ▾»: pliega y despliega las tarjetas. El mismo botón en las
 * Secciones y en el Censo (08-10): quien lo aprendió en uno lo reconoce en el otro.
 */
export function BotonIndicadores({
  abierto,
  onAlternar,
  controla,
  ayudaAbierto,
  ayudaCerrado,
  className = "ml-auto",
}: {
  abierto: boolean;
  onAlternar: () => void;
  /** id del panel que pliega. */
  controla: string;
  ayudaAbierto: string;
  ayudaCerrado: string;
  /** Dónde cae en su fila: `ml-auto` (a la derecha, de siempre) o nada (a la par de los botones). */
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={abierto}
      aria-controls={controla}
      title={abierto ? ayudaAbierto : ayudaCerrado}
      className={`${className} inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
        abierto
          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
      }`}
    >
      <BarChart3 className="h-4 w-4" aria-hidden="true" />
      Indicadores
      <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  );
}
