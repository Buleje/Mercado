"use client";

import { Check, Ticket, Sparkles } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { cn } from "@/lib/utils";
import type { Cupones } from "@/components/admin/cupones/hooks/use-cupones";

/** Ventana «Nuevo cupón»: el formulario salió de la lista para no empujarla. Pieza de CouponsTab: recibe `useCupones` entero. */
export default function CuponFormModal({ cup }: { cup: Cupones }) {
  const { showForm, setShowForm, couponScope, setCouponScope, form, setForm, handleCreate } = cup;
  return (
    <AdminModal
      open={showForm}
      onClose={() => setShowForm(false)}
      title="Nuevo cupón"
      icon={Ticket}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setShowForm(false)} className="inline-flex min-h-12 items-center rounded-xl bg-[var(--surface-sunken)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:bg-[var(--rule-soft)]">Cancelar</button>
          <button type="button" onClick={handleCreate} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90"><Check className="h-4 w-4" aria-hidden />Crear</button>
        </div>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-4")}>
          {/* Scope toggle: Tienda vs Plataforma */}
        <div>
          <span className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted mb-2 block">Alcance del cupón</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCouponScope("tienda")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-12",
                couponScope === "tienda"
                  ? "bg-[var(--accent-600,var(--accent))] text-white "
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)] "
              )}
            >
              <Ticket className="h-4 w-4" />
              Cupón de mi tienda
            </button>
            <button
              type="button"
              onClick={() => setCouponScope("plataforma")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-12",
                couponScope === "plataforma"
                  ? "bg-[var(--accent-600,var(--accent))] text-white "
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-soft)] "
              )}
            >
              <Sparkles className="h-4 w-4" />
              Cupón de plataforma
            </button>
          </div>
          <p className="text-sm text-[var(--text-tertiary)] dark:text-muted mt-1">
            {couponScope === "tienda"
              ? "Este cupón será válido sólo para tu tienda"
              : "Este cupón será válido en toda la plataforma"}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
          <Field label="Código *" labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
            <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="DESCUENTO10" className="w-full mt-1 px-3 h-12 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
          </Field>
          <Field label="Descripción" labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="10% de descuento" className="w-full mt-1 px-3 h-12 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
          </Field>
          <Field label="Tipo" labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
            <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as "percent" | "fixed" | "giftcard" }))} className="w-full mt-1 px-3 h-12 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm">
              <option value="percent">Porcentaje (%)</option>
              <option value="fixed">Monto fijo (S/)</option>
              {/* "Gift Card (saldo)" salió de acá: el Zod de POST /api/coupons
                  sólo acepta percent|fixed, así que elegirla devolvía 400 y el
                  cupón nunca se creaba. Las gift cards tienen su propio modelo
                  (GiftCard + GiftCardRedemption) y su módulo en Crecimiento →
                  Gift Cards. Los cupones giftcard que ya existan se siguen
                  leyendo y canjeando; sólo no se crean nuevos desde acá. */}
            </select>
          </Field>
          <Field label={form.discountType === "giftcard" ? "Saldo inicial (S/) *" : "Valor *"} labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
            <input type="number" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))} className="w-full mt-1 px-3 h-12 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
          </Field>
          <Field label="Compra mínima (S/)" labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
            <input type="number" value={form.minPurchase} onChange={e => setForm(f => ({ ...f, minPurchase: Number(e.target.value) }))} className="w-full mt-1 px-3 h-12 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
          </Field>
          <Field label="Usos máximos (0 = ilimitado)" labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
            <input type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) }))} className="w-full mt-1 px-3 h-12 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
          </Field>
          <Field label="Fecha expiración" labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
            <input type="date" value={form.expiresAt ? form.expiresAt.slice(0, 10) : ""} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" }))} className="w-full mt-1 px-3 h-12 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl bg-[var(--surface-raised)] text-sm" />
          </Field>
        </div>
      </div>
    </AdminModal>
  );
}
