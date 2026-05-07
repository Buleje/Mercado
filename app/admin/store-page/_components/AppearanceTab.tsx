"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useEffect, useState } from "react";
import { Loader2, Save, Eye, EyeOff, Palette } from "@buleje/design-system/icons";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";

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
        headers: { "Content-Type": "application/json" },
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

      {/* Hero */}
      <Card title="Hero (banner principal)">
        <Field label="Título">
          <input
            type="text"
            maxLength={200}
            value={data.heroTitle ?? ""}
            onChange={(e) => update("heroTitle", e.target.value)}
            placeholder="Ej: Bienvenido a Buleje"
            className="input"
          />
        </Field>
        <Field label="Subtítulo">
          <input
            type="text"
            maxLength={400}
            value={data.heroSubtitle ?? ""}
            onChange={(e) => update("heroSubtitle", e.target.value)}
            placeholder="Delivery gratis en Pucallpa"
            className="input"
          />
        </Field>
        <Field label="Imagen de fondo (URL)">
          <input
            type="url"
            value={data.heroImageUrl ?? ""}
            onChange={(e) => update("heroImageUrl", e.target.value)}
            placeholder="https://..."
            className="input"
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Texto del botón">
            <input
              type="text"
              maxLength={80}
              value={data.heroCtaLabel ?? ""}
              onChange={(e) => update("heroCtaLabel", e.target.value)}
              placeholder="Ver catálogo"
              className="input"
            />
          </Field>
          <Field label="URL del botón">
            <input
              type="url"
              value={data.heroCtaUrl ?? ""}
              onChange={(e) => update("heroCtaUrl", e.target.value)}
              placeholder="/tienda"
              className="input"
            />
          </Field>
        </div>
      </Card>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
