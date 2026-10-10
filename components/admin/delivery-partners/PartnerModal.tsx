"use client";

/**
 * La ventana para dar de alta o editar un repartidor (nombre, teléfono, zona,
 * vehículo, tarifa y si está activo) y la confirmación para eliminarlo.
 *
 * Sacadas de `tabs/RepartidoresTab.tsx` el 10-10 (mismo comportamiento) para
 * que la sección Equipo de Reparto quede en archivos de menos de 300 líneas.
 */
import { useState, useEffect, useRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, ChevronDown, Save, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { Field } from "@/components/admin/shared/Field";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";

const VEHICLE_TYPES = ["Moto", "Bicicleta", "Auto", "A pie", "Motokar"];
const ZONAS = [
  "Yarinacocha", "Callería", "Manantay", "Centro",
  "Pueblo Libre", "Ica Yanayacu", "Todos",
];
const EMPTY_PARTNER: Omit<DeliveryPartner, "id" | "createdAt"> = {
  name: "", phone: "", zone: "Centro", vehicleType: "Moto",
  fee: 5, rating: 5, isActive: true,
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
      : { ...EMPTY_PARTNER }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // El propio Escape de abajo ya cierra el modal — el hook sólo aporta foco
  // inicial + trampa de Tab (por eso cerrarConEscape: false).
  useModalAccesible(panelRef, { cerrarConEscape: false });
  /** Ventana: se mueve, se achica y se fija (ADR-420). */
  const ventana = useVentanaDeModal(true, {
    ref: panelRef,
    aplicarTranslate: true,
    claveMemoria: "repartidor-form",
  });

  // FIX 2026-05-06 (audit team): a11y modal — Esc cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("El nombre es obligatorio."); return; }
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
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget && !ventana.fijado) onClose(); }}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="relative bg-[var(--surface-raised)] rounded-2xl w-full max-w-md shadow-[var(--shadow-xl)] border border-[var(--rule-base)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-modal-title"
        tabIndex={-1}
      >
        <div {...ventana.asaProps} className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)]">
          <CardTitle id="partner-modal-title" className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            {partner?.id ? "Editar repartidor" : "Nuevo repartidor"}
          </CardTitle>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-500)]">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Field label="Nombre completo *" labelClassName="text-xs font-bold text-[var(--text-secondary)]">
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
              <Field label="Tarifa base (S/)" labelClassName="text-xs font-bold text-[var(--text-secondary)]">
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
                      {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
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
                      {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
                  </div>
                )}
              </Field>
            </div>
          </div>

          {/* Activo toggle — a11y: role="switch" + aria-checked */}
          <div className="flex items-center justify-between p-3 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-base)]">
            <label htmlFor="partner-active-toggle" className="text-sm font-bold text-[var(--text-primary)] cursor-pointer">
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
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-[var(--surface-raised)] transition-transform",
                form.isActive ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-11 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-base)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 min-h-11 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
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
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onCancelar()}
      role="presentation"
    >
      <div
        className="bg-[var(--surface-raised)] rounded-2xl w-full max-w-sm p-6 border border-[var(--rule-base)] shadow-[var(--shadow-xl)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="borrar-repartidor-titulo"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[var(--data-error-100)] flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5 text-[var(--data-error-500)]" aria-hidden />
          </div>
          <div>
            <CardTitle id="borrar-repartidor-titulo" className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              ¿Eliminar repartidor?
            </CardTitle>
            <p className="text-sm text-[var(--text-secondary)]">Esta acción no se puede deshacer.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 min-h-12 rounded-xl text-sm font-semibold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-base)] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={borrando}
            className="flex-1 min-h-12 rounded-xl text-sm font-semibold text-white bg-[var(--data-error-500)] transition-colors disabled:opacity-50"
          >
            {borrando ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
