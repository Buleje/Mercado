"use client";

/**
 * AreasChips — las áreas del negocio como chips editables en su lugar
 * (ADR-497): se renombran escribiendo encima, se borran con la ×, se agregan
 * con Enter. Cada chip dice cuántos cargos tiene.
 */
import { useId, useState } from "react";
import { Plus, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { CAMPO_ALTO } from "../piezas/clases";
import type { Area } from "./organigrama-arbol";

const MAX_AREAS = 30;

interface Props {
  areas: readonly Area[];
  /** Cargos por área, para el número del chip. */
  cuenta: ReadonlyMap<string, number>;
  puedeEditar: boolean;
  onAgregar: (nombre: string) => void;
  onRenombrar: (id: string, nombre: string) => void;
  onBorrar: (id: string) => void;
}

export function AreasChips({ areas, cuenta, puedeEditar, onAgregar, onRenombrar, onBorrar }: Props) {
  const idNueva = useId();
  const [nueva, setNueva] = useState("");
  const lleno = areas.length >= MAX_AREAS;
  const agregar = () => {
    const nombre = nueva.trim();
    if (!nombre || lleno) return;
    onAgregar(nombre);
    setNueva("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Áreas">
      <span className="text-xs font-semibold text-[var(--text-secondary)]">Áreas</span>
      {areas.length === 0 && !puedeEditar && <span className="text-sm text-[var(--text-tertiary)]">Sin áreas.</span>}
      {areas.map((a) => (
        <span key={a.id} className="inline-flex h-12 max-w-full items-center gap-1 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-3.5 pr-1">
          {puedeEditar ? (
            <input
              type="text"
              value={a.nombre}
              maxLength={160}
              aria-label={`Nombre del área ${a.nombre}`}
              className="min-w-[3ch]! max-w-48 bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none [field-sizing:content] focus:underline"
              onChange={(e) => onRenombrar(a.id, e.target.value)}
              onBlur={(e) => {
                if (!e.target.value.trim()) onBorrar(a.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          ) : (
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{a.nombre}</span>
          )}
          <span className="px-1 text-xs text-[var(--text-tertiary)] tabular-nums">{cuenta.get(a.id) ?? 0}</span>
          {puedeEditar && (
            <button
              type="button"
              className={cn(button({ variant: "ghost", size: "icon" }), "size-10! rounded-full")}
              aria-label={`Borrar el área ${a.nombre}`}
              title="Borrar el área"
              onClick={() => onBorrar(a.id)}
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </span>
      ))}
      {puedeEditar && (
        <span className="inline-flex items-center gap-1">
          <label htmlFor={idNueva} className="sr-only">
            Nueva área
          </label>
          <input
            id={idNueva}
            type="text"
            value={nueva}
            maxLength={160}
            enterKeyHint="done"
            disabled={lleno}
            placeholder="Nueva área y Enter"
            className={cn(CAMPO_ALTO, "w-44")}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar();
              }
            }}
          />
          <button type="button" className={button({ variant: "secondary", size: "icon" })} aria-label="Agregar área" title="Agregar área" disabled={!nueva.trim() || lleno} onClick={agregar}>
            <Plus className="size-5" aria-hidden />
          </button>
        </span>
      )}
    </div>
  );
}
