"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useEffect, useState } from "react";
import {
  Loader2, Save, Eye, EyeOff, Palette, Sparkles,
  Smartphone, Monitor, ArrowUpRight, Image as ImageIcon,
  Lightbulb, Type,
} from "@buleje/design-system/icons";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";
import { csrfHeaders } from "@/lib/csrf-client";

type Customization = {
  published: boolean;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  heroCtaLabel: string | null;
  heroCtaUrl: string | null;
  primaryColor: string;
  accentColor: string;
  aboutTitle: string | null;
  aboutBody: string | null;
  whatsappPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  footerHtml: string | null;
};

const EMPTY: Customization = {
  published: true,
  heroTitle: "",
  heroSubtitle: "",
  heroImageUrl: "",
  heroCtaLabel: "",
  heroCtaUrl: "",
  primaryColor: "#2563EB",
  accentColor: "#f4a261",
  aboutTitle: "",
  aboutBody: "",
  whatsappPhone: "",
  contactEmail: "",
  address: "",
  metaTitle: "",
  metaDescription: "",
  ogImageUrl: "",
  footerHtml: "",
};

export default function AppearanceTab() {
  const [data, setData] = useState<Customization>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/store-page/customization");
      if (res.ok) {
        const json = (await res.json()) as Customization;
        setData({
          ...json,
          heroTitle: json.heroTitle ?? "",
          heroSubtitle: json.heroSubtitle ?? "",
          heroImageUrl: json.heroImageUrl ?? "",
          heroCtaLabel: json.heroCtaLabel ?? "",
          heroCtaUrl: json.heroCtaUrl ?? "",
          aboutTitle: json.aboutTitle ?? "",
          aboutBody: json.aboutBody ?? "",
          whatsappPhone: json.whatsappPhone ?? "",
          contactEmail: json.contactEmail ?? "",
          address: json.address ?? "",
          metaTitle: json.metaTitle ?? "",
          metaDescription: json.metaDescription ?? "",
          ogImageUrl: json.ogImageUrl ?? "",
          footerHtml: json.footerHtml ?? "",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...data };
      // Convert empty strings back to null for nullable fields
      const nullable = [
        "heroTitle",
        "heroSubtitle",
        "heroImageUrl",
        "heroCtaLabel",
        "heroCtaUrl",
        "aboutTitle",
        "aboutBody",
        "whatsappPhone",
        "contactEmail",
        "address",
        "metaTitle",
        "metaDescription",
        "ogImageUrl",
        "footerHtml",
      ];
      for (const k of nullable) {
        if (payload[k] === "") payload[k] = null;
      }
      const res = await fetch("/api/store-page/customization", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(
          typeof j.error === "string" ? j.error : "Error al guardar",
        );
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof Customization>(key: K, value: Customization[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  if (loading) {
    return (
      <LoadingState />
    );
  }

  return (
    <AdminTabShell
      title="Apariencia"
      description="Personaliza colores, hero, datos de contacto y SEO de tu página individual."
      icon={Palette}
    >
      {/* Published toggle */}
      <section className="flex items-center justify-between p-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            {data.published ? (
              <Eye className="w-4 h-4 text-[var(--data-success-500)]" />
            ) : (
              <EyeOff className="w-4 h-4 text-[var(--text-secondary)]" />
            )}
            Estado de la página
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {data.published
              ? "Tu página es visible al público en /t/[tu-slug]"
              : "Tu página está oculta y devuelve 404"}
          </p>
        </div>
        <button
          onClick={() => update("published", !data.published)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            data.published ? "bg-[var(--accent-soft)]" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              data.published ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </section>

      {/* ═══════════════ HERO v2 — con preview en vivo + plantillas ═══════════════ */}
      <HeroEditor data={data} update={update} />


      {/* Colors */}
      <Card title="Colores del tema">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Color primario">
            <div className="flex gap-2">
              <input
                type="color"
                value={data.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                className="h-11 w-16 rounded-lg border border-[var(--rule-base)] cursor-pointer"
              />
              <input
                type="text"
                value={data.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                className="input flex-1 font-mono text-sm"
              />
            </div>
          </Field>
          <Field label="Color de acento">
            <div className="flex gap-2">
              <input
                type="color"
                value={data.accentColor}
                onChange={(e) => update("accentColor", e.target.value)}
                className="h-11 w-16 rounded-lg border border-[var(--rule-base)] cursor-pointer"
              />
              <input
                type="text"
                value={data.accentColor}
                onChange={(e) => update("accentColor", e.target.value)}
                className="input flex-1 font-mono text-sm"
              />
            </div>
          </Field>
        </div>
      </Card>

      {/* About */}
      <Card title="Acerca de mi tienda">
        <Field label="Título">
          <input
            type="text"
            maxLength={200}
            value={data.aboutTitle ?? ""}
            onChange={(e) => update("aboutTitle", e.target.value)}
            placeholder="Nuestra historia"
            className="input"
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={5}
            maxLength={4000}
            value={data.aboutBody ?? ""}
            onChange={(e) => update("aboutBody", e.target.value)}
            placeholder="Contale a tus clientes quién sos…"
            className="input resize-y"
          />
        </Field>
      </Card>

      {/* Contact */}
      <Card title="Contacto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="WhatsApp">
            <input
              type="tel"
              value={data.whatsappPhone ?? ""}
              onChange={(e) => update("whatsappPhone", e.target.value)}
              placeholder="+51 999 999 999"
              className="input"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={data.contactEmail ?? ""}
              onChange={(e) => update("contactEmail", e.target.value)}
              placeholder="hola@buleje.pe"
              className="input"
            />
          </Field>
        </div>
        <Field label="Dirección">
          <input
            type="text"
            value={data.address ?? ""}
            onChange={(e) => update("address", e.target.value)}
            placeholder="Jr. Los Olivos 123, Pucallpa"
            className="input"
          />
        </Field>
      </Card>

      {/* SEO */}
      <Card title="SEO (buscadores)">
        <Field label="Meta título">
          <input
            type="text"
            maxLength={200}
            value={data.metaTitle ?? ""}
            onChange={(e) => update("metaTitle", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Meta descripción">
          <textarea
            rows={3}
            maxLength={400}
            value={data.metaDescription ?? ""}
            onChange={(e) => update("metaDescription", e.target.value)}
            className="input resize-y"
          />
        </Field>
        <Field label="Open Graph image URL">
          <input
            type="url"
            value={data.ogImageUrl ?? ""}
            onChange={(e) => update("ogImageUrl", e.target.value)}
            className="input"
          />
        </Field>
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-4 flex items-center justify-end gap-3 p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)]">
        {error && <span className="text-sm text-[var(--data-error-500)]">{error}</span>}
        {saved && (
          <span className="text-sm text-[var(--data-success-500)] font-semibold">
            Guardado
          </span>
        )}
        <button
          onClick={save}
          disabled={saving}
          className={ADMIN_TOKENS.btnPrimary}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Save className="w-4 h-4" aria-hidden />
          )}
          Guardar cambios
        </button>
      </div>

      <style jsx>{`
        .input {
          display: block;
          width: 100%;
          padding: 0.625rem 0.875rem;
          border-radius: 0.625rem;
          border: 1px solid rgb(209 213 219);
          background: white;
          color: rgb(17 24 39);
          font-size: 0.875rem;
        }
        .input:focus {
          outline: 2px solid transparent;
          outline-offset: 2px;
          border-color: rgb(20 184 166);
          box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.15);
        }
        :global(.dark) .input {
          background: rgb(17 24 39);
          color: rgb(229 231 235);
          border-color: rgb(55 65 81);
        }
      `}</style>
    </AdminTabShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="p-5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] space-y-4">
      <CardTitle className="font-bold text-lg">{title}</CardTitle>
      {children}
    </section>
  );
}

function Field({ label, children, hint, count, max }: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  count?: number;
  max?: number;
}) {
  const over = max != null && count != null && count > max * 0.9;
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="block text-xs font-bold text-[var(--text-primary)]">
          {label}
        </span>
        {max != null && count != null && (
          <span className={`text-[10px] font-bold tabular-nums ${over ? "text-[var(--data-warning-600,#d97706)]" : "text-[var(--text-tertiary)]"}`}>
            {count}/{max}
          </span>
        )}
      </div>
      {children}
      {hint && (
        <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)] leading-snug">
          {hint}
        </p>
      )}
    </label>
  );
}

