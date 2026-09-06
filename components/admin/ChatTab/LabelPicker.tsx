"use client";

import { useEffect, useRef, useState } from "react";
import { Tag, X, Check, Plus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { THREAD_LABEL_PRESETS, labelChipClass } from "./types";

/**
 * LabelPicker — Tanda 3 · etiquetas de triage del hilo (Brandon 2026-06-11).
 *
 * Muestra las etiquetas actuales como chips removibles + un botón que abre un
 * popover con los presets (Nuevo·Pagado·Reclamo·Pendiente·VIP) para
 * activar/desactivar, más un campo para crear una etiqueta libre. Persiste vía
 * onChange (PATCH ?action=labels). Optimista: el padre recarga al confirmar.
 */

interface LabelPickerProps {
  value: string[];
  onChange: (labels: string[]) => Promise<void> | void;
}

export function LabelPicker({ value, onChange }: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Cerrar al click-fuera.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const has = (name: string) => value.some((l) => l.toLowerCase() === name.toLowerCase());

  async function commit(next: string[]) {
    setBusy(true);
    try {
      await onChange(next);
    } catch {
      window.alert("No se pudo actualizar la etiqueta.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(name: string) {
    const next = has(name)
      ? value.filter((l) => l.toLowerCase() !== name.toLowerCase())
      : [...value, name];
    void commit(next.slice(0, 8));
  }

  function addCustom() {
    const name = custom.trim().slice(0, 40);
    if (!name || has(name)) { setCustom(""); return; }
    setCustom("");
    void commit([...value, name].slice(0, 8));
  }

  return (
    <div ref={ref} className="relative mt-1 flex flex-wrap items-center gap-1">
      {value.map((l) => (
        <span
          key={l}
          className={cn(
 "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold",
            labelChipClass(l),
          )}
        >
          {l}
          <button
            type="button"
            onClick={() => toggle(l)}
            disabled={busy}
            aria-label={`Quitar etiqueta ${l}`}
            className="rounded-full hover:opacity-70 disabled:opacity-50"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--rule-base)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] hover:border-primary hover:text-primary dark:border-[var(--rule-base)]"
      >
        <Tag className="h-3 w-3" aria-hidden /> Etiqueta
      </button>

      {open && (
        <div className="absolute top-full left-0 z-20 mt-1 w-52 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-lg">
          <p className="px-1 pb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Etiquetas
          </p>
          <div className="space-y-0.5">
            {THREAD_LABEL_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => toggle(p.name)}
                disabled={busy}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-[var(--surface-sunken)] disabled:opacity-50 dark:hover:bg-[var(--surface-sunken)]"
              >
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold", p.chip)}>
                  {p.name}
                </span>
                {has(p.name) && <Check className="h-4 w-4 text-primary" aria-hidden />}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1 border-t border-[var(--rule-base)] pt-1.5 dark:border-[var(--rule-base)]">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              placeholder="Nueva etiqueta…"
              aria-label="Crear etiqueta"
              maxLength={40}
              className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 text-xs outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={busy || !custom.trim()}
              aria-label="Agregar etiqueta"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
