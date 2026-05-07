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
  Building2, MessageCircle, Search, AlertTriangle, X,
} from "@buleje/design-system/icons";
import {
  PLATFORM_CONFIG_DEFAULTS,
  type PlatformConfig,
} from "@/lib/platform-config";

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

type ImageKind = "logo" | "favicon" | "yapeQr" | "plinQr" | "ogImage";

export default function ConfiguracionClient() {
  const [config, setConfig] = useState<PlatformConfig>(PLATFORM_CONFIG_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/platform-config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al guardar");
        return;
      }
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch {
      setError("Error de red.");
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (kind: ImageKind, file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/superadmin/platform-config/upload", {
      method: "POST",
      credentials: "include",
      headers: { "x-csrf-token": csrf() },
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
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-purple)]" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        <header className="mb-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--brand-purple)] mb-1">
              Buleje · Plataforma
            </p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-[-0.02em]">
              Configuración general
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Todo lo que cambia acá se aplica en vivo en landing, registro y panel
              del negocio. Sin redeploy.
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-[var(--brand-purple)] text-white font-extrabold text-sm uppercase tracking-wider shadow-lg shadow-[var(--brand-purple)]/30 hover:shadow-xl disabled:opacity-60 transition-all"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAt ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" strokeWidth={2.5} />}
            {savedAt ? "Guardado" : "Guardar cambios"}
          </button>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-700)] dark:text-red-300 inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto" aria-label="Cerrar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ── 1. Pagos manuales ─────────────────────────────────────── */}
        <Section
          icon={<Smartphone className="h-5 w-5 text-[var(--brand-purple)]" />}
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
          icon={<Building2 className="h-5 w-5 text-[var(--brand-purple)]" />}
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
        </Section>

        {/* ── 3. Contacto / Soporte ───────────────────────────────── */}
        <Section
          icon={<MessageCircle className="h-5 w-5 text-[var(--brand-purple)]" />}
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
          icon={<Search className="h-5 w-5 text-[var(--brand-purple)]" />}
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

        {/* Sticky save al pie */}
        <div className="mt-8 sticky bottom-4 flex justify-end z-10">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--brand-purple)] text-white font-extrabold text-sm uppercase tracking-wider shadow-2xl shadow-[var(--brand-purple)]/40 hover:shadow-2xl hover:opacity-95 disabled:opacity-60 transition-all"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedAt ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" strokeWidth={2.5} />}
            {savedAt ? "Guardado ✓" : "Guardar todos los cambios"}
          </button>
        </div>
      </div>
    </main>
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
    <section className="mb-6 rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] flex items-start gap-3">
        <span className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand-purple)]/10">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-extrabold leading-tight">{title}</h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)] leading-snug">{subtitle}</p>
        </div>
      </div>
      <div className="px-5 sm:px-6 py-5 space-y-5">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[var(--brand-purple)]/30 pl-4">
      <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--brand-purple)] mb-2.5">
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
      <label htmlFor={id} className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-semibold focus:border-[var(--brand-purple)] focus:ring-2 focus:ring-[var(--brand-purple)]/20 outline-none"
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold focus:border-[var(--brand-purple)] focus:ring-2 focus:ring-[var(--brand-purple)]/20 outline-none"
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
      <label htmlFor={id} className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2 h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2">
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
          className="flex-1 h-8 bg-transparent text-sm font-mono font-bold focus:outline-none uppercase"
        />
      </div>
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
      <label htmlFor={inputId} className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1">
        {label}
      </label>
      <div className="flex items-center gap-3">
        {url ? (
          <div className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border-2 border-[var(--rule-base)] bg-white">
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
            className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-[var(--brand-purple)]/10 text-[var(--brand-purple)] text-xs font-extrabold uppercase tracking-wider cursor-pointer hover:bg-[var(--brand-purple)]/15 ${busy ? "opacity-60 pointer-events-none" : ""}`}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
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
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error-600)]"
            >
              <X className="h-3 w-3" /> Quitar
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
