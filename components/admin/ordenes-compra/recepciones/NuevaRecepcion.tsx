"use client";

import { CardTitle, BlockTitle } from "@buleje/design-system";
import { Camera, Check, CheckCircle2, Loader2, Plus, Sparkles, X } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import ProductCombobox, { type ProductOption } from "@/components/admin/shared/ProductCombobox";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import VenceLoteCampo from "@/components/admin/compras/VenceLoteCampo";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { COND_MAP, type ItemCondition } from "@/components/admin/ordenes-compra/recepciones/tipos";
import type { NuevaRecepcion as Estado } from "@/components/admin/ordenes-compra/recepciones/use-nueva-recepcion";

/**
 * La ventana «Recibir mercadería» (con o sin orden): auto-completar desde una
 * orden pendiente, checklist con vence/lote, foto de la factura. Salió de
 * `ReceivingTab` (10-10) con los mismos campos y el mismo guardado.
 */
export default function NuevaRecepcion({
  n, products, supplierNames,
}: {
  n: Estado;
  products: ProductOption[];
  supplierNames: string[];
}) {
  const {
    setShowNew, newTitleId, newPanelRef, ventanaNueva, pendingOCs, selectedOcId, newForm, setNewForm,
    checklist, setChecklist, saving, invoiceUrl, setInvoiceUrl, uploadingInvoice, invoiceError,
    addChecklistRow, removeChecklistRow, updateChecklistRow, uploadInvoice, venceConError, saveReception, applyOC,
  } = n;
  return (
    <div className="modal-backdrop p-4" onClick={(e) => { if (e.target === e.currentTarget && !ventanaNueva.fijado) setShowNew(false); }}>
      <div
        ref={newPanelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={newTitleId}
        tabIndex={-1}
        className="relative bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div {...ventanaNueva.asaProps} className="flex items-center justify-between">
          <CardTitle id={newTitleId} className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Recibir mercadería</CardTitle>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventanaNueva} />
            <button type="button" aria-label="Cerrar" onClick={() => setShowNew(false)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden /></button>
          </span>
        </div>

        {/* Dropdown OC pendiente — auto-completa todo */}
        {pendingOCs.length > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Auto-completar desde OC pendiente</p>
            </div>
            <select
              value={selectedOcId}
              onChange={(e) => applyOC(e.target.value)}
              aria-label="Elegir orden de compra para auto-completar"
              className="w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm"
            >
              <option value="">— Elegir orden de compra —</option>
              {pendingOCs.map((oc) => (
                <option key={oc.id} value={oc.id}>
                  {oc.id} · {oc.supplierName ?? "Sin proveedor"} · {oc.items?.length ?? 0} items{oc.total ? ` · ${formatCurrency(Number(oc.total))}` : ""}
                </option>
              ))}
            </select>
            <p className="text-sm text-[var(--text-tertiary)]">
              Al elegir, se rellenan proveedor, ref y los items del checklist con la cantidad esperada.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Proveedor" labelClassName="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">
            {/* Al recibir contra una OC, proveedor y Nro. OC quedan
                BLOQUEADOS (derivados de la OC) → trazabilidad garantizada,
                no se puede escribir un proveedor/OC inexistente (reporte QA). */}
            <input value={newForm.supplier} onChange={e => setNewForm(f => ({ ...f, supplier: e.target.value }))}
              placeholder="Distribuidora ABC" list={selectedOcId ? undefined : "recep-proveedores"} readOnly={!!selectedOcId}
              className={cn("w-full mt-1 px-3 h-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm", selectedOcId ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)] cursor-not-allowed" : "bg-[var(--surface-raised)] ")} />
            <datalist id="recep-proveedores">
              {supplierNames.map(n => <option key={n} value={n} />)}
            </datalist>
          </Field>
          <Field label="Nro. Orden de Compra" labelClassName="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">
            <input value={newForm.orderRef} onChange={e => setNewForm(f => ({ ...f, orderRef: e.target.value }))}
              placeholder="OC-001" readOnly={!!selectedOcId}
              className={cn("w-full mt-1 px-3 h-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-mono", selectedOcId ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)] cursor-not-allowed" : "bg-[var(--surface-raised)] ")} />
            {selectedOcId && <p className="mt-1 text-sm text-primary">De la OC seleccionada</p>}
          </Field>
          <Field label="Fecha programada" labelClassName="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">
            <input type="date" value={newForm.scheduledDate} onChange={e => setNewForm(f => ({ ...f, scheduledDate: e.target.value }))}
              className="w-full mt-1 px-3 h-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm" />
          </Field>
          <Field label="Inspector" labelClassName="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">
            <input value={newForm.inspector} onChange={e => setNewForm(f => ({ ...f, inspector: e.target.value }))}
              placeholder="Nombre del responsable"
              className="w-full mt-1 px-3 h-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm" />
          </Field>
        </div>

        {/* Checklist */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <BlockTitle>Checklist de productos</BlockTitle>
              <InfoTip
                title="Dañado, vencido y faltante"
                what="Lo que marcas dañado, vencido o faltante se baja de lo que le debes al proveedor por esta orden. «Faltante (no llegará)» además cierra esa línea: la orden deja de esperarla."
                affects="Antes de guardar te mostramos cuánto se descuenta. No se puede deshacer: si lo que falta llega en otro viaje, no lo marques faltante; déjalo en «OK» con lo que llegó y registra el otro viaje cuando llegue."
                example="Pediste 10 arroz y llegaron 7, los 3 no los mandarán: Recibido 7 + «Faltante (no llegará)» → se descuentan los 3 de la cuenta."
              />
            </div>
            <button onClick={addChecklistRow} className="inline-flex h-12 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">
              <Plus className="h-4 w-4" aria-hidden /> Agregar fila
            </button>
          </div>
          <div className="space-y-2">
            {checklist.map((row, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 bg-[var(--surface-sunken)] rounded-xl p-2">
                <ProductCombobox
                  id={`recep-prod-${idx}`}
                  products={products}
                  value={row.product}
                  placeholder="Producto"
                  onChange={(text) => setChecklist(prev => prev.map((r, i) => i === idx ? { ...r, product: text, productId: undefined } : r))}
                  onSelect={(p) => setChecklist(prev => prev.map((r, i) => i === idx ? { ...r, product: p.name, productId: typeof p.id === "number" ? p.id : undefined, expectedQty: r.expectedQty } : r))}
                />
                <input type="number" min="0" value={row.expectedQty} onChange={e => updateChecklistRow(idx, "expectedQty", +e.target.value)}
                  placeholder="Esperado" className="w-24 px-2 h-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm" />
                <input type="number" min="0" value={row.receivedQty} onChange={e => updateChecklistRow(idx, "receivedQty", +e.target.value)}
                  placeholder="Recibido" className="w-24 px-2 h-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm" />
                <select value={row.condition} onChange={e => updateChecklistRow(idx, "condition", e.target.value as ItemCondition)}
                  aria-label={`Condición de ${row.product || "el producto"}`}
                  className="px-2 h-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm">
                  {Object.entries(COND_MAP).map(([k, v]) => <option key={k} value={k}>{v.opcion ?? v.label}</option>)}
                </select>
                <input value={row.notes} onChange={e => updateChecklistRow(idx, "notes", e.target.value)}
                  placeholder="Notas (opcional)" className="flex-1 min-w-24 px-2 h-12 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm" />
                {checklist.length > 1 && (
                  <button type="button" aria-label={`Quitar ${row.product || "la fila"}`} onClick={() => removeChecklistRow(idx)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/10 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {row.condition === "ok" && (
                  <VenceLoteCampo
                    id={`recep-vence-${idx}`}
                    producto={row.product || "el producto"}
                    valor={row}
                    ayuda={idx === 0}
                    onChange={(patch) => setChecklist(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))}
                    className="basis-full"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Factura del proveedor — se adjunta a la recepción (foto). Antes
            el módulo de factura estaba separado en Punto de Compra. */}
        <div>
          <label className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted block mb-1.5">
            Factura del proveedor <span className="font-normal text-[var(--text-tertiary)]">(opcional, foto)</span>
          </label>
          {invoiceUrl ? (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-alt)] px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--data-success-500)] shrink-0" aria-hidden />
              <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary hover:underline flex-1 truncate">
                Ver factura adjunta
              </a>
              <button type="button" onClick={() => setInvoiceUrl("")} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors" aria-label="Quitar factura">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className={cn(
              "flex items-center gap-2 rounded-lg border border-dashed border-[var(--rule-base)] px-3 py-2.5 cursor-pointer hover:border-primary/50 transition-colors text-sm text-[var(--text-secondary)] dark:text-muted",
              uploadingInvoice && "opacity-60 cursor-wait",
            )}>
              {uploadingInvoice ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
              {uploadingInvoice ? "Subiendo…" : "Adjuntar foto de la factura"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingInvoice}
                onChange={e => { const f = e.target.files?.[0]; if (f) void uploadInvoice(f); e.target.value = ""; }}
              />
            </label>
          )}
          {invoiceError && <p className="text-sm text-[var(--data-error-500)] mt-1">{invoiceError}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={() => setShowNew(false)} className="px-4 h-12 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] ">Cancelar</button>
          <button onClick={saveReception} disabled={saving || venceConError} title={venceConError ? "Corrige la fecha de vencimiento marcada en rojo" : undefined} className="px-4 min-h-12 rounded-xl text-sm font-semibold bg-[var(--text-primary)] text-[var(--surface-raised)] hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar recepción
          </button>
        </div>
        <TiradorDeVentana ventana={ventanaNueva} />
      </div>
    </div>
  );
}
