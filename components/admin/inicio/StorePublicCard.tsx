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
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { CardTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system";
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

  // Una fila al pie del Resumen (11-10): antes iba arriba de todo con 132 px.
  // Botones de 48 px; «Ver tienda» en el primario del panel (el turquesa con
  // texto blanco da 3,2:1).
  return (
    <section className="flex flex-wrap items-center gap-3 border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 sm:px-5">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <Store className="h-5 w-5" strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <CardTitle className="text-sm font-bold">Tu tienda pública</CardTitle>
        <p className="truncate text-sm text-[var(--text-secondary)]">{prettyUrl}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={storePath} target="_blank" rel="noopener noreferrer" className={button({ variant: "primary", className: "rounded-xl gap-2" })}>
          <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
          Ver tienda
        </Link>
        <button type="button" onClick={copyLink} className={button({ variant: "secondary", className: "rounded-xl gap-2" })}>
          {copied ? (
            <Check className="h-4 w-4 text-[var(--data-success-600)]" strokeWidth={2.5} aria-hidden />
          ) : (
            <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden />
          )}
          {copied ? "¡Copiado!" : "Compartir"}
        </button>
        <EnlacePanel apariencia="heredada" href="/admin?tab=store-customizer" className={button({ variant: "secondary", className: "rounded-xl gap-2 hover:no-underline" })}>
          <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
          Editar portada
        </EnlacePanel>
      </div>
    </section>
  );
}
