"use client";

/**
 * /superadmin/marca — Centro de Marca de la plataforma Buleje.
 *
 * Hub único de personalización. Cada cambio acá se refleja en TODAS las
 * páginas del sitio que consumen `/api/platform-brand` o el hook
 * `usePlatformBrand`.
 *
 * Secciones:
 *  1. Identidad (nombre, tagline, descripción, ciudad)
 *  2. Logos (light/dark/square/favicon/og-image)
 *  3. Colores (primary/secondary/accent/danger/success)
 *  4. Tipografía (sans-serif body / serif display)
 *  5. Contacto (email/phone/whatsapp/address/horarios)
 *  6. Redes sociales (instagram/facebook/tiktok/x/youtube)
 *  7. SEO (meta-title, meta-description, OG)
 *  8. Legal (razón social, RUC, links a términos/privacidad)
 *  9. Modo evento (override temporal: logo + colores con ventana de fechas)
 *
 * Storage: lib/data/platform-brand.json (file system, MVP).
 * API: GET/PATCH /api/superadmin/brand.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Save, Sparkles, Image as ImageIcon, Palette, Type, Phone,
  Hash, Search, Scale, CalendarClock, CheckCircle2, AlertCircle,
  Globe, Eye, EyeOff, ExternalLink, MessageCircle, Mail, MapPin,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import ImageUploader from "@/components/superadmin/_shared/ImageUploader";
import { broadcastPlatformBrandUpdate, clearPlatformBrandCache } from "@/lib/use-platform-brand";

// ─────────────────────────────────────────────────────────────────────────────
// Types (espejo de lib/platform-brand.ts)
// ─────────────────────────────────────────────────────────────────────────────

type PlatformBrand = {
  identity: { name: string; tagline: string; description: string; since: string; city: string; country: string };
  logos: { logoLight: string | null; logoDark: string | null; logoSquare: string | null; favicon: string | null; ogImage: string | null };
  colors: { primary: string; secondary: string; accent: string; danger: string; success: string };
  typography: { fontFamily: string; fontDisplay: string };
  contact: { email: string; phone: string; whatsapp: string; address: string; supportHours: string };
  socials: { instagram: string; facebook: string; tiktok: string; x: string; youtube: string };
  seo: { metaTitle: string; metaDescription: string; ogTitle: string; ogDescription: string };
  legal: { legalName: string; ruc: string; termsUrl: string; privacyUrl: string; cookiesUrl: string };
  eventMode: {
    active: boolean; name: string;
    logoLight: string | null; logoDark: string | null;
    primaryColor: string | null; accentColor: string | null;
    startsAt: string | null; endsAt: string | null;
  };
};

type SectionId = "identity" | "logos" | "colors" | "typography" | "contact" | "socials" | "seo" | "legal" | "event";

const SECTIONS: { id: SectionId; label: string; icon: typeof Sparkles; description: string }[] = [
  { id: "identity",   label: "Identidad",      icon: Sparkles,      description: "Nombre, tagline y descripción de la plataforma." },
  { id: "logos",      label: "Logos",          icon: ImageIcon,     description: "Logo claro, oscuro, cuadrado, favicon y OG." },
  { id: "colors",     label: "Colores",        icon: Palette,       description: "Paleta de marca: primary, secondary, accent, alertas." },
  { id: "typography", label: "Tipografía",     icon: Type,          description: "Familia para body y para títulos display." },
  { id: "contact",    label: "Contacto",       icon: Phone,         description: "Email, teléfono, WhatsApp, dirección, horarios." },
  { id: "socials",    label: "Redes sociales", icon: Hash,          description: "Links a Instagram, Facebook, TikTok, X, YouTube." },
  { id: "seo",        label: "SEO & Open Graph", icon: Search,      description: "Meta title/description y previsualización social." },
  { id: "legal",      label: "Legal",          icon: Scale,         description: "Razón social, RUC, términos, privacidad." },
  { id: "event",      label: "Modo evento",    icon: CalendarClock, description: "Override temporal de logo + colores (Black Friday, Navidad)." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SuperadminMarcaPage() {
  const [brand, setBrand] = useState<PlatformBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionId>("identity");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/superadmin/brand", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setBrand(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function patch<K extends keyof PlatformBrand>(key: K, value: Partial<PlatformBrand[K]>) {
    if (!brand) return;
    setBrand({ ...brand, [key]: { ...brand[key], ...value } });
    setDirty(true);
  }

  async function save() {
    if (!brand) return;
    setSaving(true);
    setSaved(null);
    try {
      const res = await fetch("/api/superadmin/brand", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(brand),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaved({ kind: "err", text: err.error ?? `Error ${res.status}` });
      } else {
        const json = await res.json();
        if (json.brand) setBrand(json.brand);
        setSaved({ kind: "ok", text: "Marca actualizada · cambios visibles en el sitio" });
        setDirty(false);
        // Notificar a todas las tabs y limpiar el cache del hook usePlatformBrand
        clearPlatformBrandCache();
        broadcastPlatformBrandUpdate();
        setTimeout(() => setSaved(null), 4000);
      }
    } catch (e) {
      setSaved({ kind: "err", text: `Error de red: ${(e as Error).message}` });
    }
    setSaving(false);
  }

  // Stats
  const stats = useMemo(() => {
    if (!brand) return { logos: 0, colors: 5, contact: 0, socials: 0 };
    return {
      logos: Object.values(brand.logos).filter(Boolean).length,
      colors: Object.values(brand.colors).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).length,
      contact: Object.values(brand.contact).filter(Boolean).length,
      socials: Object.values(brand.socials).filter(Boolean).length,
    };
  }, [brand]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--text-tertiary)]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 animate-pulse" /> Cargando marca…
        </div>
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--data-error-500)]">
        No se pudo cargar la marca.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Header con preview de marca + stats ─────────────────────── */}
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5 min-w-0">
              <span
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl shrink-0 text-white font-display font-extrabold text-xl"
                style={{ backgroundColor: brand.colors.primary }}
              >
                {brand.identity.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Centro de marca
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  {brand.identity.name} · Personalización global
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Hub único de la marca. Cada cambio se refleja en{" "}
                  <strong>todas las páginas</strong> del marketplace que consumen{" "}
                  <code className="text-xs bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded">/api/platform-brand</code>.
                </p>
              </div>
            </div>

            <div className="flex items-stretch gap-2 flex-wrap">
              <StatPill label="Logos" value={`${stats.logos}/5`} />
              <StatPill label="Colores" value={`${stats.colors}/5`} />
              <StatPill label="Contacto" value={`${stats.contact}/5`} />
              <StatPill label="Redes" value={`${stats.socials}/5`} />
              {brand.eventMode.active && (
                <StatPill label={`Evento: ${brand.eventMode.name || "activo"}`} value="ON" accent="warning" />
              )}
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold border border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-sunken)] text-[var(--text-primary)] transition-colors"
                title="Abrir el sitio en una nueva pestaña para verificar los cambios"
              >
                <ExternalLink className="h-4 w-4" /> Ver en el sitio
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── 2-column layout ─────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar de secciones */}
          <aside className="lg:sticky lg:top-6 lg:self-start space-y-4">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2 px-1">
                Secciones
              </p>
              <div className="space-y-1">
                {SECTIONS.map((s) => {
                  const Icon = s.icon;
                  const active = activeSection === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveSection(s.id)}
                      aria-pressed={active}
                      className={cn(
                        "w-full flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all border",
                        active
                          ? "bg-[var(--accent)]/10 border-[var(--accent)]/30 shadow-sm"
                          : "border-transparent hover:bg-[var(--surface-sunken)]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 mt-0.5 shrink-0",
                          active ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className={cn(
                          "text-sm font-bold truncate",
                          active ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
                        )}>
                          {s.label}
                        </p>
                        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] truncate leading-tight mt-0.5">
                          {s.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live preview de cómo se ve el footer/contact en el sitio */}
            <LivePreviewCard brand={brand} />

            {/* Tip */}
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)] mb-1.5">
                Cómo funciona
              </p>
              <p className="text-xs text-[var(--text-secondary)] leading-snug">
                Cada cambio que guardás se propaga al instante a las pestañas
                abiertas vía <code className="text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] px-1 rounded">BroadcastChannel</code>.
                Los visitantes nuevos ven los cambios en máx. 5 min (cache CDN).
              </p>
            </div>
          </aside>

          {/* Main panel */}
          <main className="space-y-4">
            {activeSection === "identity"   && <IdentitySection brand={brand} onPatch={(p) => patch("identity", p)} />}
            {activeSection === "logos"      && <LogosSection brand={brand} onPatch={(p) => patch("logos", p)} />}
            {activeSection === "colors"     && <ColorsSection brand={brand} onPatch={(p) => patch("colors", p)} />}
            {activeSection === "typography" && <TypographySection brand={brand} onPatch={(p) => patch("typography", p)} />}
            {activeSection === "contact"    && <ContactSection brand={brand} onPatch={(p) => patch("contact", p)} />}
            {activeSection === "socials"    && <SocialsSection brand={brand} onPatch={(p) => patch("socials", p)} />}
            {activeSection === "seo"        && <SeoSection brand={brand} onPatch={(p) => patch("seo", p)} />}
            {activeSection === "legal"      && <LegalSection brand={brand} onPatch={(p) => patch("legal", p)} />}
            {activeSection === "event"      && <EventSection brand={brand} onPatch={(p) => patch("eventMode", p)} />}

            {/* Sticky save bar */}
            <div className="sticky bottom-4 z-10 mt-4">
              <div className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border bg-[var(--surface-raised)] px-5 py-3.5 shadow-lg",
                dirty ? "border-[var(--data-warning-500)]/40" : "border-[var(--rule-base)]",
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  {dirty ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-500)]">
                      <AlertCircle className="h-4 w-4" /> Cambios sin guardar
                    </span>
                  ) : saved ? (
                    <span className={cn(
                      "inline-flex items-center gap-1.5 text-sm font-bold",
                      saved.kind === "ok" ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]",
                    )}>
                      {saved.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      {saved.text}
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--text-tertiary)]">
                      Editando <strong className="text-[var(--text-primary)]">{SECTIONS.find((s) => s.id === activeSection)?.label}</strong>
                    </span>
                  )}
                </div>
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold transition-all",
                    dirty
                      ? "bg-[var(--accent-600,var(--accent))] text-white hover:opacity-90 shadow-sm"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                  )}
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Guardando…" : "Guardar marca"}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section components
// ─────────────────────────────────────────────────────────────────────────────

