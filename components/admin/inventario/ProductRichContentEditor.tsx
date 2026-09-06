"use client";

import dynamic from "next/dynamic";
import { Plus, X, LayoutGrid, ArrowUp, ArrowDown } from "@buleje/design-system/icons";

const ImageUpload = dynamic(() => import("@/components/admin/ImageUpload"), { ssr: false });

export interface RichBlock {
  heading?: string;
  body?: string;
  imageUrl?: string;
}

/**
 * ProductRichContentEditor — contenido enriquecido "A+" del producto (estilo
 * Amazon): bloques de imagen + título + texto que se muestran en el detalle del
 * marketplace. Controlled: el padre guarda el array y lo manda como `richContent`.
 */
export default function ProductRichContentEditor({
  value,
  onChange,
  max = 20,
}: {
  value: RichBlock[];
  onChange: (blocks: RichBlock[]) => void;
  max?: number;
}) {
  const update = (i: number, patch: Partial<RichBlock>) =>
    onChange(value.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    if (value.length >= max) return;
    onChange([...value, { heading: "", body: "", imageUrl: "" }]);
  };

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 text-[var(--accent)]" aria-hidden />
        <p className="text-sm font-bold text-[var(--text-primary)]">
          Contenido enriquecido (A+)
        </p>
        <span className="ml-auto text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          Imagen + texto, como Amazon
        </span>
      </div>

      {value.length > 0 && (
        <div className="mt-3 space-y-3">
          {value.map((b, i) => (
            <div
              key={i}
              className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3"
            >
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Bloque {i + 1}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir bloque" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] disabled:opacity-30">
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Bajar bloque" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] disabled:opacity-30">
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => remove(i)} aria-label="Quitar bloque" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-600)]">
                    <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
              </div>

              <input
                value={b.heading ?? ""}
                onChange={(e) => update(i, { heading: e.target.value })}
                placeholder="Título del bloque (ej. Hecho en la selva)"
                maxLength={120}
                className="h-10 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <textarea
                value={b.body ?? ""}
                onChange={(e) => update(i, { body: e.target.value })}
                placeholder="Texto del bloque…"
                maxLength={3000}
                rows={3}
                className="mt-2 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <div className="mt-2">
                <ImageUpload
                  value={b.imageUrl || undefined}
                  onChange={(url) => update(i, { imageUrl: url })}
                  onClear={() => update(i, { imageUrl: "" })}
                  folder="product-rich"
                  label="Imagen del bloque"
                  aspectRatio="video"
                />
              </div>
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
          Agregar bloque
        </button>
      )}
    </div>
  );
}
