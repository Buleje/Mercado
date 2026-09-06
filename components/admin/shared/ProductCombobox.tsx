"use client";

// ProductCombobox — buscador de productos contra el inventario real, reutilizable
// en formularios (Recepción, Devoluciones). Reemplaza los inputs de texto libre
// por selección con búsqueda + teclado (reporte QA Compras). Permite texto libre
// como fallback, pero sugiere y devuelve el producto real (con id/unidad) al
// elegir de la lista.

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Search } from "@buleje/design-system/icons";

export interface ProductOption {
  id: number | string;
  name: string;
  stock?: number | null;
  unit?: string;
  barcode?: string;
  /** Costo del producto. Lo usa Devoluciones para saber cuánto debe el proveedor (ADR-379). */
  costPrice?: number | null;
}

interface ProductComboboxProps {
  products: ProductOption[];
  value: string;
  onChange: (text: string) => void;
  onSelect: (product: ProductOption) => void;
  placeholder?: string;
  inputClassName?: string;
  disabled?: boolean;
  /** id para aria (accesibilidad del listbox). */
  id?: string;
}

export default function ProductCombobox({
  products,
  value,
  onChange,
  onSelect,
  placeholder = "Buscar producto…",
  inputClassName,
  disabled,
  id = "product-combobox",
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const base = q.length === 0
      ? products
      : products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q));
    return base.slice(0, 10);
  }, [products, value]);

  // Cerrar al hacer click fuera.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const choose = (p: ProductOption) => {
    onChange(p.name);
    onSelect(p);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-32">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)] pointer-events-none" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full pl-8 pr-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
            inputClassName,
          )}
        />
      </div>
      {open && matches.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)] py-1"
        >
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(p); }}
              className={cn(
                "px-3 py-1.5 cursor-pointer text-xs",
                i === active ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]",
              )}
            >
              <div className="font-semibold text-[var(--text-primary)] truncate">{p.name}</div>
              <div className="text-[var(--text-tertiary)]">
                {p.unit ?? "und"}{p.barcode ? ` · ${p.barcode}` : ""} · stock: {p.stock ?? "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
