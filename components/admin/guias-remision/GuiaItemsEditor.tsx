"use client";

/** Los ítems de la guía nueva (descripción, cantidad, unidad, peso) y el peso total que suman. */
import { Plus, X } from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { CAMPO, BOTON_ICONO } from "./estilos";
import type { DraftItem } from "./tipos";

interface Props {
  items: DraftItem[];
  onCambio: (idx: number, campo: keyof DraftItem, valor: string) => void;
  onQuitar: (idx: number) => void;
  onAgregar: () => void;
}

export function GuiaItemsEditor({ items, onCambio, onQuitar, onAgregar }: Props) {
  const conPeso = items.filter((it) => parseFloat(it.pesoUnitario) > 0);
  const sinPeso = items.filter((it) => it.descripcion.trim() && (!it.pesoUnitario || parseFloat(it.pesoUnitario) <= 0));
  const pesoTotal = conPeso.reduce((sum, it) => sum + (parseFloat(it.cantidad) || 0) * (parseFloat(it.pesoUnitario) || 0), 0);

  return (
    <section className="space-y-3">
      <BlockTitle>Qué llevas</BlockTitle>
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-2 sm:grid-cols-[1fr_5.5rem_5.5rem_7rem_auto]">
            <input aria-label="Descripción" type="text" value={item.descripcion} onChange={(e) => onCambio(idx, "descripcion", e.target.value)} placeholder="Descripción"
              className={`${CAMPO} col-span-3 sm:col-span-1`} />
            <input aria-label="Cantidad" type="number" min="1" value={item.cantidad} onChange={(e) => onCambio(idx, "cantidad", e.target.value)} placeholder="Cant." className={`${CAMPO} text-center`} />
            <input aria-label="Unidad" type="text" value={item.unidad} onChange={(e) => onCambio(idx, "unidad", e.target.value)} placeholder="Und" className={`${CAMPO} text-center`} />
            <input aria-label="Peso por unidad en kg" type="number" min="0" step="0.1" value={item.pesoUnitario} onChange={(e) => onCambio(idx, "pesoUnitario", e.target.value)} placeholder="Peso kg" className={`${CAMPO} text-center`} />
            {items.length > 1 ? (
              <button type="button" aria-label="Quitar ítem" onClick={() => onQuitar(idx)} className={`${BOTON_ICONO} col-span-3 w-full text-[var(--data-error-ink)] sm:col-span-1 sm:w-12`}>
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button type="button" onClick={onAgregar} className={button({ variant: "secondary", className: "rounded-xl" })}>
        <Plus className="h-4 w-4" aria-hidden /> Agregar ítem
      </button>
      {pesoTotal > 0 || sinPeso.length > 0 ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-[var(--text-primary)]">Peso total</span>
            <span className="font-extrabold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">{pesoTotal.toFixed(1)} kg</span>
          </div>
          {sinPeso.length > 0 ? (
            <p className="mt-1 text-sm text-[var(--data-warning-ink)]">
              {sinPeso.length} ítem{sinPeso.length !== 1 ? "s" : ""} sin peso registrado
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