// ═══════════════ HeroEditor — preview en vivo + plantillas ═══════════════

const HERO_TEMPLATES: Array<{
  id: string;
  label: string;
  emoji: string;
  description: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
}> = [
  {
    id: "bodega",
    label: "Bodega del barrio",
    emoji: "🛒",
    description: "Tono cercano, foco en delivery rápido",
    title: "Tu bodega del barrio · ahora a domicilio",
    subtitle: "Pedí lo que necesitas y te lo llevamos en menos de 30 minutos. Pagás con Yape o efectivo al recibir.",
    ctaLabel: "Ver catálogo",
    ctaUrl: "/tienda",
  },
  {
    id: "restaurante",
    label: "Restaurante",
    emoji: "🍽️",
    description: "Foco en menú del día y combos",
    title: "Comida casera, directo a tu mesa",
    subtitle: "Menú del día, combos familiares y entregas calientes. Pedí por WhatsApp o por la app.",
    ctaLabel: "Ver menú",
    ctaUrl: "/tienda",
  },
  {
    id: "premium",
    label: "Tienda premium",
    emoji: "✨",
    description: "Tono editorial, productos seleccionados",
    title: "Productos seleccionados para tu casa",
    subtitle: "Selección curada de marcas locales y nacionales. Calidad garantizada, delivery cuidado.",
    ctaLabel: "Explorar tienda",
    ctaUrl: "/tienda",
  },
];

