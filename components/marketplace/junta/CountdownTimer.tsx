"use client";

/**
 * CountdownTimer — cuenta regresiva en cajas (estilo evento) para La Junta.
 * Presentational: recibe las partes ya calculadas. Cajas cuadradas (sin radius)
 * para el look minimalista; muestra DD/HH/MM mientras falta ≥1 día, o HH/MM/SS
 * en la recta final.
 */

import { Clock } from "@buleje/design-system/icons";
import type { CountdownParts } from "@/lib/junta/countdown";

const pad = (n: number) => String(n).padStart(2, "0");

interface Props {
  parts: CountdownParts;
  /** Etiqueta accesible (ej. "1d 20h 5m") leída por lectores de pantalla. */
  ariaLabel?: string;
}

export function CountdownTimer({ parts, ariaLabel }: Props) {
  if (parts.expired) return null;

  const boxes =
    parts.days > 0
      ? [
          { value: parts.days, label: "días" },
          { value: parts.hours, label: "horas" },
          { value: parts.minutes, label: "min" },
        ]
      : [
          { value: parts.hours, label: "horas" },
          { value: parts.minutes, label: "min" },
          { value: parts.seconds, label: "seg" },
        ];

  return (
    <div>
      <p className="mb-2 inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        <Clock
          className="h-3.5 w-3.5 text-[var(--accent)]"
          strokeWidth={2.25}
          aria-hidden
        />
        Cierra en
      </p>
      <div
        className="flex items-stretch gap-1.5"
        role="timer"
        aria-label={ariaLabel}
      >
        {boxes.map((b) => (
          <div
            key={b.label}
            className="flex flex-1 flex-col items-center border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-2 py-2.5"
          >
            <span className="font-mono text-2xl font-extrabold leading-none tabular-nums text-[var(--text-primary)]">
              {pad(b.value)}
            </span>
            <span className="mt-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
