"use client";

import { useState, useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared";
import {
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
} from "@buleje/design-system/icons";
import WaConnectionGuide from "./WaConnectionGuide";

/**
 * WhatsAppBotConfig — form de configuración del bot WhatsApp por tenant.
 *
 * Brandon 2026-06-17: la API (`/api/admin/whatsapp-config`) ya existía pero no
 * había UI — el `TenantWhatsAppConfig` solo se poblaba por DB. Sin esto el bot
 * que toma pedidos (`lib/whatsapp/concierge/*`) descarta los mensajes entrantes.
 *
 * Secret seguro: el GET devuelve el token ENMASCARADO (...XXXXXX); el form nunca
 * tiene el token completo. Al guardar solo manda un token nuevo si lo pegás
 * (vacío = se mantiene el existente, gracias al PUT optional).
 */

interface ConfigState {
  phoneNumberId: string;
  whatsappTokenMasked?: string;
  webhookVerifyToken: string;
  businessName: string | null;
  yapeNumber: string | null;
  isActive: boolean;
}

export default function WhatsAppBotConfig() {
  const [config, setConfig] = useState<ConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  // Probar conexión: consulta el número real en Meta con las credenciales guardadas
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({
    phoneNumberId: "",
    whatsappToken: "",
    webhookVerifyToken: "",
    businessName: "",
    yapeNumber: "",
    isActive: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/whatsapp-config");
        if (res.ok) {
          const { config: c } = (await res.json()) as { config: ConfigState | null };
          if (c) {
            setConfig(c);
            setForm({
              phoneNumberId: c.phoneNumberId ?? "",
              whatsappToken: "",
              webhookVerifyToken: c.webhookVerifyToken ?? "",
              businessName: c.businessName ?? "",
              yapeNumber: c.yapeNumber ?? "",
              isActive: c.isActive ?? true,
            });
          }
        }
      } catch {
        /* sin config previa: form vacío */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (k: keyof typeof form) => (v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError("");
    setOk(false);
    try {
      const body: Record<string, unknown> = {
        phoneNumberId: form.phoneNumberId.trim(),
        webhookVerifyToken: form.webhookVerifyToken.trim(),
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
      setOk(true);
      setForm((f) => ({ ...f, whatsappToken: "" }));
      // Releer para refrescar el token enmascarado.
      const r2 = await fetch("/api/admin/whatsapp-config");
      if (r2.ok) {
        const { config: c } = (await r2.json()) as { config: ConfigState | null };
        setConfig(c);
      }
    } catch {
      setError("Error de red. Reintentá.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/whatsapp/test", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        phone?: string | null;
        verifiedName?: string | null;
        error?: string;
      };
      if (res.ok && json.ok) {
        setTestResult({
          ok: true,
          text: `Conectado: ${json.phone ?? "número OK"}${json.verifiedName ? ` · ${json.verifiedName}` : ""}`,
        });
      } else {
        setTestResult({ ok: false, text: json.error ?? "Meta rechazó las credenciales." });
      }
    } catch {
      setTestResult({ ok: false, text: "Error de red al probar la conexión." });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando configuración…
      </div>
    );
  }

  const activo = !!config && config.isActive;

  return (
    <div className="max-w-2xl space-y-4">
      {/* Estado */}
      <div
        className={[
          "flex items-center gap-3 rounded-xl border p-4",
          activo
            ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5"
            : "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
        ].join(" ")}
      >
        <div
          className={[
            "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
            activo
              ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]"
              : "bg-[var(--surface-raised)] text-[var(--text-tertiary)]",
          ].join(" ")}
        >
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {activo ? "Bot WhatsApp activo" : config ? "Bot configurado pero inactivo" : "Bot sin configurar"}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {config
              ? `Número ${config.phoneNumberId} · token ${config.whatsappTokenMasked ?? "—"}`
              : "Pegá las credenciales de Meta WhatsApp Business para que el bot tome pedidos 24/7."}
          </p>
        </div>
      </div>

      {/* Guía de conexión paso a paso (webhook URL + verify token con copiar) */}
      <WaConnectionGuide verifyToken={form.webhookVerifyToken.trim()} />

      {/* Form */}
      <div className={ADMIN_TOKENS.cardPadded}>
        <Field label="Phone Number ID" hint="Lo da Meta en WhatsApp > API Setup (solo dígitos).">
          <input
            className={ADMIN_TOKENS.input}
            value={form.phoneNumberId}
            onChange={(e) => set("phoneNumberId")(e.target.value)}
            placeholder="123456789012345"
            inputMode="numeric"
          />
        </Field>

        <Field
          label="Token de acceso (WhatsApp Token)"
          hint={config ? "Dejá vacío para mantener el actual. Pegá uno nuevo solo si cambió." : "Token permanente de la app de Meta."}
        >
          <input
            type="password"
            className={ADMIN_TOKENS.input}
            value={form.whatsappToken}
            onChange={(e) => set("whatsappToken")(e.target.value)}
            placeholder={config ? `Actual: ${config.whatsappTokenMasked ?? "configurado"}` : "EAAG..."}
            autoComplete="off"
          />
        </Field>

        <Field label="Verify Token del webhook" hint="El que pusiste al configurar el webhook en Meta (mín. 6 caracteres).">
          <input
            className={ADMIN_TOKENS.input}
            value={form.webhookVerifyToken}
            onChange={(e) => set("webhookVerifyToken")(e.target.value)}
            placeholder="mi-verify-token"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nombre del negocio" hint="Opcional. Aparece en los mensajes del bot.">
            <input
              className={ADMIN_TOKENS.input}
              value={form.businessName}
              onChange={(e) => set("businessName")(e.target.value)}
              placeholder="Bodega San Martín"
            />
          </Field>
          <Field label="Número Yape" hint="Opcional. 9 dígitos, para cobros del bot.">
            <input
              className={ADMIN_TOKENS.input}
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
          Bot activo (recibe y responde mensajes)
        </label>

        {error && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--data-error-500)]">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {ok && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--data-success-500)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Configuración guardada.
          </p>
        )}

        {testResult && (
          <p
            className={[
              "flex items-center gap-1.5 text-sm font-medium",
              testResult.ok ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
            ].join(" ")}
          >
            {testResult.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {testResult.text}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={testConnection}
            disabled={testing || !config}
            className={ADMIN_TOKENS.btnSecondary}
            title={config ? "Consulta tu número en Meta con las credenciales guardadas" : "Guardá la configuración primero"}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !form.phoneNumberId.trim() || !form.webhookVerifyToken.trim()}
            className={ADMIN_TOKENS.btnPrimary}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      </div>
    </div>
  );
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
      {hint && <p className={`${ADMIN_TOKENS.hint} mt-1`}>{hint}</p>}
    </div>
  );
}
