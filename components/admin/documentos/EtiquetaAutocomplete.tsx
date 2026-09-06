"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Se llama con el tag elegido (nuevo o existente) — nunca con string vacío. */
  onSubmit: (tag: string) => void;
  /** Universo de tags conocidos (taxonomía completa del tenant). */
  todasLasTags: string[];
  /** Tags que ya tiene el documento/selección — no tiene sentido sugerirlos de nuevo. */
  excluir?: string[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
}

/**
 * Input de etiqueta con sugerencias de la taxonomía existente. Escribir algo
 * que no matchea nada y apretar Enter sigue creando un tag nuevo (nunca fuerza
 * a elegir de la lista) — las sugerencias son para evitar duplicados por typo
 * ("factura" vs "facturas"), no una lista cerrada.
 */
export function EtiquetaAutocomplete({
  value, onChange, onSubmit, todasLasTags, excluir = [], placeholder, ariaLabel, className, inputClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  // Sólo usamos la sugerencia resaltada si el usuario navegó con flechas o
  // clickeó — así Enter después de tipear siempre crea EXACTAMENTE lo tipeado,
  // nunca lo cambia en silencio por un match parcial existente.
  const [navigated, setNavigated] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const excluirSet = useMemo(() => new Set(excluir.map((t) => t.toLowerCase())), [excluir]);
  const sugerencias = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return todasLasTags
      .filter((t) => t.toLowerCase().includes(q) && !excluirSet.has(t.toLowerCase()))
      .slice(0, 6);
  }, [value, todasLasTags, excluirSet]);

  useEffect(() => { setActiveIdx(0); setNavigated(false); }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const commit = (tag: string) => {
    const t = tag.trim();
    if (!t) return;
    onSubmit(t);
    onChange("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && sugerencias.length > 0) {
            e.preventDefault();
            setNavigated(true);
            setActiveIdx((i) => Math.min(i + 1, sugerencias.length - 1));
          } else if (e.key === "ArrowUp" && sugerencias.length > 0) {
            e.preventDefault();
            setNavigated(true);
            setActiveIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            commit(navigated && sugerencias[activeIdx] ? sugerencias[activeIdx] : value);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && sugerencias.length > 0}
        aria-controls={listId}
        aria-haspopup="listbox"
        className={inputClassName}
      />
      {open && sugerencias.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 top-full z-40 mt-1 w-max min-w-[10rem] max-w-[16rem] overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-[var(--shadow-lg)]">
          {sugerencias.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                role="option"
                aria-selected={i === activeIdx && navigated}
                onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                onMouseEnter={() => { setNavigated(true); setActiveIdx(i); }}
                className={cn(
                  "flex w-full items-center gap-1.5 truncate px-3 py-1.5 text-left text-sm font-bold",
                  i === activeIdx && navigated
                    ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                )}
              >
                #{s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
