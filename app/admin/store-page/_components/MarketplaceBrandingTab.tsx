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

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import {
  Save,
  Loader2,
  ImageIcon,
  Trash2,
  Sparkles,
} from "@buleje/design-system/icons";
import { ErrorAlert, Kicker, LoadingState, SectionTitle, SuccessAlert } from "@buleje/design-system";
import MiniBulejeBanner from "@/components/marketplace/MiniBulejeBanner";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";

interface BrandingState {
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  category: string;
  whatsappPublic: string | null;
}

export default function MarketplaceBrandingTab() {
  const [state, setState] = useState<BrandingState | null>(null);
  const [logoInput, setLogoInput] = useState("");
  const [bannerInput, setBannerInput] = useState("");
  const [whatsappInput, setWhatsappInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const whatsappInputId = useId();

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
        whatsappPublic: myStore.whatsappPublic ?? null,
      });
      setLogoInput(myStore.logo ?? "");
      setBannerInput(myStore.banner ?? "");
      setWhatsappInput(myStore.whatsappPublic ?? "");
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
            whatsappPublic: whatsappInput.trim(),
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch((err) => {
          // body no es JSON valido — caemos al status code generico
           
          console.warn("[branding] error response is not json", err);
          return null;
        });
        throw new Error(body?.error ?? `Error ${res.status}`);
      }
      const updated = await res.json();
      setState((s) =>
        s ? { ...s, logo: updated.logo, banner: updated.banner, whatsappPublic: updated.whatsappPublic } : s,
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
      <LoadingState message={null} className="py-8" />
    );
  }

  if (error && !state) {
    return (
      <ErrorAlert description={error} />
    );
  }

  if (!state) return null;

  const initial = state.name.trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Un título por vista (pasada de diseño 10-10): era AdminTabShell, una
          segunda banda de módulo dentro de «Tienda online». */}
      <div className="flex items-center gap-2">
        <SectionTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[var(--accent)]" aria-hidden />
          Marca en el marketplace
        </SectionTitle>
        <InfoTip
          title="Marca en el marketplace"
          what={<span>Personaliza cómo se ve «{state.name}» en el directorio público.</span>}
          affects={<span>Si no subes nada, mostramos el banner de Buleje con la inicial de tu tienda.</span>}
        />
      </div>
      {/* Preview lado a lado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          placeholder="https://ejemplo.com/banner.jpg"
          value={bannerInput}
          onChange={setBannerInput}
          onClear={() => setBannerInput("")}
        />
        <UrlField
          label="URL del logo"
          hint="Recomendado: cuadrado 400 × 400 px, fondo transparente o sólido."
          placeholder="https://ejemplo.com/logo.png"
          value={logoInput}
          onChange={setLogoInput}
          onClear={() => setLogoInput("")}
        />

        {/* WhatsApp público — muestra un botón flotante en el storefront mobile
            para que los clientes te escriban directo. Audit #6 (Brandon). */}
        <div>
          <label htmlFor={whatsappInputId} className="mr-1.5 text-sm font-semibold text-[var(--text-primary)]">
            WhatsApp de contacto (opcional)
          </label>
          <InfoTip
            title="WhatsApp de contacto"
            what={<span>Si lo cargas, los clientes ven un botón de WhatsApp en tu tienda desde el celular.</span>}
            example={<span>999 888 777</span>}
          />
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id={whatsappInputId}
              type="tel"
              inputMode="tel"
              value={whatsappInput}
              onChange={(e) => setWhatsappInput(e.target.value)}
              placeholder="999 888 777"
              className="flex-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 h-12 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
            {whatsappInput && (
              <button
                type="button"
                onClick={() => setWhatsappInput("")}
                aria-label="Limpiar"
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Errors / saved feedback */}
      {error && <ErrorAlert description={error} />}
      {savedAt && !error && (
        <SuccessAlert description="Marca guardada · cambios visibles en el marketplace en unos segundos." />
      )}

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            setLogoInput(state.logo ?? "");
            setBannerInput(state.banner ?? "");
            setWhatsappInput(state.whatsappPublic ?? "");
          }}
          className={button({ variant: "ghost", className: "rounded-xl" })}
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={button({ variant: "primary", className: "rounded-xl" })}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Guardar marca
        </button>
      </div>
    </div>
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
      <div className="flex items-center gap-1.5">
        <Kicker className="libro-kicker inline-flex items-center gap-1.5">
          <ImageIcon className="h-3 w-3" aria-hidden />
          {label}
        </Kicker>
        <InfoTip title={label} what={<span>{subLabel}</span>} />
      </div>
      {children}
    </div>
  );
}

function UrlField({
  label,
  hint,
  placeholder,
  value,
  onChange,
  onClear,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const inputId = useId();
  return (
    <div>
      <label htmlFor={inputId} className="mr-1.5 text-sm font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      <InfoTip title={label} what={<span>{hint}</span>} />
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={inputId}
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 h-12 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        />
        {value && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Limpiar"
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
