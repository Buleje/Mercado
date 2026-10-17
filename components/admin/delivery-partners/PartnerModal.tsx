"use client";

/**
 * La ventana para dar de alta o editar un repartidor (nombre, celular, zona,
 * vehículo, tarifa y si recibe pedidos). La confirmación de borrar vive en
 * `ConfirmarBorrarRepartidor.tsx`.
 *
 * 17-10 (P20/P22): la tarifa explica qué paga y cuándo se usa; el celular es
 * obligatorio y se valida acá; los errores del servidor (teléfono repetido,
 * mal escrito) salen al lado de su campo, no en un «Error al guardar» genérico.
 */
import { useState } from "react";
import { AlertCircle, ChevronDown, Save } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { toNum, type DeliveryPartner } from "@/components/admin/delivery-partners/shared";
import { Field } from "@/components/admin/shared/Field";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ErrorRepartidor, type DatosRepartidor } from "./repartidores-api";

const VEHICLE_TYPES = ["Moto", "Bicicleta", "Auto", "A pie", "Motokar"];
const ZONAS = ["Yarinacocha", "Callería", "Manantay", "Centro", "Pueblo Libre", "Ica Yanayacu", "Todos"];
const TELEFONO = /^9\d{8}$/;
const ROTULO = "text-xs font-bold text-[var(--text-secondary)]";
const CASILLA =
  "w-full px-3 h-11 rounded-xl border bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";
const borde = (mal?: string) => (mal ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]");

const VACIO: DatosRepartidor = { name: "", phone: "", zone: "Centro", vehicleType: "Moto", fee: 5, rating: 5, isActive: true };

/** Lo que se revisa antes de mandar: así el error sale sin esperar al servidor. */
function revisar(f: DatosRepartidor): Record<string, string> {
  const out: Record<string, string> = {};
  if (!f.name.trim()) out.name = "Escribe el nombre.";
  const tel = f.phone.replace(/\s+/g, "");
  if (!tel) out.phone = "Escribe su celular: con él lo llamas y le avisas de pedidos.";
  else if (!TELEFONO.test(tel)) out.phone = "Escribe 9 dígitos que empiecen con 9 (ej. 987654321).";
  if (toNum(f.fee) < 0) out.fee = "La tarifa no puede ser negativa.";
  return out;
}

export function PartnerModal({
  partner,
  onClose,
  onSave,
}: {
  partner: Partial<DeliveryPartner> | null;
  onClose: () => void;
  onSave: (data: DatosRepartidor) => Promise<void>;
}) {
  const [form, setForm] = useState<DatosRepartidor>(
    partner
      ? {
          name: partner.name ?? "",
          phone: partner.phone ?? "",
          zone: partner.zone ?? "Centro",
          vehicleType: partner.vehicleType ?? "Moto",
          fee: toNum(partner.fee ?? 5),
          rating: partner.rating ?? 5,
          isActive: partner.isActive ?? true,
        }
      : { ...VACIO },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const nuevo = !partner?.id;

  const cambiar = <K extends keyof DatosRepartidor>(k: K, v: DatosRepartidor[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setCampos((c) => (c[k] ? { ...c, [k]: "" } : c));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return; // doble clic: un solo alta
    const malos = revisar(form);
    setCampos(malos);
    if (Object.keys(malos).length > 0) {
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...form, phone: form.phone.replace(/\s+/g, "") });
      onClose();
    } catch (err) {
      if (err instanceof ErrorRepartidor && Object.keys(err.campos).length > 0) {
        setCampos(err.campos);
      } else {
        setError(err instanceof Error && err.message ? err.message : "No se pudo guardar. Intenta otra vez.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title={nuevo ? "Nuevo repartidor" : "Editar repartidor"}
      size="md"
      claveVentana="repartidor-form"
      footer={
        <ModalFooter>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Cancelar
          </button>
          <button type="submit" form="repartidor-form" disabled={saving} className={button({ variant: "primary" })}>
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
      <form id="repartidor-form" onSubmit={handleSubmit} noValidate className={`space-y-4 ${MODAL_BODY}`}>
        {error && (
          <div role="alert" className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)] rounded-xl text-sm text-[var(--data-error-ink)]">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre completo" required error={campos.name || undefined} labelClassName={ROTULO} className="col-span-2 space-y-1.5">
            <input
              type="text"
              value={form.name}
              onChange={(e) => cambiar("name", e.target.value)}
              placeholder="Juan Pérez"
              aria-invalid={Boolean(campos.name)}
              className={cn(CASILLA, borde(campos.name))}
            />
          </Field>

          <Field label="Celular" required error={campos.phone || undefined} labelClassName={ROTULO} className="space-y-1.5">
            <input
              type="tel"
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => cambiar("phone", e.target.value)}
              placeholder="987654321"
              aria-invalid={Boolean(campos.phone)}
              className={cn(CASILLA, borde(campos.phone))}
            />
          </Field>

          <Field
            label={
              <span className="inline-flex items-center gap-1">
                Tarifa por entrega (S/)
                <InfoTip
                  title="Tarifa por entrega"
                  what="Lo que TÚ le pagas a este repartidor por cada pedido que entrega. No es lo que cobras al cliente por el delivery."
                  affects="Se usa cuando le asignas un pedido a mano (Asignaciones). Los pedidos que acepta solo desde su app se pagan aparte: S/ 5 + S/ 1,50 por km. Cambiarla no toca lo ya asignado: cada asignación guarda su tarifa. Lo ganado suma a su saldo y de ahí te pide retiros."
                  example="S/ 5 y entrega 10 pedidos asignados a mano → gana S/ 50 para retirar."
                />
              </span>
            }
            error={campos.fee || undefined}
            labelClassName={ROTULO}
            className="space-y-1.5"
          >
            <input
              type="number"
              min={0}
              step={0.5}
              value={form.fee}
              onChange={(e) => cambiar("fee", parseFloat(e.target.value) || 0)}
              aria-invalid={Boolean(campos.fee)}
              className={cn(CASILLA, borde(campos.fee))}
            />
          </Field>

          <Field label="Zona" error={campos.zone || undefined} labelClassName={ROTULO} className="space-y-1.5">
            {(id) => (
              <div className="relative">
                <select id={id} value={form.zone} onChange={(e) => cambiar("zone", e.target.value)} className={cn(CASILLA, borde(campos.zone), "appearance-none")}>
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

          <Field label="Vehículo" labelClassName={ROTULO} className="space-y-1.5">
            {(id) => (
              <div className="relative">
                <select id={id} value={form.vehicleType} onChange={(e) => cambiar("vehicleType", e.target.value)} className={cn(CASILLA, borde(), "appearance-none")}>
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

        {/* Recibe pedidos — a11y: role="switch" + aria-checked */}
        <div className="flex items-center justify-between gap-3 p-3 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-base)]">
          <span className="inline-flex items-center gap-1">
            <label htmlFor="partner-active-toggle" className="text-sm font-bold text-[var(--text-primary)] cursor-pointer">
              Recibe pedidos
            </label>
            <InfoTip
              title="Recibe pedidos"
              what="Prendido: le puedes asignar pedidos y le llegan ofertas cuando está conectado. Apagado: queda en tu equipo, con su historial y su saldo, pero no recibe nada."
              affects={nuevo ? "Si todavía no le explicaste cómo trabajar, guárdalo apagado y préndelo cuando esté listo." : "Apagarlo no le quita los pedidos que ya tiene en camino."}
            />
          </span>
          <button
            type="button"
            id="partner-active-toggle"
            role="switch"
            aria-checked={form.isActive}
            onClick={() => cambiar("isActive", !form.isActive)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30",
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
