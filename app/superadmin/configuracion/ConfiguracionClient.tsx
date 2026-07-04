"use client";

/**
 * ConfiguracionClient — panel del superadmin para configurar TODA la
 * plataforma sin tocar env vars ni redeploy.
 *
 * Brandon mayo 2026: cambio de Yape, logo, colores, contacto — todo
 * desde acá. La data se guarda en PlatformSetting (key/value global)
 * y la consume el storefront vía /api/platform-config/public.
 *
 * Secciones:
 *   1. Pagos manuales (Yape, Plin, Transferencia)
 *   2. Marca (nombre, logo, favicon, colores)
 *   3. Contacto / Soporte (WhatsApp, email, dirección)
 *   4. SEO defaults
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import {
  Loader2, Save, CheckCircle, Upload, Smartphone, CreditCard,
  Building2, MessageCircle, Search, AlertTriangle, X, Settings, ShieldCheck,
} from "@buleje/design-system/icons";
import { KeepAliveSwitch } from "@/components/shared/KeepAliveSwitch";
import {
  PLATFORM_CONFIG_DEFAULTS,
  type PlatformConfig,
} from "@/lib/platform-config";
import { AdminTabShell } from "../_components/_shared";
import { SuperAdminModuleTabs, SETTINGS_TABS } from "@/components/superadmin/_shared/ModuleTabs";
import { csrfHeaders } from "@/lib/csrf-client";

type ImageKind = "logo" | "favicon" | "yapeQr" | "plinQr" | "ogImage";

export default function ConfiguracionClient() {
  const [config, setConfig] = useState<PlatformConfig>(PLATFORM_CONFIG_DEFAULTS);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);

  // ¿Hay cambios sin guardar? Comparación estructural contra el último snapshot.
  const dirty = savedSnapshot !== "" && JSON.stringify(config) !== savedSnapshot;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/platform-config", { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        setError("No pudimos cargar la configuración.");
        return;
      }
      const data = (await res.json()) as { config: PlatformConfig };
      setConfig(data.config);
      setSavedSnapshot(JSON.stringify(data.config));
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setIssues([]);
    try {
      const snapshot = JSON.stringify(config);
      const res = await fetch("/api/superadmin/platform-config", {
        method: "PATCH",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: snapshot,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        // Surface campo-por-campo qué validación falló (ej. URL o color inválido).
        if (Array.isArray(data.issues)) {
          setIssues(
            data.issues.slice(0, 8).map((i: { path?: (string | number)[]; message?: string }) => ({
              path: (i.path ?? []).join(" › ") || "(raíz)",
              message: i.message ?? "inválido",
            })),
          );
        }
        return;
      }
      setSavedSnapshot(snapshot);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  }, [config]);

  // Aviso del navegador si intentás salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Keyboard: Cmd/Ctrl+S guarda sin recargar la página
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (!saving && !loading) void save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save, saving, loading]);

  const uploadImage = async (kind: ImageKind, file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/superadmin/platform-config/upload", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders(),
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Error al subir imagen");
      return null;
    }
    return data.url as string;
  };

  if (loading) {
    return (
      <AdminTabShell
      info={{
        what: "Ajustes globales de la plataforma: landing pública, registro de tiendas y panel del negocio.",
        affects: "Se aplica en vivo (sin redeploy) en la landing, el registro y el panel admin de los negocios.",
        example: "Cambiás el texto de bienvenida del registro → los nuevos dueños lo ven al instante.",
      }}
        title="Configuración general"
        description="Todo lo que cambia acá se aplica en vivo en landing, registro y panel del negocio — sin redeploy."
        icon={Settings}
        kicker="Configuración global · Plataforma"
      >
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        </div>
      </AdminTabShell>
    );
  }

  return (
    <>
      <SuperAdminModuleTabs tabs={SETTINGS_TABS} />
    <AdminTabShell
      title="Configuración general"
      description="Todo lo que cambia acá se aplica en vivo en landing, registro y panel del negocio — sin redeploy."
      icon={Settings}
      kicker="Configuración global · Plataforma"
    >
    <div className="space-y-6">
      {/* Barra de acción primaria — sticky top-right; reemplaza el <header>
          inline que duplicaba kicker/título con el AdminTabShell del wrapper. */}
      <div className="sticky top-2 z-20 flex items-center justify-between gap-3 flex-wrap rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur px-5 py-3.5">
        {dirty ? (
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[#0d9488]">
            <span aria-hidden className="inline-flex h-1.5 w-1.5 rounded-full bg-[#0d9488]" />
            Cambios sin guardar
          </p>
        ) : (
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-70 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            </span>
            {savedAt ? "Guardado · aplica en vivo" : "Todo guardado · aplica en vivo"}
          </p>
        )}
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[var(--accent-600,var(--accent))] text-white font-extrabold text-sm shadow-md shadow-[var(--accent)]/25 hover:gap-2.5 hover:shadow-lg hover:shadow-[var(--accent)]/35 disabled:opacity-50 disabled:shadow-none transition-all"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAt ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" strokeWidth={2.5} />}
          {saving ? "Guardando…" : savedAt ? "Guardado" : dirty ? "Guardar cambios" : "Sin cambios"}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm text-[var(--data-error-700)] dark:text-red-300 w-full">
          <div className="inline-flex items-center gap-2 w-full font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
            <button onClick={() => { setError(null); setIssues([]); }} className="ml-auto" aria-label="Cerrar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {issues.length > 0 && (
            <ul className="mt-2 space-y-1 pl-6 text-xs font-medium list-disc marker:text-[var(--data-error-500)]">
              {issues.map((it, i) => (
                <li key={i}><span className="font-mono font-bold">{it.path}</span>: {it.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Sesión y seguridad ────────────────────────────────────── */}
      <Section
        icon={<ShieldCheck className="h-5 w-5 text-[var(--accent)]" />}
        title="Sesión y seguridad"
        subtitle="Controlá cómo se mantiene tu sesión mientras trabajás en el panel."
      >
        <KeepAliveSwitch />
      </Section>

      {/* ── 1. Pagos manuales ─────────────────────────────────────── */}
      <Section
        icon={<Smartphone className="h-5 w-5 text-[var(--accent)]" />}
        title="Pagos manuales"
        subtitle="Datos que el cliente ve cuando elige pagar con Yape, Plin o transferencia."
      >
          <Subsection title="Yape">
            <Row>
              <TextField
                label="N° Yape"
                value={config.payment.yapeNumber ?? ""}
                onChange={(v) => setConfig({ ...config, payment: { ...config.payment, yapeNumber: v || null } })}
                placeholder="ej: 987654321"
              />
              <TextField
                label="Titular Yape"
                value={config.payment.yapeHolder ?? ""}
                onChange={(v) => setConfig({ ...config, payment: { ...config.payment, yapeHolder: v || null } })}
                placeholder="Buleje S.A.C."
              />
            </Row>
            <ImageField
              label="QR Yape (opcional)"
              kind="yapeQr"
              url={config.payment.yapeQrUrl}
              onUpload={async (f) => {
                const url = await uploadImage("yapeQr", f);
                if (url) setConfig({ ...config, payment: { ...config.payment, yapeQrUrl: url } });
              }}
              onClear={() => setConfig({ ...config, payment: { ...config.payment, yapeQrUrl: null } })}
            />
          </Subsection>

          <Subsection title="Plin">
            <Row>
              <TextField
                label="N° Plin"
                value={config.payment.plinNumber ?? ""}
                onChange={(v) => setConfig({ ...config, payment: { ...config.payment, plinNumber: v || null } })}
                placeholder="ej: 987654321"
              />
              <TextField
                label="Titular Plin"
                value={config.payment.plinHolder ?? ""}
                onChange={(v) => setConfig({ ...config, payment: { ...config.payment, plinHolder: v || null } })}
                placeholder="Buleje S.A.C."
              />
            </Row>
            <ImageField
              label="QR Plin (opcional)"
              kind="plinQr"
              url={config.payment.plinQrUrl}
              onUpload={async (f) => {
                const url = await uploadImage("plinQr", f);
                if (url) setConfig({ ...config, payment: { ...config.payment, plinQrUrl: url } });
              }}
              onClear={() => setConfig({ ...config, payment: { ...config.payment, plinQrUrl: null } })}
            />
          </Subsection>

          <Subsection title="Transferencia bancaria">
            <Row>
              <TextField
                label="Banco"
                value={config.payment.bankName ?? ""}
                onChange={(v) => setConfig({ ...config, payment: { ...config.payment, bankName: v || null } })}
                placeholder="BCP, Interbank, BBVA…"
              />
              <TextField
                label="Titular"
                value={config.payment.bankHolder ?? ""}
                onChange={(v) => setConfig({ ...config, payment: { ...config.payment, bankHolder: v || null } })}
                placeholder="Buleje S.A.C."
              />
            </Row>
            <Row>
              <TextField
                label="N° de cuenta"
                value={config.payment.bankAccount ?? ""}
                onChange={(v) => setConfig({ ...config, payment: { ...config.payment, bankAccount: v || null } })}
                placeholder="ej: 191-1234567-0-89"
              />
              <TextField
                label="CCI (interbancario)"
                value={config.payment.bankAccountCCI ?? ""}
                onChange={(v) => setConfig({ ...config, payment: { ...config.payment, bankAccountCCI: v || null } })}
                placeholder="ej: 002-191-001234567089-12"
              />
            </Row>
          </Subsection>
        </Section>

        {/* ── 2. Marca ─────────────────────────────────────────────── */}
        <Section
          icon={<Building2 className="h-5 w-5 text-[var(--accent)]" />}
          title="Marca"
          subtitle="Nombre, logo y colores que se aplican en todo el sitio."
        >
          <Row>
            <TextField
              label="Nombre de la marca"
              value={config.brand.name}
              onChange={(v) => setConfig({ ...config, brand: { ...config.brand, name: v || "Buleje" } })}
              placeholder="Buleje"
            />
            <TextField
              label="Tagline (opcional)"
              value={config.brand.tagline ?? ""}
              onChange={(v) => setConfig({ ...config, brand: { ...config.brand, tagline: v || null } })}
              placeholder="ej: Tu bodega, online en 5 minutos"
            />
          </Row>

          <ImageField
            label="Logo"
            kind="logo"
            url={config.brand.logoUrl}
            onUpload={async (f) => {
              const url = await uploadImage("logo", f);
              if (url) setConfig({ ...config, brand: { ...config.brand, logoUrl: url } });
            }}
            onClear={() => setConfig({ ...config, brand: { ...config.brand, logoUrl: null } })}
          />

          <ImageField
            label="Favicon (cuadrado, 128px+)"
            kind="favicon"
            url={config.brand.faviconUrl}
            onUpload={async (f) => {
              const url = await uploadImage("favicon", f);
              if (url) setConfig({ ...config, brand: { ...config.brand, faviconUrl: url } });
            }}
            onClear={() => setConfig({ ...config, brand: { ...config.brand, faviconUrl: null } })}
          />

          <Row>
            <ColorField
              label="Color primario"
              value={config.brand.primaryColor}
              onChange={(v) => setConfig({ ...config, brand: { ...config.brand, primaryColor: v } })}
            />
            <ColorField
              label="Color secundario"
              value={config.brand.secondaryColor}
              onChange={(v) => setConfig({ ...config, brand: { ...config.brand, secondaryColor: v } })}
            />
          </Row>

          {/* Preview en vivo de la marca */}
          <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 p-4">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">Vista previa</p>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative h-14 w-14 shrink-0 rounded-xl overflow-hidden border border-[var(--rule-soft)] bg-white">
                {config.brand.logoUrl ? (
                  <Image src={config.brand.logoUrl} alt="logo" fill sizes="56px" className="object-contain" unoptimized />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs text-[var(--text-tertiary)]">logo</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-extrabold leading-tight" style={{ color: config.brand.primaryColor }}>
                  {config.brand.name || "Buleje"}
                </div>
                {config.brand.tagline && <div className="text-sm text-[var(--text-secondary)] truncate">{config.brand.tagline}</div>}
              </div>
              <div className="ml-auto flex items-center gap-3">
                <SwatchPreview hex={config.brand.primaryColor} label="primario" />
                <SwatchPreview hex={config.brand.secondaryColor} label="secundario" />
                <button
                  type="button"
                  className="h-9 px-4 rounded-full text-xs font-extrabold text-white shadow-sm"
                  style={{ backgroundColor: config.brand.primaryColor }}
                >
                  Botón
                </button>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 3. Contacto / Soporte ───────────────────────────────── */}
        <Section
          icon={<MessageCircle className="h-5 w-5 text-[var(--accent)]" />}
          title="Contacto y soporte"
          subtitle="Datos públicos de contacto que aparecen en footer y CTAs."
        >
          <Row>
            <TextField
              label="WhatsApp de soporte"
              value={config.support.whatsappNumber ?? ""}
              onChange={(v) => setConfig({ ...config, support: { ...config.support, whatsappNumber: v || null } })}
              placeholder="ej: 51987654321"
            />
            <TextField
              label="Email de soporte"
              value={config.support.supportEmail ?? ""}
              onChange={(v) => setConfig({ ...config, support: { ...config.support, supportEmail: v || null } })}
              placeholder="hola@buleje.pe"
            />
          </Row>
          <Row>
            <TextField
              label="Teléfono fijo"
              value={config.support.supportPhone ?? ""}
              onChange={(v) => setConfig({ ...config, support: { ...config.support, supportPhone: v || null } })}
              placeholder="opcional"
            />
            <TextField
              label="Ciudad principal"
              value={config.support.city ?? ""}
              onChange={(v) => setConfig({ ...config, support: { ...config.support, city: v || null } })}
              placeholder="Pucallpa, Ciudad Constitución…"
            />
          </Row>
          <TextField
            label="Dirección de oficina"
            value={config.support.addressLine ?? ""}
            onChange={(v) => setConfig({ ...config, support: { ...config.support, addressLine: v || null } })}
            placeholder="opcional"
          />
        </Section>

        {/* ── 4. SEO ──────────────────────────────────────────────── */}
        <Section
          icon={<Search className="h-5 w-5 text-[var(--accent)]" />}
          title="SEO defaults"
          subtitle="Lo que aparece cuando alguien comparte tu sitio en redes."
        >
          <TextField
            label="Meta description (default)"
            value={config.seo.metaDescription ?? ""}
            onChange={(v) => setConfig({ ...config, seo: { ...config.seo, metaDescription: v || null } })}
            placeholder="Descripción que aparece en Google y redes (max 160 chars)"
            multiline
          />
          <ImageField
            label="Imagen para redes (1200×630)"
            kind="ogImage"
            url={config.seo.ogImageUrl}
            onUpload={async (f) => {
              const url = await uploadImage("ogImage", f);
              if (url) setConfig({ ...config, seo: { ...config.seo, ogImageUrl: url } });
            }}
            onClear={() => setConfig({ ...config, seo: { ...config.seo, ogImageUrl: null } })}
          />
        </Section>

      {/* Sticky save al pie — accent teal, sin uppercase forzado */}
      <div className="mt-2 sticky bottom-4 flex justify-end z-10">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[var(--accent-600,var(--accent))] text-white font-extrabold text-sm shadow-[var(--shadow-xl)] shadow-[var(--accent)]/40 hover:gap-2.5 hover:shadow-2xl hover:opacity-95 disabled:opacity-60 transition-all"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAt ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" strokeWidth={2.5} />}
          {savedAt ? "Guardado" : "Guardar todos los cambios"}
        </button>
      </div>
    </div>
    </AdminTabShell>
    </>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────

function Section({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <div className="px-5 sm:px-7 py-4 sm:py-5 border-b-2 border-[var(--rule-soft)] bg-linear-to-br from-[var(--surface-sunken)]/60 to-transparent flex items-start gap-3">
        <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] leading-tight tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)] leading-snug">{subtitle}</p>
        </div>
      </div>
      <div className="px-5 sm:px-7 py-6 space-y-6">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-[var(--accent)]/50 pl-4">
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}

function TextField({
  label, value, onChange, placeholder, multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5"
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2.5 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15"
        />
      )}
    </div>
  );
}

