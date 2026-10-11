"use client";

/**
 * La ventana para dar de alta o editar un repartidor (nombre, teléfono, zona,
 * vehículo, tarifa y si está activo) y la confirmación para eliminarlo.
 *
 * Sacadas de `tabs/RepartidoresTab.tsx` el 10-10 (mismo comportamiento) para
 * que la sección Equipo de Reparto quede en archivos de menos de 300 líneas.
 */
import { useState } from "react";
import { AlertCircle, ChevronDown, Save } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { Field } from "@/components/admin/shared/Field";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

const VEHICLE_TYPES = ["Moto", "Bicicleta", "Auto", "A pie", "Motokar"];
const ZONAS = [
  "Yarinacocha",
  "Callería",
  "Manantay",
  "Centro",
  "Pueblo Libre",
  "Ica Yanayacu",
  "Todos",
];
const EMPTY_PARTNER: Omit<DeliveryPartner, "id" | "createdAt"> = {
  name: "",
  phone: "",
  zone: "Centro",
  vehicleType: "Moto",
  fee: 5,
  rating: 5,
  isActive: true,
};

export function PartnerModal({
  partner,
  onClose,
  onSave,
}: {
  partner: Partial<DeliveryPartner> | null;
  onClose: () => void;
  onSave: (data: Omit<DeliveryPartner, "id" | "createdAt">) => Promise<void>;
}) {
  const [form, setForm] = useState<Omit<DeliveryPartner, "id" | "createdAt">>(
    partner
      ? {
          name: partner.name ?? "",
          phone: partner.phone ?? "",
          zone: partner.zone ?? "Centro",
          vehicleType: partner.vehicleType ?? "Moto",
          fee: partner.fee ?? 5,
          rating: partner.rating ?? 5,
          isActive: partner.isActive ?? true,
        }
      : { ...EMPTY_PARTNER },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError("Error al guardar el repartidor. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={partner?.id ? "Editar repartidor" : "Nuevo repartidor"}
      size="md"
      claveVentana="repartidor-form"
      footer={
        <ModalFooter>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="submit"
            form="repartidor-form"
            disabled={saving}
            className={button({ variant: "primary" })}
          >
            {saving ? (
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </ModalFooter>
      }
    >
      <form id="repartidor-form" onSubmit={handleSubmit} className={`space-y-4 ${MODAL_BODY}`}>
        {error && (
          <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-500)]">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Field
              label="Nombre completo *"
              labelClassName="text-xs font-bold text-[var(--text-secondary)]"
            >
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Juan Pérez"
                className="w-full px-3 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </Field>
          </div>

          <div className="space-y-1.5">
            <Field label="Teléfono" labelClassName="text-xs font-bold text-[var(--text-secondary)]">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="987654321"
                className="w-full px-3 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </Field>
          </div>

          <div className="space-y-1.5">
            <Field
              label="Tarifa base (S/)"
              labelClassName="text-xs font-bold text-[var(--text-secondary)]"
            >
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.fee}
                onChange={(e) => setForm((p) => ({ ...p, fee: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </Field>
          </div>

          <div className="space-y-1.5">
            <Field label="Zona" labelClassName="text-xs font-bold text-[var(--text-secondary)]">
              {(id) => (
                <div className="relative">
                  <select
                    id={id}
                    value={form.zone}
                    onChange={(e) => setForm((p) => ({ ...p, zone: e.target.value }))}
                    className="w-full px-3 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
                  >
                    {ZONAS.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
                </div>
              )}
            </Field>
          </div>

          <div className="space-y-1.5">
            <Field label="Vehículo" labelClassName="text-xs font-bold text-[var(--text-secondary)]">
              {(id) => (
                <div className="relative">
                  <select
                    id={id}
                    value={form.vehicleType}
                    onChange={(e) => setForm((p) => ({ ...p, vehicleType: e.target.value }))}
                    className="w-full px-3 h-11 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary appearance-none transition-all"
                  >
                    {VEHICLE_TYPES.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
                </div>
              )}
            </Field>
          </div>
        </div>

        {/* Activo toggle — a11y: role="switch" + aria-checked */}
        <div className="flex items-center justify-between p-3 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-base)]">
          <label
            htmlFor="partner-active-toggle"
            className="text-sm font-bold text-[var(--text-primary)] cursor-pointer"
          >
            Activo
          </label>
          <button
            type="button"
            id="partner-active-toggle"
            role="switch"
            aria-checked={form.isActive}
            aria-label={form.isActive ? "Desactivar repartidor" : "Activar repartidor"}
            onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
              form.isActive ? "bg-primary" : "bg-[var(--rule-base)]",
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-[var(--surface-raised)] transition-transform",
                form.isActive ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>
      </form>
    </AdminModal>
  );
}

/** «¿Eliminar repartidor?» — la confirmación de antes, igual; botones de 48 px. */
export function ConfirmarBorrarRepartidor({
  borrando,
  onCancelar,
  onConfirmar,
}: {
  borrando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <AdminModal
      open
      onClose={onCancelar}
      title="¿Eliminar repartidor?"
      icon={AlertCircle}
      size="sm"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCancelar} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={borrando}
            className={button({ variant: "danger" })}
          >
            {borrando ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </ModalFooter>
      }
    >
      <p className={`text-sm text-[var(--text-secondary)] ${MODAL_BODY}`}>
        Esta acción no se puede deshacer.
      </p>
    </AdminModal>
  );
}
