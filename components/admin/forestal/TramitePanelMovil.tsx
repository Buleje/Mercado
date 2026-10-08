"use client";

/** Móvil: el papel no cabe al lado del formulario, se alterna entre llenar y verlo (extraído de `TramiteFormulario`). */

import { FileText, SlidersHorizontal } from "@buleje/design-system/icons";

export type PanelMovil = "formulario" | "documento";

const PANELES = [
  { key: "formulario", label: "Llenar", icon: SlidersHorizontal },
  { key: "documento", label: "Ver documento", icon: FileText },
] as const;

export default function TramitePanelMovil({ panel, onPanel }: { panel: PanelMovil; onPanel: (p: PanelMovil) => void }) {
  return (
    <div className="flex gap-2 xl:hidden">
      {PANELES.map((t) => {
        const Icono = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onPanel(t.key)}
            aria-pressed={panel === t.key}
            className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold transition ${
              panel === t.key
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
            }`}
          >
            <Icono className="h-4 w-4" /> {t.label}
          </button>
        );
      })}
    </div>
  );
}
