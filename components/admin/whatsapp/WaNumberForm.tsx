"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared";
import { CheckCircle2, AlertCircle, Loader2 } from "@buleje/design-system/icons";
import { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";

/** Los campos a 48 px y 14 px, como el resto del panel. */
const CAMPO = "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export interface WaConfigView {
  id: string;
  label: string | null;
  phoneNumberId: string;
  whatsappTokenMasked?: string;
  webhookVerifyToken: string;
  wabaId: string | null;
  businessName: string | null;
  yapeNumber: string | null;
  isActive: boolean;
}

interface Props {
  /** null = conectar número nuevo; con valor = editar ese número. */
  initial: WaConfigView | null;
  onSaved: () => void;
  onCancel: () => void;
  /** El form notifica el verify token tipeado (la guía lo muestra con Copiar). */
  onVerifyTokenChange?: (token: string) => void;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className={`${ADMIN_TOKENS.label} mb-1.5 block`}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-sm text-[var(--text-secondary)]">{hint}</p>}
    </div>
  );
}

/** Form de un número WhatsApp (crear/editar) — TenantWhatsAppConfig multi-número. */
export default function WaNumberForm({ initial, onSaved, onCancel, onVerifyTokenChange }: Props) {
  const isNew = !initial;
  const [form, setForm] = useState({
    label: initial?.label ?? "",
    phoneNumberId: initial?.phoneNumberId ?? "",
    whatsappToken: "",
    webhookVerifyToken: initial?.webhookVerifyToken ?? "",
    wabaId: initial?.wabaId ?? "",
    businessName: initial?.businessName ?? "",
    yapeNumber: initial?.yapeNumber ?? "",
    isActive: initial?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === "webhookVerifyToken" && typeof v === "string") onVerifyTokenChange?.(v.trim());
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        ...(initial ? { id: initial.id } : {}),
        label: form.label.trim() || null,
        phoneNumberId: form.phoneNumberId.trim(),
        webhookVerifyToken: form.webhookVerifyToken.trim(),
        wabaId: form.wabaId.trim() || null,
        businessName: form.businessName.trim() || null,
        yapeNumber: form.yapeNumber.trim() || null,
        isActive: form.isActive,
      };
      if (form.whatsappToken.trim()) body.whatsappToken = form.whatsappToken.trim();

      const res = await fetch("/api/admin/whatsapp-config", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "No se pudo guardar la configuración");
        return;
      }
      onSaved();
    } catch {
      setError("Error de red. Reintenta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    /* Vive dentro de la ventana «Conectar número» (WhatsAppBotConfig): el título lo pone ella. */
    <div className={MODAL_BODY}>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Etiqueta" hint="Cómo lo ves en el inbox (ej. Ventas, Delivery). Opcional.">
          <input
            className={CAMPO}
            value={form.label}
            onChange={(e) => set("label")(e.target.value)}
            placeholder="Ventas"
            maxLength={40}
          />
        </Field>
        <Field label="Phone Number ID" hint="Lo da Meta en WhatsApp > API Setup (solo dígitos).">
          <input
            className={CAMPO}
            value={form.phoneNumberId}
            onChange={(e) => set("phoneNumberId")(e.target.value)}
            placeholder="123456789012345"
            inputMode="numeric"
          />
        </Field>
      </div>

      <Field
        label="Token de acceso (WhatsApp Token)"
        hint={isNew ? "Token permanente de la app de Meta." : "Deja vacío para mantener el actual. Pega uno nuevo solo si cambió."}
      >
        <input
          type="password"
          className={CAMPO}
          value={form.whatsappToken}
          onChange={(e) => set("whatsappToken")(e.target.value)}
          placeholder={isNew ? "EAAG..." : `Actual: ${initial?.whatsappTokenMasked ?? "configurado"}`}
          autoComplete="off"
        />
      </Field>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Verify Token del webhook" hint="El que pusiste al configurar el webhook en Meta (mín. 6 caracteres).">
          <input
            className={CAMPO}
            value={form.webhookVerifyToken}
            onChange={(e) => set("webhookVerifyToken")(e.target.value)}
            placeholder="mi-verify-token"
          />
        </Field>
        <Field label="WABA ID" hint="WhatsApp Business Account ID. Necesario para mandar plantillas fuera de la ventana de 24h. Opcional.">
          <input
            className={CAMPO}
            value={form.wabaId}
            onChange={(e) => set("wabaId")(e.target.value)}
            placeholder="102290129340398"
            inputMode="numeric"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Nombre del negocio" hint="Opcional. Aparece en los mensajes del bot.">
          <input
            className={CAMPO}
            value={form.businessName}
            onChange={(e) => set("businessName")(e.target.value)}
            placeholder="Bodega San Martín"
          />
        </Field>
        <Field label="Número Yape" hint="Opcional. 9 dígitos, para cobros del bot.">
          <input
            className={CAMPO}
            value={form.yapeNumber}
            onChange={(e) => set("yapeNumber")(e.target.value)}
            placeholder="999888777"
            inputMode="numeric"
          />
        </Field>
      </div>

      <label className="mt-2 flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => set("isActive")(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Número activo (recibe y responde mensajes)
      </label>

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-[var(--data-error-ink)]">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-3">
        <button type="button" onClick={onCancel} className={button({ variant: "secondary", className: "rounded-xl" })}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !form.phoneNumberId.trim() || !form.webhookVerifyToken.trim()}
          className={button({ variant: "primary", className: "rounded-xl" })}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {saving ? "Guardando…" : isNew ? "Conectar número" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
