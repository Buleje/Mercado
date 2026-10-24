"use client";

import Image from "next/image";
import { Search, Users, User } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { Field } from "@/components/admin/shared/Field";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

/** Ventana «Nueva / Editar oferta». Pieza de PromotionsTab: recibe `usePromociones` entero. */
export default function PromoFormModal({ prm }: { prm: Promociones }) {
  const {
    showForm,
    editingId,
    form,
    setForm,
    saving,
    selectedPhones,
    setSelectedPhones,
    customerSearch,
    setCustomerSearch,
    closeFormModal,
    savePromo,
    filteredFormCustomers,
  } = prm;
  return (
    <>
      {/* ── Create/Edit Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <AdminModal
          open
          onClose={closeFormModal}
          title={editingId ? "Editar oferta" : "Nueva oferta"}
          size="lg"
          claveVentana="promociones-form"
          footer={
            <ModalFooter>
              <button onClick={closeFormModal} className={button({ variant: "secondary" })}>
                Cancelar
              </button>
              <button
                onClick={savePromo}
                disabled={saving || !form.name.trim()}
                className={button({ variant: "primary" })}
              >
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear oferta"}
              </button>
            </ModalFooter>
          }
        >
          <div className={`space-y-4 ${MODAL_BODY}`}>
            {/* Name */}
            <Field
              label="Nombre *"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
                placeholder="Ej: 2x1 en arroz"
              />
            </Field>
            {/* Description */}
            <Field
              label="Descripción"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none"
                placeholder="Detalles de la oferta…"
              />
            </Field>
            {/* Discount + Min purchase */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Descuento %"
                labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
              >
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.discountPercent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discountPercent: Number(e.target.value) }))
                  }
                  className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
                />
              </Field>
              <Field
                label="Compra mín. (S/)"
                labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
              >
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.minPurchase}
                  onChange={(e) => setForm((f) => ({ ...f, minPurchase: e.target.value }))}
                  className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
                  placeholder="Opcional"
                />
              </Field>
            </div>
            {/* Image URL */}
            <Field
              label="URL de imagen"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              {(id) => (
                <>
                  <input
                    id={id}
                    type="url"
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
                    placeholder="https://..."
                  />
                  {form.imageUrl && (
                    <div className="relative mt-2 w-32 h-32 rounded-xl bg-[var(--rule-soft)] dark:bg-accent overflow-hidden">
                      <Image
                        src={form.imageUrl}
                        alt="preview"
                        fill
                        className="object-cover"
                        sizes="128px"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </Field>
            {/* WhatsApp message */}
            <Field
              label="Mensaje WhatsApp"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <textarea
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                rows={3}
                className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary resize-none"
                placeholder="🎉 *Oferta especial*&#10;&#10;Aprovecha el descuento…"
              />
            </Field>
            {/* Target type */}
            <div>
              <span className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
                Público objetivo
              </span>
              <div className="flex flex-wrap gap-2 mt-1">
                {[
                  { v: "all", l: "Todos", icon: Users },
                  { v: "group", l: "Grupo", icon: Users },
                  { v: "individual", l: "Individual", icon: User },
                ].map(({ v, l, icon: Icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, targetType: v }))}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 min-h-12 rounded-xl text-sm font-semibold border-2 transition-all",
                      form.targetType === v
                        ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                        : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:border-gray-300",
                    )}
                  >
                    <Icon className="h-4 w-4" /> {l}
                  </button>
                ))}
              </div>
            </div>
            {/* Customer selection for group/individual */}
            {form.targetType !== "all" && (
              <div className="space-y-2">
                <span className="text-sm font-bold text-[var(--text-secondary)] dark:text-muted">
                  Seleccionar clientes
                </span>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] dark:text-muted pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar cliente…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full pl-9 pr-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] divide-y divide-[var(--rule-soft)]">
                  {filteredFormCustomers.map((c) => (
                    <label
                      key={c.phone}
                      className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-[var(--surface-sunken)] cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPhones.has(c.phone)}
                        onChange={() => {
                          setSelectedPhones((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.phone)) next.delete(c.phone);
                            else next.add(c.phone);
                            return next;
                          });
                        }}
                        className="rounded border-[var(--rule-base)] text-primary focus:ring-primary"
                      />
                      <span className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                        {c.name}
                      </span>
                      <span className="text-sm text-[var(--text-tertiary)] dark:text-muted font-mono">
                        {c.phone}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedPhones.size > 0 && (
                  <p className="text-sm text-primary font-semibold">
                    {selectedPhones.size} cliente{selectedPhones.size !== 1 ? "s" : ""} seleccionado
                    {selectedPhones.size !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            )}
            {/* Expiry */}
            <Field
              label="Fecha de expiración"
              labelClassName="text-sm font-bold text-[var(--text-secondary)] dark:text-muted"
            >
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                className="w-full mt-1 px-3 h-12 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] outline-none focus:border-primary text-[var(--text-secondary)] dark:text-muted"
              />
            </Field>
          </div>
        </AdminModal>
      )}
    </>
  );
}