function HeroEditor({
  data,
  update,
}: {
  data: Customization;
  update: <K extends keyof Customization>(key: K, value: Customization[K]) => void;
}) {
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [showTemplates, setShowTemplates] = useState(false);

  const applyTemplate = (tpl: typeof HERO_TEMPLATES[number]) => {
    update("heroTitle", tpl.title);
    update("heroSubtitle", tpl.subtitle);
    update("heroCtaLabel", tpl.ctaLabel);
    update("heroCtaUrl", tpl.ctaUrl);
    setShowTemplates(false);
  };

  const title = (data.heroTitle ?? "").trim();
  const subtitle = (data.heroSubtitle ?? "").trim();
  const ctaLabel = (data.heroCtaLabel ?? "").trim();
  const imageUrl = (data.heroImageUrl ?? "").trim();
  const titleCount = title.length;
  const subtitleCount = subtitle.length;

  // Completeness gauge — 0..100
  const completeness = (() => {
    let score = 0;
    if (title) score += 35;
    if (subtitle) score += 25;
    if (ctaLabel) score += 20;
    if (imageUrl) score += 20;
    return score;
  })();

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      {/* Header de la card */}
      <header className="px-5 py-4 border-b border-[var(--rule-soft)] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
            <Type className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-black text-[var(--text-primary)] tracking-tight leading-tight">
              Hero · lo primero que ve el cliente
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-snug">
              Título grande, subtítulo claro, botón directo. Editás → ves el cambio al toque a la derecha.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowTemplates((s) => !s)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] text-white px-3.5 h-9 text-xs font-black hover:bg-[var(--accent)]/90 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
          {showTemplates ? "Ocultar plantillas" : "Usar plantilla"}
        </button>
      </header>

      {/* Plantillas — desplegable */}
      {showTemplates && (
        <div className="px-5 py-4 bg-[var(--surface-sunken)]/40 border-b border-[var(--rule-soft)]">
          <p className="text-[11px] font-black uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Elegí una plantilla · sobrescribe título, subtítulo y botón
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {HERO_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="group text-left rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5 hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span aria-hidden className="text-lg">{tpl.emoji}</span>
                  <span className="text-sm font-black text-[var(--text-primary)]">{tpl.label}</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                  {tpl.description}
                </p>
                <p className="mt-2 text-[10px] font-bold text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity">
                  Aplicar →
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body: form izquierda + preview derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--rule-soft)]">
        {/* ── Form ── */}
        <div className="p-5 space-y-4">
          {/* Completeness bar */}
          <div className="rounded-lg bg-[var(--surface-sunken)]/60 border border-[var(--rule-soft)] px-3.5 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text-tertiary)]">
                Completitud del hero
              </span>
              <span className="text-xs font-black tabular-nums text-[var(--text-primary)]">
                {completeness}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--rule-soft)] overflow-hidden">
              <div
                className="h-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${completeness}%` }}
              />
            </div>
            {completeness < 100 && (
              <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">
                <Lightbulb className="h-3 w-3 text-[var(--data-warning-500)]" strokeWidth={2} aria-hidden />
                {!title ? "Empezá con un título" :
                  !subtitle ? "Agregá un subtítulo claro" :
                    !ctaLabel ? "Configurá el botón principal" :
                      !imageUrl ? "Subí una imagen de fondo" : "Casi listo"}
              </p>
            )}
          </div>

          <Field
            label="Título principal"
            count={titleCount}
            max={60}
            hint="Sé directo. Máx 8 palabras. Ej: 'Tu bodega del barrio, ahora a domicilio'"
          >
            <input
              type="text"
              maxLength={60}
              value={data.heroTitle ?? ""}
              onChange={(e) => update("heroTitle", e.target.value)}
              placeholder="Tu bodega del barrio · ahora a domicilio"
              className="input"
            />
          </Field>

          <Field
            label="Subtítulo"
            count={subtitleCount}
            max={140}
            hint="Una frase que explique qué hacés y por qué importa. Tip: incluí delivery o pago."
          >
            <textarea
              rows={2}
              maxLength={140}
              value={data.heroSubtitle ?? ""}
              onChange={(e) => update("heroSubtitle", e.target.value)}
              placeholder="Pedís y te lo llevamos en menos de 30 min. Yape o efectivo al recibir."
              className="input resize-none"
            />
          </Field>

          <Field
            label="Imagen de fondo (URL)"
            hint="Recomendado: 1600x900px, .jpg comprimido. Subí a Imgur, Vercel Blob o S3 y pegá el link."
          >
            <div className="flex gap-2">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] shrink-0">
                <ImageIcon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <input
                type="url"
                value={data.heroImageUrl ?? ""}
                onChange={(e) => update("heroImageUrl", e.target.value)}
                placeholder="https://imgur.com/abc123.jpg"
                className="input flex-1"
              />
            </div>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Texto del botón"
              count={(ctaLabel || "").length}
              max={24}
              hint="Verbo + acción. Ej: 'Ver catálogo', 'Pedir ahora'"
            >
              <input
                type="text"
                maxLength={24}
                value={data.heroCtaLabel ?? ""}
                onChange={(e) => update("heroCtaLabel", e.target.value)}
                placeholder="Ver catálogo"
                className="input"
              />
            </Field>
            <Field
              label="Destino del botón"
              hint="Una ruta interna o un link completo"
            >
              <input
                type="text"
                value={data.heroCtaUrl ?? ""}
                onChange={(e) => update("heroCtaUrl", e.target.value)}
                placeholder="/tienda"
                className="input"
              />
            </Field>
          </div>
        </div>

        {/* ── Preview en vivo ── */}
        <div className="p-5 bg-[var(--surface-sunken)]/30 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-black uppercase tracking-wider text-[var(--text-tertiary)]">
              Vista previa en vivo
            </p>
            <div role="group" aria-label="Modo de vista previa" className="inline-flex items-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] p-0.5">
              <button
                type="button"
                onClick={() => setPreviewMode("desktop")}
                aria-pressed={previewMode === "desktop"}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-[11px] font-bold transition-colors ${previewMode === "desktop" ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]" : "text-[var(--text-secondary)]"}`}
              >
                <Monitor className="h-3 w-3" strokeWidth={2} />
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("mobile")}
                aria-pressed={previewMode === "mobile"}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-[11px] font-bold transition-colors ${previewMode === "mobile" ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]" : "text-[var(--text-secondary)]"}`}
              >
                <Smartphone className="h-3 w-3" strokeWidth={2} />
                Mobile
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center">
            {previewMode === "desktop" ? (
              <HeroPreviewDesktop
                title={title}
                subtitle={subtitle}
                imageUrl={imageUrl}
                ctaLabel={ctaLabel}
                primaryColor={data.primaryColor}
                accentColor={data.accentColor}
              />
            ) : (
              <HeroPreviewMobile
                title={title}
                subtitle={subtitle}
                imageUrl={imageUrl}
                ctaLabel={ctaLabel}
                primaryColor={data.primaryColor}
                accentColor={data.accentColor}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// Preview desktop — proporciones ~16:9
function HeroPreviewDesktop({ title, subtitle, imageUrl, ctaLabel, primaryColor, accentColor }: {
  title: string; subtitle: string; imageUrl: string; ctaLabel: string;
  primaryColor: string; accentColor: string;
}) {
  return (
    <div className="w-full max-w-md aspect-[16/9] rounded-xl overflow-hidden border-2 border-[var(--rule-base)] shadow-lg relative">
      {/* Background: imagen o gradient con primaryColor */}
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background: imageUrl
            ? `linear-gradient(135deg, ${primaryColor}99 0%, ${accentColor}66 100%)`
            : `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)`,
        }}
      />
      <div className="absolute inset-0 flex flex-col justify-center px-5 py-4">
        <p className="text-white text-[15px] font-black leading-tight tracking-tight drop-shadow-md line-clamp-2">
          {title || "Tu título aparece aquí"}
        </p>
        <p className="mt-1.5 text-white/85 text-[10px] leading-snug drop-shadow-md line-clamp-2">
          {subtitle || "Y debajo, una frase corta que explique qué hacés."}
        </p>
        {ctaLabel && (
          <span
            className="mt-2.5 inline-flex items-center gap-1 self-start rounded-full bg-white px-3 h-6 text-[10px] font-black"
            style={{ color: primaryColor }}
          >
            {ctaLabel}
            <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
        )}
      </div>
    </div>
  );
}

