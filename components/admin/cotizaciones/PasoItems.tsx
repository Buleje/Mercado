"use client";

/**
 * Paso 2 de «Nueva cotización»: las líneas (con autocompletar de productos),
 * las plantillas y la vista previa del total. Grilla de `div`, no `<table>`:
 * a 400 px cada línea se apila en vez de pedir scroll horizontal.
 */
import { Copy, List, Plus, Trash2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency } from "@/lib/format";
import { subtotalDeLinea } from "./tipos";
import type { FormNuevaCotizacion } from "./use-nueva-cotizacion";

const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ROTULO = "mb-1 block text-sm font-semibold text-[var(--text-secondary)] sm:hidden";
const COLUMNAS = "sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_5rem_6.5rem_3rem]";

interface Props {
  form: FormNuevaCotizacion;
  cuantasPlantillas: number;
  onElegirPlantilla: () => void;
  onGestionarPlantillas: () => void;
}

export function PasoItems({ form, cuantasPlantillas, onElegirPlantilla, onGestionarPlantillas }: Props) {
  const { items, updateItem, removeItem, addItem, escribirDescripcion, selectProduct, productResults, activeItemIdx, setActiveItemIdx } = form;
  return (
    <div className="space-y-3">
      {cuantasPlantillas > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onElegirPlantilla} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4" })}>
            <Copy className="h-4 w-4" aria-hidden /> Desde plantilla
          </button>
          <button type="button" onClick={onGestionarPlantillas} className={button({ variant: "ghost", className: "gap-1.5 rounded-xl px-4" })}>
            <List className="h-4 w-4" aria-hidden /> Plantillas ({cuantasPlantillas})
          </button>
        </div>
      )}

      <div className={`hidden gap-2 text-sm font-semibold text-[var(--text-secondary)] sm:grid ${COLUMNAS}`} aria-hidden>
        <span>Descripción</span><span>Cant.</span><span>Precio</span><span>Desc. %</span><span className="text-right">Subtotal</span><span />
      </div>

      <ul className="space-y-3 sm:space-y-2">
        {items.map((item, idx) => {
          const nombre = item.descripcion || `ítem ${idx + 1}`;
          return (
            <li key={idx} className={`grid grid-cols-3 gap-2 border-b border-[var(--rule-soft)] pb-3 sm:items-center sm:border-0 sm:pb-0 ${COLUMNAS}`}>
              <div className="relative col-span-3 sm:col-span-1">
                <label className={ROTULO} htmlFor={`cot-desc-${idx}`}>Descripción</label>
                <input
                  id={`cot-desc-${idx}`}
                  type="text"
                  value={item.descripcion}
                  onChange={(e) => escribirDescripcion(idx, e.target.value)}
                  onFocus={() => setActiveItemIdx(idx)}
                  placeholder="Busca un producto o escribe…"
                  aria-label={`Descripción del ítem ${idx + 1}`}
                  className={INPUT}
                  autoComplete="off"
                />
                {activeItemIdx === idx && productResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)]">
                    {productResults.map((p) => (
                      <button key={p.id} type="button" onClick={() => selectProduct(idx, p)} className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left text-sm hover:bg-[var(--surface-sunken)]">
                        <span className="truncate text-[var(--text-primary)]">{p.name}</span>
                        <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{formatCurrency(p.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={ROTULO} htmlFor={`cot-cant-${idx}`}>Cant.</label>
                <input id={`cot-cant-${idx}`} type="number" min="1" step="1" inputMode="decimal" value={item.cantidad} onChange={(e) => updateItem(idx, "cantidad", e.target.value)} aria-label={`Cantidad de ${nombre}`} className={`${INPUT} text-center`} />
              </div>
              <div>
                <label className={ROTULO} htmlFor={`cot-precio-${idx}`}>Precio</label>
                <input id={`cot-precio-${idx}`} type="number" min="0" step="0.01" inputMode="decimal" value={item.precioUnit} onChange={(e) => updateItem(idx, "precioUnit", e.target.value)} placeholder="0.00" aria-label={`Precio unitario de ${nombre}`} className={`${INPUT} text-right`} />
              </div>
              <div>
                <label className={ROTULO} htmlFor={`cot-desc-pct-${idx}`}>Desc. %</label>
                <input id={`cot-desc-pct-${idx}`} type="number" min="0" max="100" step="1" inputMode="decimal" value={item.descuento} onChange={(e) => updateItem(idx, "descuento", e.target.value)} aria-label={`Descuento % de ${nombre}`} className={`${INPUT} text-center`} />
              </div>
              <p className="col-span-2 flex h-12 items-center text-sm font-semibold tabular-nums text-[var(--text-primary)] sm:col-span-1 sm:justify-end">
                <span className="mr-1 font-normal text-[var(--text-secondary)] sm:hidden">Subtotal</span>
                {formatCurrency(subtotalDeLinea(item))}
              </p>
              <div className="flex justify-end">
                {items.length > 1 && (
                  <button type="button" aria-label={`Quitar ${nombre}`} onClick={() => removeItem(idx)} className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--data-error-ink)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/10">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button type="button" onClick={addItem} className={button({ variant: "ghost", className: "gap-1.5 rounded-xl px-3 text-[var(--accent-ink)] dark:text-[var(--accent)]" })}>
        <Plus className="h-4 w-4" aria-hidden /> Agregar ítem
      </button>
    </div>
  );
}

/** La vista previa del total (el servidor hace la misma cuenta y guarda la suya). */
export function TotalesPrevios({ subtotal, igv, total }: { subtotal: number; igv: number; total: number }) {
  return (
    <dl className="space-y-1 rounded-xl bg-[var(--surface-sunken)] p-4 text-sm">
      <div className="flex justify-between text-[var(--text-secondary)]"><dt>Subtotal</dt><dd className="tabular-nums">{formatCurrency(subtotal)}</dd></div>
      <div className="flex justify-between text-[var(--text-secondary)]"><dt>IGV (18 %)</dt><dd className="tabular-nums">{formatCurrency(igv)}</dd></div>
      <div className="flex justify-between border-t border-[var(--rule-base)] pt-1 text-base font-bold text-[var(--text-primary)]"><dt>Total</dt><dd className="tabular-nums">{formatCurrency(total)}</dd></div>
    </dl>
  );
}
