"use client";

/**
 * StorePublicCard — tarjeta "Tu tienda pública" en el Inicio del panel admin.
 *
 * Brandon 2026-06-07 (idea #2): puente admin ↔ tienda. El dueño ve su storefront
 * público + acciones rápidas: ver, compartir (copiar link) y editar la portada.
 * Aislada: usa el slug del tenant para construir la URL del storefront.
 */

import { useState } from "react";
import Link from "next/link";
import { CardTitle } from "@buleje/design-system";
import { Store, ExternalLink, Share2, Pencil, Check } from "@buleje/design-system/icons";

export default function StorePublicCard({ storeSlug }: { storeSlug: string }) {
  const [copied, setCopied] = useState(false);
  const storePath = `/t/${storeSlug}/tienda`;
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}${storePath}` : storePath;
  const prettyUrl = shareUrl.replace(/^https?:\/\//, "");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard bloqueado — no-op */
    }
  };

  return (
    <section className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Store className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle>Tu tienda pública</CardTitle>
          <p className="mt-0.5 truncate text-sm text-[var(--text-secondary)]">{prettyUrl}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={storePath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
              Ver tienda
            </Link>

            <button
              type="button"
              onClick={copyLink}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              {copied ? (
                <Check className="h-4 w-4 text-[var(--data-success-600)]" strokeWidth={2.5} aria-hidden />
              ) : (
                <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              )}
              {copied ? "¡Copiado!" : "Compartir"}
            </button>

            <Link
              href="/admin?tab=store-customizer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
              Editar portada
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
