"use client";

/**
 * InlineEditField — edición en celda sin modal.
 *
 * Click en un texto → se convierte en input → Enter guarda, Esc cancela.
 * El dueño cambia precio de S/3.50 a S/3.80 sin abrir diálogo.
 *
 * Uso:
 *   <InlineEditField
 *     value={product.price}
 *     onSave={async (v) => { await updatePrice(product.id, v); }}
 *     format={(v) => `S/ ${v.toFixed(2)}`}
 *     parse={(s) => parseFloat(s.replace(",", "."))}
 *     type="number"
 *   />
 */

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { Check, X, Pencil } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props<T> {
  value: T;
  onSave: (next: T) => void | Promise<void>;
  /** Formato de display (ej: currency). */
  format?: (v: T) => string;
  /** Parseo del input al tipo T. Default: identity (string). */
  parse?: (s: string) => T;
  /** Tipo de input HTML. Default "text". */
  type?: "text" | "number" | "email" | "tel";
  /** Validación: devuelve error message o null. */
  validate?: (v: T) => string | null;
  /** Placeholder del input. */
  placeholder?: string;
  /** Min width del display/input (px). */
  minWidth?: number;
  /** Clase extra. */
  className?: string;
  /** Si true, muestra icono lápiz al hover. */
  showEditIcon?: boolean;
}

export function InlineEditField<T extends string | number>({
  value,
  onSave,
  format,
  parse,
  type = "text",
  validate,
  placeholder,
  minWidth = 80,
  className,
  showEditIcon = true,
}: Props<T>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const parseValue = useCallback(
    (s: string): T => {
      if (parse) return parse(s);
      if (type === "number") return Number(s) as T;
      return s as T;
    },
    [parse, type],
  );

  const commit = useCallback(async () => {
    const next = parseValue(draft);
    if (next === value) {
      setEditing(false);
      setError(null);
      return;
    }
    const validation = validate?.(next) ?? null;
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [draft, value, parseValue, validate, onSave]);

  const cancel = useCallback(() => {
    setDraft(String(value));
    setEditing(false);
    setError(null);
  }, [value]);

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [commit, cancel],
  );

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "group relative inline-flex items-center gap-1.5 px-2 py-1 -mx-2 -my-1 rounded-md text-left transition-colors",
          "hover:bg-[var(--surface-sunken)]",
          className,
        )}
        style={{ minWidth }}
        aria-label={`Editar ${format ? format(value) : value}`}
      >
        <span className="truncate">{format ? format(value) : String(value)}</span>
        {showEditIcon && (
          <Pencil
            className="h-3 w-3 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
            strokeWidth={1.75}
            aria-hidden
          />
        )}
      </button>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-1", className)} style={{ minWidth }}>
      <div className="flex-1 min-w-0 relative">
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={placeholder}
          disabled={saving}
          className={cn(
            "w-full px-2 py-1 rounded-md bg-[var(--surface-canvas)] text-sm outline-none",
            "border transition-colors",
            error
              ? "border-[var(--data-error)] focus:border-[var(--data-error)]"
              : "border-[var(--rule-base)] focus:border-[var(--accent)]",
          )}
        />
        {error && (
          <div className="absolute top-full left-0 mt-1 text-xs text-[var(--data-error)] whitespace-nowrap">
            {error}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => void commit()}
        disabled={saving}
        aria-label="Guardar"
        className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--data-success)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        aria-label="Cancelar"
        className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

export default InlineEditField;
