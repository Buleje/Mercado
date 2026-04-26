"use client";

/**
 * CustomDateRangePicker — popover con 2 inputs date para rango personalizado.
 *
 * Pensado para complementar al `useDateRange` hook: cuando el usuario elige
 * "Personalizado", este popover deja elegir from-to. Inputs nativos `<input
 * type="date">` para evitar dependencia de date-picker libs.
 *
 * Uso:
 *   const { range, setRange, customRange, setCustomRange, label } = useDateRange("page-key");
 *   <CustomDateRangePicker
 *     active={range === "custom"}
 *     value={customRange}
 *     onChange={setCustomRange}
 *     onActivate={() => setRange("custom")}
 *   />
 */

import { useEffect, useRef, useState } from "react";
import { Calendar, X } from "@buleje/design-system/icons";

interface Props {
  active: boolean;
  value: { start: Date; end: Date } | null;
  onChange: (start: Date, end: Date) => void;
  onActivate: () => void;
}

function fmtIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtHuman(d: Date): string {
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "2-digit" }).format(d);
}

export default function CustomDateRangePicker({ active, value, onChange, onActivate }: Props) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string>(value ? fmtIso(value.start) : "");
  const [to, setTo] = useState<string>(value ? fmtIso(value.end) : "");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync con value externo
  useEffect(() => {
    if (value) {
      setFrom(fmtIso(value.start));
      setTo(fmtIso(value.end));
    }
  }, [value]);

  // Click outside cierra
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleApply = () => {
    if (!from || !to) return;
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T23:59:59");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
    if (end < start) return;
    onActivate();
    onChange(start, end);
    setOpen(false);
  };

  const labelText =
    active && value ? `${fmtHuman(value.start)} → ${fmtHuman(value.end)}` : "Personalizado";

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-bold transition-colors",
          active
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Calendar className="h-3.5 w-3.5" />
        <span className="truncate max-w-[180px]">{labelText}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Rango personalizado"
          className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] shadow-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-bold text-[var(--text-primary)]">Rango personalizado</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              className="p-1 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Desde</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
              className="mt-1 block w-full rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm bg-[var(--surface-canvas)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-[var(--text-secondary)]">Hasta</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from || undefined}
              className="mt-1 block w-full rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm bg-[var(--surface-canvas)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!from || !to}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