function SectionShell({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-7">
      <div className="mb-5">
        <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)] mb-1">
          {title}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block mb-1.5">
        <span className="text-xs font-extrabold text-[var(--text-primary)]">{label}</span>
        {hint && <span className="block text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)] mt-0.5">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none",
        props.className,
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none min-h-[80px]",
        props.className,
      )}
    />
  );
}

function StatPill({ label, value, accent }: { label: string; value: string | number; accent?: "warning" | "default" }) {
  const isWarn = accent === "warning";
  return (
    <div className={cn(
      "rounded-xl border px-3.5 py-2 min-w-[88px]",
      isWarn ? "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10" : "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
    )}>
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
        {label}
      </p>
      <p className={cn(
        "font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none",
        isWarn ? "text-[var(--data-warning-500)]" : "text-[var(--text-primary)]",
      )}>
        {value}
      </p>
    </div>
  );
}

function IdentitySection({ brand, onPatch }: { brand: PlatformBrand; onPatch: (p: Partial<PlatformBrand["identity"]>) => void }) {
  return (
    <SectionShell title="Identidad" description="Cómo se llama y qué hace tu plataforma. Aparece en header, footer, SEO y compartidos sociales.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nombre de la plataforma" hint="2-30 caracteres · aparece en navbar y footer">
          <TextInput value={brand.identity.name} onChange={(e) => onPatch({ name: e.target.value })} />
        </Field>
        <Field label="Tagline" hint="1 línea · aparece bajo el logo">
          <TextInput value={brand.identity.tagline} onChange={(e) => onPatch({ tagline: e.target.value })} />
        </Field>
        <Field label="Ciudad" hint="Donde opera principalmente">
          <TextInput value={brand.identity.city} onChange={(e) => onPatch({ city: e.target.value })} />
        </Field>
        <Field label="País">
          <TextInput value={brand.identity.country} onChange={(e) => onPatch({ country: e.target.value })} />
        </Field>
        <Field label="Año de inicio" hint="Para el footer: '© 2024 — 2026'">
          <TextInput value={brand.identity.since} onChange={(e) => onPatch({ since: e.target.value })} />
        </Field>
        <div />
        <div className="sm:col-span-2">
          <Field label="Descripción" hint="Aparece en el footer y como descripción larga en redes sociales">
            <TextArea value={brand.identity.description} onChange={(e) => onPatch({ description: e.target.value })} maxLength={500} />
          </Field>
        </div>
      </div>
    </SectionShell>
  );
}

