"use client";

/**
 * CtpPeriodPicker — selector de período del Libro CTP (ADR-124/127).
 * El período es del MÓDULO, no de una pestaña: las vistas y el export leen el
 * mismo rango, así los números de una hablan del mismo lapso que los de las otras.
 *
 * 2026-07-26 — vive DENTRO de la cabina (libro-chrome), no en una fila propia:
 * un control de 40px de alto con el rango resuelto adentro, en vez de un select
 * gigante seguido de la frase "Mostrando: mayo de 2026 — julio de 2026". El
 * rango sigue estando; lo que se fue es la etiqueta que lo anunciaba.
 */

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "@buleje/design-system/icons";
import {
  CTP_PERIOD_OPTIONS,
  ctpPeriodShortLabel,
  type CtpPeriod,
  type CtpPeriodKey,
} from "@/lib/forestal/ctp-period";

export interface CtpCustomRange {
  from: string;
  to: string;
}

interface CtpPeriodPickerProps {
  periodKey: CtpPeriodKey;
  custom: CtpCustomRange;
  period: CtpPeriod;
  onKeyChange: (key: CtpPeriodKey) => void;
  onCustomChange: (range: CtpCustomRange) => void;
}

const DATE_INPUT =
  "h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

export default function CtpPeriodPicker({
  periodKey,
  custom,
  period,
  onKeyChange,
  onCustomChange,
}: CtpPeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const incompleto = periodKey === "custom" && (!custom.from || !custom.to);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const opcion = CTP_PERIOD_OPTIONS.find((o) => o.key === periodKey);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Período del libro: ${period.label}`}
        className={`inline-flex h-10 items-center gap-2 rounded-xl border-2 bg-[var(--surface-raised)] px-3 text-sm transition-colors hover:bg-[var(--surface-canvas)] ${
          incompleto
            ? "border-[var(--data-warning-500)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            : "border-[var(--rule-base)] text-[var(--text-primary)]"
        }`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="font-bold">{opcion?.label ?? "Período"}</span>
        <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
          {ctpPeriodShortLabel(period)}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Período del libro"
            className="absolute right-0 z-50 mt-2 w-[17rem] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
          >
            {CTP_PERIOD_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onKeyChange(o.key);
                  if (o.key !== "custom") setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  o.key === periodKey
                    ? "bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] dark:bg-primary/20"
                    : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]"
                }`}
              >
                {o.label}
              </button>
            ))}

            {periodKey === "custom" && (
              <div className="mt-1 space-y-2 border-t border-[var(--rule-soft)] p-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--text-tertiary)]">Desde</span>
                  <input
                    type="date"
                    value={custom.from}
                    max={custom.to || undefined}
                    onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
                    className={DATE_INPUT}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--text-tertiary)]">Hasta</span>
                  <input
                    type="date"
                    value={custom.to}
                    min={custom.from || undefined}
                    onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
                    className={DATE_INPUT}
                  />
                </label>
                {incompleto && (
                  <p className="text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    Elegí las dos fechas. Mientras tanto se muestra todo el histórico.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
