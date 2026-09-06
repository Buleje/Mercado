"use client";

import { Plus, X, ListChecks } from "@buleje/design-system/icons";

export interface SpecRow {
  label: string;
  value: string;
}

/**
 * ProductSpecsEditor — ficha técnica editable (pares etiqueta/valor) del producto.
 * Estilo Amazon: el vendedor agrega specs libres (Ingredientes, Origen, Garantía,
 * Contenido neto…) que se muestran en la ficha técnica del detalle del marketplace.
 * Controlled: el padre guarda el array y lo manda como `specs` al API.
 */
export default function ProductSpecsEditor({
  value,
  onChange,
  max = 30,
}: {
  value: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
  max?: number;
}) {
  const update = (i: number, patch: Partial<SpecRow>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => {
    if (value.length >= max) return;
    onChange([...value, { label: "", value: "" }]);
  };

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-[var(--accent)]" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">Ficha técnica</p>
        <span className="ml-auto text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          Ej. Ingredientes, Origen, Garantía
        </span>
      </div>

      {value.length > 0 && (
        <div className="mt-3 space-y-2">
          {value.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={row.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Etiqueta"
                maxLength={60}
                className="h-10 w-2/5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <input
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="Valor"
                maxLength={400}
                className="h-10 flex-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Quitar especificación"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-600)]"
              >
                <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {value.length < max && (
        <button
          type="button"
          onClick={add}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--rule-base)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Agregar especificación
        </button>
      )}
    </div>
  );
}