function ColorField({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5"
      >
        {label}
      </label>
      <div className="flex items-center gap-2 h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 transition-colors focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent)]/15">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 rounded-md cursor-pointer border-0 bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 h-8 bg-transparent text-sm font-mono font-bold text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)] uppercase"
        />
      </div>
    </div>
  );
}

function SwatchPreview({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="text-center">
      <span className="block h-9 w-9 rounded-lg border border-[var(--rule-soft)]" style={{ backgroundColor: hex }} aria-label={`${label} ${hex}`} />
      <span className="mt-1 block text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)]">{(hex || "").toUpperCase()}</span>
    </div>
  );
}

function ImageField({
  label, kind, url, onUpload, onClear,
}: {
  label: string;
  kind: ImageKind;
  url: string | null;
  onUpload: (f: File) => Promise<void>;
  onClear: () => void;
}) {
  const inputId = `imgfield-${kind}`;
  const [busy, setBusy] = useState(false);
  const handle = async (f: File) => {
    setBusy(true);
    try { await onUpload(f); } finally { setBusy(false); }
  };
  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5"
      >
        {label}
      </label>
      <div className="flex items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
        {url ? (
          <div className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border border-[var(--rule-soft)] bg-white">
            <Image src={url} alt={label} fill sizes="80px" className="object-contain" unoptimized />
          </div>
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-tertiary)]">
            <Upload className="h-5 w-5" strokeWidth={1.75} />
          </div>
        )}
        <div className="flex-1 flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            className={`inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-extrabold uppercase tracking-[var(--ls-wider)] cursor-pointer hover:bg-[var(--accent)] hover:text-white transition-colors ${busy ? "opacity-60 pointer-events-none" : ""}`}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" strokeWidth={2.5} />}
            {url ? "Reemplazar" : "Subir"}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handle(f);
              e.target.value = "";
            }}
          />
          {url && (
            <button
              onClick={onClear}
              className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border-2 border-[var(--rule-base)] text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error-600)] transition-colors"
            >
              <X className="h-3 w-3" strokeWidth={2.5} /> Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// CreditCard import lo dejé arriba para uso futuro de tabs (si se agrega
// preview por método). Mantenerlo evita el ruido del lint.
void CreditCard;
