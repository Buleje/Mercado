import Image from "next/image";
import { BlockTitle } from "@buleje/design-system";
import { ScanBarcode } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { nombreDe } from "./wizard-tipos";
import type { ConteoWizard } from "./use-conteo-wizard";

/** Paso 2: contar producto por producto. A 400 px el producto y su casilla van ARRIBA de la lista. */
export function WizardPaso2({ w }: { w: ConteoWizard }) {
  const total = w.items.length;
  const pct = total > 0 ? Math.round((w.contados / total) * 100) : 0;
  const cantidad = parseInt(w.inputValue, 10);
  const valida = !isNaN(cantidad);
  const sel = w.selected;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text-primary)]">Avance</span>
          <span className="text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{w.contados}/{total} ({pct}%)</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--rule-base)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <div className="mb-3 flex gap-2">
            <input
              type="search"
              value={w.search}
              onChange={(e) => w.setSearch(e.target.value)}
              placeholder="Buscar producto…"
              aria-label="Buscar producto"
              className="h-12 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)]"
            />
            <button type="button" onClick={() => w.setShowScanner(true)} className={button({ variant: "primary", className: "w-12 shrink-0 rounded-xl px-0" })} title="Escanear código" aria-label="Escanear código">
              <ScanBarcode className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="max-h-96 space-y-1 overflow-y-auto">
            {w.filtrados.map((item) => {
              const idx = w.items.indexOf(item);
              const contado = item.stockContado !== null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { w.setSelectedIdx(idx); w.setInputValue(""); }}
                  aria-current={idx === w.selectedIdx}
                  className={cn(
                    "flex min-h-12 w-full items-center justify-between rounded-xl p-2 text-left text-sm transition-colors",
                    idx === w.selectedIdx ? "border border-primary/30 bg-primary/10" : "hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  <span className="flex-1 truncate text-[var(--text-primary)]">{nombreDe(item)}</span>
                  <span
                    className={cn(
                      "ml-2 rounded-full px-2 py-0.5 text-sm",
                      !contado
                        ? "bg-[var(--rule-soft)] text-[var(--text-secondary)]"
                        : item.diferencia === 0
                          ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]"
                          : "bg-[var(--data-error-100)] text-[var(--data-error-ink)]",
                    )}
                  >
                    {!contado ? "Falta" : item.diferencia === 0 ? "OK" : `${item.diferencia! > 0 ? "+" : ""}${item.diferencia}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="order-first rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 lg:order-none">
          {sel ? (
            <div className="space-y-4">
              {sel.product?.image && (
                <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-lg bg-[var(--rule-soft)]">
                  <Image src={sel.product.image} alt={sel.product.name} fill className="object-cover" sizes="80px" />
                </div>
              )}
              <div className="text-center">
                <BlockTitle className="text-[var(--text-primary)]">{nombreDe(sel)}</BlockTitle>
                {sel.product?.barcode && <p className="mt-1 text-sm text-[var(--text-secondary)]">Código: {sel.product.barcode}</p>}
                <p className="text-sm text-[var(--text-secondary)]">{sel.product?.category}</p>
              </div>

              <div className="rounded-lg bg-[var(--surface-sunken)] p-3 text-center">
                <span className="text-sm text-[var(--text-secondary)]">Stock en el sistema:</span>
                <span className="ml-2 text-3xl font-bold tabular-nums text-[var(--text-primary)]">{sel.stockSistema}</span>
              </div>

              <Field label="Lo que contaste" labelClassName="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                <input
                  type="number"
                  inputMode="numeric"
                  value={w.inputValue}
                  onChange={(e) => w.setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") w.guardarConteo(); }}
                  min={0}
                  placeholder="0"
                  className="h-14 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-center text-3xl font-bold tabular-nums text-[var(--text-primary)] focus:border-primary focus:outline-none"
                  autoFocus
                />
              </Field>

              {w.inputValue && valida && (
                <p className="text-center text-xl font-bold tabular-nums" aria-live="polite">
                  {cantidad - sel.stockSistema === 0 ? (
                    <span className="text-[var(--data-success-ink)]">Igual al sistema</span>
                  ) : (
                    <span className={cantidad - sel.stockSistema > 0 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]"}>
                      {cantidad - sel.stockSistema > 0 ? "+" : ""}{cantidad - sel.stockSistema}
                    </span>
                  )}
                </p>
              )}

              <button type="button" onClick={w.guardarConteo} disabled={w.loading || !w.inputValue || !valida} className={button({ variant: "primary", fullWidth: true, className: "rounded-xl" })}>
                {w.loading ? "Guardando…" : "Guardar y siguiente"}
              </button>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-[var(--text-secondary)]">Elige un producto de la lista</p>
          )}
        </div>
      </div>

      <button type="button" onClick={() => w.setPaso(3)} className={button({ variant: "secondary", className: "rounded-xl" })}>
        Revisar diferencias ({w.conDiferencia.length})
      </button>
    </div>
  );
}
