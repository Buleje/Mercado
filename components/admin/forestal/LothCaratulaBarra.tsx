"use client";

/** Dónde voy y cuánto falta: «Paso n de 4», barra de avance y los cuatro pasos navegables. */

import { Check } from "@buleje/design-system/icons";
import type { EstadoPaso, PasoCaratula } from "@/lib/forestal/loth-caratula-pasos";

interface Props {
  paso: PasoCaratula;
  pasos: EstadoPaso[];
  progreso: { hechos: number; total: number; pct: number };
  onIr: (p: PasoCaratula) => void;
}

export default function LothCaratulaBarra({ paso, pasos, progreso, onIr }: Props) {
  return (
    <div className="border-b border-[var(--rule-soft)] px-5 py-3 sm:px-6">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-[var(--text-secondary)]">
        <span>Paso {paso} de 4</span>
        <span>
          {progreso.hechos} de {progreso.total} listos
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        role="progressbar"
        aria-label="Pasos de la carátula ya completos"
        aria-valuenow={progreso.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${progreso.hechos} de ${progreso.total} pasos listos`}
      >
        <div
          className="h-full rounded-full bg-[var(--data-success-600)] transition-[width]"
          style={{ width: `${progreso.pct}%` }}
        />
      </div>
      <ol className="mt-2 grid grid-cols-4 gap-1">
        {pasos.map((p) => {
          const actual = p.id === paso;
          return (
            <li key={p.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onIr(p.id)}
                aria-current={actual ? "step" : undefined}
                aria-label={`Paso ${p.id}: ${p.titulo}${p.opcional ? " (opcional)" : ""}${p.completo ? ", completo" : p.faltan.length ? `, falta ${p.faltan.join(", ")}` : ""}`}
                className={`flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:flex-row sm:gap-2 sm:text-sm ${
                  actual
                    ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    p.conError
                      ? "bg-[var(--data-error-600)] text-white"
                      : p.completo
                        ? "bg-[var(--data-success-600)] text-white"
                        : actual
                          ? "border-2 border-[var(--accent)] text-[var(--accent-dark)] dark:text-[var(--accent)]"
                          : "border border-[var(--rule-strong)] text-[var(--text-tertiary)]"
                  }`}
                  aria-hidden="true"
                >
                  {p.completo && !p.conError ? <Check className="h-3.5 w-3.5" /> : p.id}
                </span>
                <span className="min-w-0 truncate">
                  {p.corto}
                  {p.opcional && (
                    <span className="hidden font-normal text-[var(--text-tertiary)] sm:inline">
                      {" "}
                      · opcional
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