// Preview mobile — proporciones de celular
function HeroPreviewMobile({ title, subtitle, imageUrl, ctaLabel, primaryColor, accentColor }: {
  title: string; subtitle: string; imageUrl: string; ctaLabel: string;
  primaryColor: string; accentColor: string;
}) {
  return (
    <div className="w-[200px] aspect-[9/16] rounded-2xl overflow-hidden border-[8px] border-[var(--text-primary)] shadow-lg relative bg-black">
      {/* Status bar mock */}
      <div className="absolute top-0 inset-x-0 h-4 bg-black flex items-center justify-center text-[7px] font-bold text-white z-10">
        9:41
      </div>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background: imageUrl
            ? `linear-gradient(180deg, ${primaryColor}99 0%, ${accentColor}aa 100%)`
            : `linear-gradient(180deg, ${primaryColor} 0%, ${accentColor} 100%)`,
        }}
      />
      <div className="absolute inset-x-0 bottom-0 top-4 flex flex-col justify-end px-4 pb-5">
        <p className="text-white text-[13px] font-black leading-tight tracking-tight drop-shadow-md line-clamp-3">
          {title || "Tu título"}
        </p>
        <p className="mt-1.5 text-white/85 text-[9px] leading-snug drop-shadow-md line-clamp-3">
          {subtitle || "Subtítulo de muestra para ver cómo queda."}
        </p>
        {ctaLabel && (
          <span
            className="mt-2.5 inline-flex items-center justify-center gap-1 rounded-full bg-white py-1.5 text-[10px] font-black self-stretch"
            style={{ color: primaryColor }}
          >
            {ctaLabel}
            <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={2.5} />
          </span>
        )}
      </div>
    </div>
  );
}