function LogosSection({ brand, onPatch }: { brand: PlatformBrand; onPatch: (p: Partial<PlatformBrand["logos"]>) => void }) {
  const SLOTS: Array<{ key: keyof PlatformBrand["logos"]; label: string; hint: string; aspect: string; mode: "wide" | "square" }> = [
    { key: "logoLight",  label: "Logo principal (claro)",  hint: "Para fondos claros · navbar/footer · 240×60 (4:1)",      aspect: "aspect-[4/1]", mode: "wide" },
    { key: "logoDark",   label: "Logo oscuro",             hint: "Para fondos oscuros · header sticky/dark mode · 240×60", aspect: "aspect-[4/1]", mode: "wide" },
    { key: "logoSquare", label: "Logo cuadrado",           hint: "App icon · 512×512 PNG transparente",                   aspect: "aspect-square", mode: "square" },
    { key: "favicon",    label: "Favicon",                 hint: "Icono de pestaña · 32×32 ICO/PNG",                      aspect: "aspect-square", mode: "square" },
    { key: "ogImage",    label: "Imagen Open Graph",       hint: "Para compartir en WhatsApp/FB · 1200×630",              aspect: "aspect-[1200/630]", mode: "wide" },
  ];
  return (
    <SectionShell title="Logos" description="Variantes del logo para cada contexto. Usá PNG con fondo transparente para mejor calidad.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SLOTS.map((s) => (
          <div key={s.key} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 space-y-2">
            <div>
              <p className="text-xs font-extrabold text-[var(--text-primary)]">{s.label}</p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5 leading-snug">{s.hint}</p>
            </div>
            <ImageUploader
              value={brand.logos[s.key]}
              onChange={(url) => onPatch({ [s.key]: url })}
              folder="platform-brand"
              mode={s.mode}
              aspectClass={s.aspect}
            />
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function ColorsSection({ brand, onPatch }: { brand: PlatformBrand; onPatch: (p: Partial<PlatformBrand["colors"]>) => void }) {
  const SLOTS: Array<{ key: keyof PlatformBrand["colors"]; label: string; hint: string }> = [
    { key: "primary",   label: "Primary",   hint: "Acento de marca · botones principales, links activos" },
    { key: "secondary", label: "Secondary", hint: "Texto principal · header sticky, navbar dark" },
    { key: "accent",    label: "Accent",    hint: "Color de soporte · highlights, badges" },
    { key: "danger",    label: "Danger",    hint: "Errores, destructivo, alertas críticas" },
    { key: "success",   label: "Success",   hint: "Confirmaciones, estados positivos" },
  ];
  return (
    <SectionShell title="Colores" description="Paleta de marca. Cada color se aplica vía CSS variables en todas las páginas.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SLOTS.map((s) => (
          <div key={s.key} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 space-y-2.5">
            <div>
              <p className="text-xs font-extrabold text-[var(--text-primary)]">{s.label}</p>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5 leading-snug">{s.hint}</p>
            </div>
            <div
              className="h-16 rounded-lg border border-[var(--rule-base)]"
              style={{ backgroundColor: brand.colors[s.key] }}
              aria-label={`Preview ${s.label}`}
            />
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brand.colors[s.key]}
                onChange={(e) => onPatch({ [s.key]: e.target.value })}
                className="h-9 w-12 rounded cursor-pointer border border-[var(--rule-base)]"
                aria-label={`${s.label} color picker`}
              />
              <TextInput
                value={brand.colors[s.key]}
                onChange={(e) => onPatch({ [s.key]: e.target.value })}
                className="font-mono text-xs uppercase"
                maxLength={7}
              />
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function TypographySection({ brand, onPatch }: { brand: PlatformBrand; onPatch: (p: Partial<PlatformBrand["typography"]>) => void }) {
  const FONT_OPTIONS = ["geist", "inter", "system", "satoshi", "manrope"];
  const DISPLAY_OPTIONS = ["fraunces", "playfair", "merriweather", "geist"];
  return (
    <SectionShell title="Tipografía" description="Familia para body (UI normal) y display (títulos editoriales).">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Body (sans-serif)" hint="Texto general, formularios, navegación">
          <select
            value={brand.typography.fontFamily}
            onChange={(e) => onPatch({ fontFamily: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold focus:border-[var(--accent)] outline-none"
          >
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Display (serif)" hint="Títulos H1-H2 editoriales tipo magazine">
          <select
            value={brand.typography.fontDisplay}
            onChange={(e) => onPatch({ fontDisplay: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold focus:border-[var(--accent)] outline-none"
          >
            {DISPLAY_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-5 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 space-y-3">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Preview</p>
        <p className="font-display text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
          Pucallpa entera en una app
        </p>
        <p className="text-base text-[var(--text-secondary)]">
          Pedí a tu bodega favorita y recibí en 25 minutos. Pago al recibir, sin tarjeta.
        </p>
      </div>
    </SectionShell>
  );
}

function ContactSection({ brand, onPatch }: { brand: PlatformBrand; onPatch: (p: Partial<PlatformBrand["contact"]>) => void }) {
  return (
    <SectionShell title="Contacto" description="Datos que aparecen en footer, página de soporte y meta-información.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email" hint="Para soporte general">
          <TextInput type="email" value={brand.contact.email} onChange={(e) => onPatch({ email: e.target.value })} placeholder="hola@buleje.com" />
        </Field>
        <Field label="Teléfono">
          <TextInput type="tel" value={brand.contact.phone} onChange={(e) => onPatch({ phone: e.target.value })} placeholder="+51 916 409 675" />
        </Field>
        <Field label="WhatsApp" hint="Soporte chat por WhatsApp">
          <TextInput type="tel" value={brand.contact.whatsapp} onChange={(e) => onPatch({ whatsapp: e.target.value })} placeholder="+51 916 409 675" />
        </Field>
        <Field label="Horarios de soporte">
          <TextInput value={brand.contact.supportHours} onChange={(e) => onPatch({ supportHours: e.target.value })} placeholder="Lun a Sáb · 8:00 a 22:00" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Dirección">
            <TextInput value={brand.contact.address} onChange={(e) => onPatch({ address: e.target.value })} placeholder="Pucallpa, Ucayali — Perú" />
          </Field>
        </div>
      </div>
    </SectionShell>
  );
}

function SocialsSection({ brand, onPatch }: { brand: PlatformBrand; onPatch: (p: Partial<PlatformBrand["socials"]>) => void }) {
  const FIELDS: Array<{ key: keyof PlatformBrand["socials"]; label: string; placeholder: string }> = [
    { key: "instagram", label: "Instagram",  placeholder: "https://instagram.com/buleje" },
    { key: "facebook",  label: "Facebook",   placeholder: "https://facebook.com/buleje" },
    { key: "tiktok",    label: "TikTok",     placeholder: "https://tiktok.com/@buleje" },
    { key: "x",         label: "X / Twitter",placeholder: "https://x.com/buleje" },
    { key: "youtube",   label: "YouTube",    placeholder: "https://youtube.com/@buleje" },
  ];
  return (
    <SectionShell title="Redes sociales" description="Links que aparecen en el footer. Dejá vacío los que no usás.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <TextInput value={brand.socials[f.key]} onChange={(e) => onPatch({ [f.key]: e.target.value })} placeholder={f.placeholder} />
          </Field>
        ))}
      </div>
    </SectionShell>
  );
}

function SeoSection({ brand, onPatch }: { brand: PlatformBrand; onPatch: (p: Partial<PlatformBrand["seo"]>) => void }) {
  return (
    <SectionShell title="SEO & Open Graph" description="Cómo aparece tu sitio en Google y al compartir en WhatsApp/Facebook.">
      <div className="grid grid-cols-1 gap-4">
        <Field label="Meta title" hint="Máximo 70 caracteres · aparece en Google">
          <TextInput value={brand.seo.metaTitle} onChange={(e) => onPatch({ metaTitle: e.target.value })} maxLength={70} />
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1 tabular-nums text-right">{brand.seo.metaTitle.length}/70</p>
        </Field>
        <Field label="Meta description" hint="Máximo 180 caracteres · aparece bajo el título en Google">
          <TextArea value={brand.seo.metaDescription} onChange={(e) => onPatch({ metaDescription: e.target.value })} maxLength={180} />
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1 tabular-nums text-right">{brand.seo.metaDescription.length}/180</p>
        </Field>
        <Field label="Open Graph title" hint="Cuando comparten link en WhatsApp/Facebook">
          <TextInput value={brand.seo.ogTitle} onChange={(e) => onPatch({ ogTitle: e.target.value })} maxLength={80} />
        </Field>
        <Field label="Open Graph description">
          <TextArea value={brand.seo.ogDescription} onChange={(e) => onPatch({ ogDescription: e.target.value })} maxLength={200} />
        </Field>
      </div>

      {/* Preview SERP */}
      <div className="mt-5 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3 inline-flex items-center gap-1.5">
          <Globe className="h-3 w-3" /> Preview Google
        </p>
        <p className="text-xs text-[var(--data-success-700)]">https://buleje.com</p>
        <p className="text-lg text-blue-700 font-medium mt-0.5 hover:underline cursor-pointer">{brand.seo.metaTitle || "(sin título)"}</p>
        <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">{brand.seo.metaDescription || "(sin descripción)"}</p>
      </div>
    </SectionShell>
  );
}

function LegalSection({ brand, onPatch }: { brand: PlatformBrand; onPatch: (p: Partial<PlatformBrand["legal"]>) => void }) {
  return (
    <SectionShell title="Legal" description="Datos legales que aparecen en footer y en facturación electrónica (SUNAT).">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Razón social" hint="Nombre legal completo (con S.A.C., E.I.R.L., etc.)">
          <TextInput value={brand.legal.legalName} onChange={(e) => onPatch({ legalName: e.target.value })} />
        </Field>
        <Field label="RUC" hint="11 dígitos">
          <TextInput value={brand.legal.ruc} onChange={(e) => onPatch({ ruc: e.target.value })} maxLength={11} className="font-mono" />
        </Field>
        <Field label="URL de Términos">
          <TextInput value={brand.legal.termsUrl} onChange={(e) => onPatch({ termsUrl: e.target.value })} placeholder="/terminos" />
        </Field>
        <Field label="URL de Privacidad">
          <TextInput value={brand.legal.privacyUrl} onChange={(e) => onPatch({ privacyUrl: e.target.value })} placeholder="/privacidad" />
        </Field>
        <Field label="URL de Cookies">
          <TextInput value={brand.legal.cookiesUrl} onChange={(e) => onPatch({ cookiesUrl: e.target.value })} placeholder="/cookies" />
        </Field>
      </div>
    </SectionShell>
  );
}

function EventSection({ brand, onPatch }: { brand: PlatformBrand; onPatch: (p: Partial<PlatformBrand["eventMode"]>) => void }) {
  const e = brand.eventMode;
  return (
    <SectionShell
      title="Modo evento"
      description="Override temporal de logo y colores para campañas (Black Friday, Navidad, aniversario). Cuando esté activo y dentro de la ventana de fechas, todas las páginas usarán estos overrides en lugar de la marca normal."
    >
      <div className="rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/5 p-4 mb-5 flex items-center gap-3">
        <button
          onClick={() => onPatch({ active: !e.active })}
          aria-pressed={e.active}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all",
            e.active
              ? "bg-[var(--data-warning-500)] text-white shadow-sm"
              : "bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--data-warning-500)]",
          )}
        >
          {e.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {e.active ? "Modo evento ACTIVO" : "Modo evento desactivado"}
        </button>
        <p className="text-xs text-[var(--text-secondary)] flex-1">
          {e.active
            ? "Los overrides están aplicándose. Las páginas mostrarán logo + colores del evento."
            : "Los overrides se guardan pero no se aplican. Activá para empezar."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Nombre del evento" hint="Ej. 'Black Friday 2026', 'Navidad 2026'">
            <TextInput value={e.name} onChange={(ev) => onPatch({ name: ev.target.value })} placeholder="Black Friday 2026" />
          </Field>
        </div>
        <Field label="Fecha de inicio" hint="Opcional · si vacía, aplica desde 'activo'">
          <TextInput type="datetime-local" value={e.startsAt ? e.startsAt.slice(0, 16) : ""} onChange={(ev) => onPatch({ startsAt: ev.target.value || null })} />
        </Field>
        <Field label="Fecha de fin" hint="Opcional · si vacía, aplica indefinidamente">
          <TextInput type="datetime-local" value={e.endsAt ? e.endsAt.slice(0, 16) : ""} onChange={(ev) => onPatch({ endsAt: ev.target.value || null })} />
        </Field>

        <div>
          <Field label="Logo evento (claro)" hint="Reemplaza temporalmente el logo principal">
            <ImageUploader
              value={e.logoLight}
              onChange={(url) => onPatch({ logoLight: url })}
              folder="platform-brand-event"
              mode="wide"
              aspectClass="aspect-[4/1]"
            />
          </Field>
        </div>
        <div>
          <Field label="Logo evento (oscuro)" hint="Reemplaza el logo dark">
            <ImageUploader
              value={e.logoDark}
              onChange={(url) => onPatch({ logoDark: url })}
              folder="platform-brand-event"
              mode="wide"
              aspectClass="aspect-[4/1]"
            />
          </Field>
        </div>

        <Field label="Color primary del evento" hint="Override del color principal">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={e.primaryColor ?? brand.colors.primary}
              onChange={(ev) => onPatch({ primaryColor: ev.target.value })}
              className="h-9 w-12 rounded cursor-pointer border border-[var(--rule-base)]"
            />
            <TextInput
              value={e.primaryColor ?? ""}
              onChange={(ev) => onPatch({ primaryColor: ev.target.value || null })}
              placeholder={`Hereda: ${brand.colors.primary}`}
              className="font-mono text-xs uppercase"
            />
          </div>
        </Field>
        <Field label="Color accent del evento" hint="Override del color accent">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={e.accentColor ?? brand.colors.accent}
              onChange={(ev) => onPatch({ accentColor: ev.target.value })}
              className="h-9 w-12 rounded cursor-pointer border border-[var(--rule-base)]"
            />
            <TextInput
              value={e.accentColor ?? ""}
              onChange={(ev) => onPatch({ accentColor: ev.target.value || null })}
              placeholder={`Hereda: ${brand.colors.accent}`}
              className="font-mono text-xs uppercase"
            />
          </div>
        </Field>
      </div>
    </SectionShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live preview — mini-tarjeta del footer con los datos actuales
// ─────────────────────────────────────────────────────────────────────────────

function LivePreviewCard({ brand }: { brand: PlatformBrand }) {
  const phone = brand.contact.phone || "—";
  const wa = brand.contact.whatsapp || "—";
  const email = brand.contact.email || "—";
  const address = brand.contact.address || "—";
  const initial = brand.identity.name.charAt(0).toUpperCase() || "B";

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <div className="px-3.5 py-2 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
          Vista previa en vivo
        </p>
        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-tight">
          Cómo se ve en el footer del sitio
        </p>
      </div>
      <div className="p-3.5 space-y-3">
        {/* Brand row */}
        <div className="flex items-center gap-2.5">
          {brand.logos.logoLight ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logos.logoLight}
              alt={`Logo ${brand.identity.name}`}
              className="h-8 w-auto max-w-[100px] object-contain"
            />
          ) : (
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white font-display font-extrabold text-base"
              style={{ backgroundColor: brand.colors.primary }}
            >
              {initial}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
              {brand.identity.name || "Sin nombre"}
            </p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
              {brand.identity.tagline || "Sin tagline"}
            </p>
          </div>
        </div>

        {/* Contact rows */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            <Phone className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
            <span className="font-mono truncate">{phone}</span>
          </div>
          <div className="flex items-center gap-2 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            <MessageCircle className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
            <span className="font-mono truncate">{wa}</span>
          </div>
          <div className="flex items-center gap-2 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            <Mail className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
            <span className="truncate">{email}</span>
          </div>
          <div className="flex items-center gap-2 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
            <span className="truncate">{address}</span>
          </div>
        </div>

        {/* Color swatches */}
        <div className="pt-2 border-t border-[var(--rule-soft)]">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
            Paleta
          </p>
          <div className="flex items-center gap-1">
            {(["primary", "secondary", "accent", "danger", "success"] as const).map((k) => (
              <span
                key={k}
                className="h-6 w-6 rounded border border-[var(--rule-base)]"
                style={{ backgroundColor: brand.colors[k] }}
                title={`${k}: ${brand.colors[k]}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
