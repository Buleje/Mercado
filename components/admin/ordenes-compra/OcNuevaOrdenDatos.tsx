"use client";

import { Kicker } from "@buleje/design-system";
import { Calendar, Building2, StickyNote, Truck, CreditCard, Percent, Receipt } from "@buleje/design-system/icons";
import { FORMAS_DE_PAGO, generaCuentaPorPagar, TIPOS_COMPROBANTE, type TipoComprobante } from "@/lib/compras/estados-oc";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { Field } from "@/components/admin/shared/Field";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Nueva orden: proveedor, condiciones y comprobante. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcNuevaOrdenDatos({ oc }: { oc: OrdenesCompra }) {
  const {
    suppliers, supplierId, setSupplierId, items, notes, setNotes, paymentMethod, setPaymentMethod,
    deliveryDate, setDeliveryDate, discount, setDiscount, invoiceType, setInvoiceType, invoiceNumber,
    setInvoiceNumber, flete, setFlete, otrosCostos, setOtrosCostos, igvIncluded, setIgvIncluded,
    sobrecostos,
  } = oc;
  return (
    <>
      {/* ── Sección: Proveedor + Notas ── */}
      <section className="space-y-3">
        <Kicker as="h3" className="libro-kicker inline-flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[var(--text-tertiary)]" />
          Proveedor
        </Kicker>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Proveedor *" labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1" className="sm:col-span-2">
            <select
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">— Seleccionar proveedor —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.ruc ? ` (RUC ${s.ruc})` : ""}</option>)}
            </select>
          </Field>
          <Field label={<><StickyNote className="inline h-3 w-3 mr-1" />Notas (opcional)</>} labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1" className="sm:col-span-2">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Traer factura, descargar por el portón de atrás..."
              className="w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-primary"
            />
          </Field>
        </div>
      </section>

      {/* ── Sección: Condiciones de compra ── */}
      <section className="space-y-3">
        <Kicker as="h3" className="libro-kicker inline-flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[var(--text-tertiary)]" />
          Condiciones
        </Kicker>

        <div>
          <span className="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Forma de pago</span>
          <div className="flex flex-wrap gap-2">
            {FORMAS_DE_PAGO.map(forma => {
              const activa = paymentMethod === forma.id;
              return (
                <button
                  key={forma.id}
                  type="button"
                  onClick={() => setPaymentMethod(forma.id)}
                  aria-pressed={activa}
                  title={forma.ayuda}
                  className={cn(
                    "h-12 px-4 rounded-2xl border-2 text-sm font-semibold transition-colors",
                    activa
                      ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {forma.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5">
            {generaCuentaPorPagar(paymentMethod)
              ? `Se abre una cuenta por pagar que vence en ${FORMAS_DE_PAGO.find(f => f.id === paymentMethod)?.dias} días.`
              : "No genera cuenta por pagar: la compra queda saldada."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={<><Calendar className="inline h-3 w-3 mr-1" />Fecha de entrega prometida</>} labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label={<><Percent className="inline h-3 w-3 mr-1" />Descuento del proveedor</>} labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
            {(id) => (
              <div className="relative">
                <input
                  id={id}
                  type="number" min="0" max="100" step="0.5"
                  value={discount}
                  onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="w-full h-12 pl-3.5 pr-9 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-primary"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--text-tertiary)]">%</span>
              </div>
            )}
          </Field>
        </div>
      </section>

      {/* ── Sección: Comprobante y costos de traer (ADR-377) ── */}
      <section className="space-y-3">
        <Kicker as="h3" className="libro-kicker inline-flex items-center gap-2">
          <Receipt className="h-4 w-4 text-[var(--text-tertiary)]" />
          Comprobante y costos de traer
        </Kicker>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tipo de comprobante" labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
            <select
              value={invoiceType}
              onChange={(e) => setInvoiceType(e.target.value as TipoComprobante)}
              className="w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-primary cursor-pointer"
            >
              {TIPOS_COMPROBANTE.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Número" labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              disabled={invoiceType === "ninguno"}
              placeholder={invoiceType === "ninguno" ? "Sin comprobante" : "F001-00012345"}
              className="w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] focus:outline-none focus:border-primary disabled:opacity-50"
            />
          </Field>
          <Field label={<><Truck className="inline h-3 w-3 mr-1" />Flete (S/)</>} labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
            <input
              type="number" min="0" step="0.5"
              value={flete}
              onChange={(e) => setFlete(Math.max(0, Number(e.target.value)))}
              className="w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-primary"
            />
          </Field>
          <Field label="Otros costos (S/)" labelClassName="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
            <input
              type="number" min="0" step="0.5"
              value={otrosCostos}
              onChange={(e) => setOtrosCostos(Math.max(0, Number(e.target.value)))}
              className="w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold tabular-nums text-[var(--text-primary)] focus:outline-none focus:border-primary"
            />
          </Field>
        </div>

        {sobrecostos > 0 && items.length > 0 && (
          <p className="text-xs text-[var(--text-secondary)] bg-[var(--surface-sunken)] rounded-xl px-3.5 py-2.5 border border-[var(--rule-base)]">
            Los {formatCurrency(sobrecostos)} se reparten entre los productos según cuánto vale cada uno.
            Así el costo del producto incluye lo que costó traerlo, y el margen que ves después es el de verdad.
          </p>
        )}

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={igvIncluded}
            onChange={(e) => setIgvIncluded(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded-md border border-[var(--rule-base)] accent-[var(--accent)] cursor-pointer"
          />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Los costos que cargué ya incluyen IGV
            <span className="block text-xs text-[var(--text-secondary)] font-normal">
              Es lo normal cuando el proveedor te pasa precio de lista.
            </span>
          </span>
        </label>
      </section>
    </>
  );
}
