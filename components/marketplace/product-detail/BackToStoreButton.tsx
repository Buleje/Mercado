"use client";

/**
 * BackToStoreButton — Botón "Volver" prominente y limpio, reemplaza
 * los breadcrumbs largos en la PDP. Usa router.back() si hay history,
 * fallback al storefront de la tienda.
 */

import { useRouter } from "next/navigation";
import { ArrowLeft } from "@buleje/design-system/icons";
import { useCallback } from "react";

interface BackToStoreButtonProps {
  storeSlug: string;
  storeName: string;
}

export default function BackToStoreButton({ storeSlug, storeName }: BackToStoreButtonProps) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(`/marketplace/${storeSlug}`);
    }
  }, [router, storeSlug]);

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-2.5 px-5 h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 active:scale-[0.98] transition-all shadow-sm hover:shadow-md"
      aria-label={`Volver a ${storeName}`}
    >
      <ArrowLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden />
      <span>Volver a {storeName}</span>
    </button>
  );
}
