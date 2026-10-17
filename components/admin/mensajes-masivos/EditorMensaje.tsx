"use client";

import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { PLANTILLAS, VARIABLES } from "./shared";

interface Props {
  plantilla: string;
  claveElegida: string;
  onTexto: (texto: string) => void;
  onElegirPlantilla: (clave: string, texto: string) => void;
}

const CHIP = "inline-flex h-12 items-center rounded-xl border px-3 text-sm font-semibold transition-colors";

export function EditorMensaje({ plantilla, claveElegida, onTexto, onElegirPlantilla }: Props) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <CardTitle className="mb-3 text-sm font-bold text-[var(--text-primary)]">Mensaje</CardTitle>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Plantillas">
        {PLANTILLAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            aria-pressed={claveElegida === p.clave}
            onClick={() => onElegirPlantilla(p.clave, p.texto)}
            className={cn(
              CHIP,
              claveElegida === p.clave
                ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40 hover:text-[var(--text-primary)]",
            )}
          >
            {p.rotulo}
          </button>
        ))}
      </div>
      <textarea
        value={plantilla}
        onChange={(e) => onTexto(e.target.value)}
        aria-label="Mensaje a enviar"
        rows={5}
        className="w-full resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--text-secondary)]">Agregar:</span>
        {VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onTexto(`${plantilla} ${v}`)}
            className={cn(CHIP, "border-[var(--rule-base)] bg-[var(--surface-sunken)] font-mono text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]")}
          >
            {v}
          </button>
        ))}
        <span className="ml-auto text-[var(--text-tertiary)]">{plantilla.length} caracteres</span>
      </div>
    </div>
  );
}
