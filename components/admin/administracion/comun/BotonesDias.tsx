"use client";

/**
 * BotonesDias — los siete días de lunes a domingo como botones redondos que se
 * prenden y apagan (L M M J V S D). Los usan la recurrencia de una actividad y
 * los días del aviso en pantalla.
 */
import { cn } from "@/lib/utils";
import { DIAS_INICIAL, DIAS_LARGOS, ORDEN_SEMANA } from "./fechas";

interface Props {
  /** 0 = domingo … 6 = sábado. */
  dias: readonly number[];
  onAlternar: (dia: number) => void;
  /** id del rótulo que nombra al grupo. */
  rotuloId: string;
}

export function BotonesDias({ dias, onAlternar, rotuloId }: Props) {
  return (
    <div role="group" aria-labelledby={rotuloId} className="flex flex-wrap gap-1.5">
      {ORDEN_SEMANA.map((d) => {
        const activo = dias.includes(d);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={activo}
            aria-label={DIAS_LARGOS[d]}
            title={DIAS_LARGOS[d]}
            onClick={() => onAlternar(d)}
            className={cn(
              "inline-flex size-12 items-center justify-center rounded-full border text-sm font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
              activo
                ? "border-[var(--accent)] bg-[var(--accent-ink)] text-white dark:bg-[var(--accent)] dark:text-[var(--surface-canvas)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]",
            )}
          >
            {DIAS_INICIAL[d]}
          </button>
        );
      })}
    </div>
  );
}
