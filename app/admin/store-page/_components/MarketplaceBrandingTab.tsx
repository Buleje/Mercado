"use client";

/**
 * MarketplaceBrandingTab — UI admin para subir logo + banner de la tienda
 * en el marketplace público (/marketplace/[slug] + /tiendas).
 *
 * Esta versión acepta URLs públicas (Imgur, Vercel Blob, S3, etc.).
 * Cuando se integre Vercel Blob native uploader, se reemplaza el input
 * por <input type="file"> con flow API-side.
 *
 * Persiste en Store.logo / Store.banner via PATCH al endpoint
 * /api/marketplace/stores/[slug]/branding.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Save,
  Loader2,
  ImageIcon,
  Trash2,
  Sparkles,
} from "@buleje/design-system/icons";
import MiniBulejeBanner from "@/components/marketplace/MiniBulejeBanner";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";

interface BrandingState {
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  category: string;
}

export default function MarketplaceBrandingTab() {
  const [state, setState] = useState<BrandingState | null>(null);
  const [logoInput, setLogoInput] = useState("");
  const [bannerInput, setBannerInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stores?limit=50");
      if (!res.ok) throw new Error("No se pudo cargar la tienda");
      const json = await res.json();
      // tomamos la primera tienda del tenant (admin solo ve la suya en este endpoint)
      const myStore = (json.data ?? [])[0];
      if (!myStore) throw new Error("Tu tienda aun no esta publicada");
      setState({
        slug: myStore.slug,
        name: myStore.name,
        logo: myStore.logo ?? null,
        banner: myStore.banner ?? null,
        category: myStore.category ?? "bodega",
      });
      setLogoInput(myStore.logo ?? "");
      setBannerInput(myStore.banner ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!state) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/marketplace/stores/${state.slug}/branding`,
        {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            logo: logoInput.trim(),
            banner: bannerInput.trim(),
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch((err) => {
          // body no es JSON valido — caemos al status code generico
          // eslint-disable-next-line no-console
          console.warn("[branding] error response is not json", err);
          return null;
        });
        throw new Error(body?.error ?? `Error ${res.status}`);
      }
      const updated = await res.json();
      setState((s) =>
        s ? { ...s, logo: updated.logo, banner: updated.banner } : s,
      );
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-8 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Cargando branding…
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20 p-6 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
        {error}
      </div>
    );
  }

  if (!state) return null;

  const initial = state.name.trim().charAt(0).toUpperCase();

  return (
    <AdminTabShell
      title="Branding del Marketplace"
      description={`Personaliza cómo se ve "${state.name}" en el directorio público. Si no subes nada, mostramos el banner default de Buleje con la inicial de tu tienda.`}
      icon={Sparkles}
    >
      {/* Preview lado a lado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PreviewCard label="Banner de la tienda" subLabel="Aparece arriba del catálogo y en cards del directorio">
          <div className="relative aspect-[16/9] rounded-lg overflow-hidden border border-[var(--rule-soft)]">
            {bannerInput ? (
              <Image
                src={bannerInput}
                alt="Preview banner"
                fill
                sizes="(max-width:768px) 100vw, 400px"
                className="object-cover"
                onError={() => setBannerInput("")}
              />
            ) : (
              <MiniBulejeBanner storeName={state.name} category={state.category} />
            )}
          </div>
        </PreviewCard>

        <PreviewCard label="Logo de la tienda" subLabel="Avatar circular en hero + cards">
          <div className="relative aspect-[16/9] rounded-lg overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)] flex items-center justify-center">
            <div className="h-24 w-24 rounded-2xl overflow-hidden bg-[var(--surface-raised)] border-4 border-[var(--surface-canvas)] shadow-md flex items-center justify-center">
              {logoInput ? (
                <Image
                  src={logoInput}
                  alt="Preview logo"
                  width={96}
                  height={96}
                  className="object-cover w-full h-full"
                  onError={() => setLogoInput("")}
                />
              ) : (
                <span className="text-3xl font-black text-white bg-linear-to-br from-[var(--accent)] to-[var(--accent)]/70 h-full w-full flex items-center justify-center">
                  {initial}
                </span>
              )}
            </div>
          </div>
        </PreviewCard>
      </div>

      {/* Inputs */}
      <div className={`${ADMIN_TOKENS.cardPadded}`}>
        <UrlField
          label="URL del banner"
          hint="Tamaño recomendado: 1600 × 600 px. Formatos JPG, PNG, WebP."
          value={bannerInput}
          onChange={setBannerInput}
          onClear={() => setBannerInput("")}
        />
        <UrlField
          label="URL del logo"
          hint="Recomendado: cuadrado 400 × 400 px, fondo transparente o sólido."
          value={logoInput}
          onChange={setLogoInput}
          onClear={() => setLogoInput("")}
        />
      </div>

      {/* Errors / saved feedback */}
      {error && <div className={ADMIN_TOKENS.errorBanner}>{error}</div>}
      {savedAt && !error && (
        <div className={ADMIN_TOKENS.successBanner}>
          Branding guardado · cambios visibles en el marketplace en unos segundos.
        </div>
      )}

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setLogoInput(state.logo ?? "");
            setBannerInput(state.banner ?? "");
          }}
          className={ADMIN_TOKENS.btnGhost}
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={ADMIN_TOKENS.btnPrimary}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Guardar branding
        </button>
      </div>
    </AdminTabShell>
  );
}

function PreviewCard({
  label,
  subLabel,
  children,
}: {
  label: string;
  subLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 flex flex-col gap-3">
      <div>
        <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          <ImageIcon className="h-3 w-3" aria-hidden />
          {label}
        </p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{subLabel}</p>
      </div>
      {children}
    </div>
  );
}

function UrlField({
  label,
  hint,
  value,
  onChange,
  onClear,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5 mb-1.5">{hint}</p>
      <div className="flex items-center gap-2">
        <input
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://ejemplo.com/banner.jpg"
          className="flex-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Limpiar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
