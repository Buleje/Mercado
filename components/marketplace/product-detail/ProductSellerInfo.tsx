"use client";

/**
 * ProductSellerInfo — Card minimalista del vendedor para la COLUMNA del carrito
 * (Brandon 2026-06-14: estilo MercadoLibre, neutro, sin banner/colores neón,
 * poco redondeo). Logo + nombre + verificado + rating + "Ir a la tienda".
 */

import Link from "next/link";
import { Star, CheckCircle2, ChevronRight } from "@buleje/design-system/icons";
import { StoreAvatar } from "@/components/marketplace/StoreAvatar";

export interface ProductSellerInfoProps {
  storeName: string;
  storeSlug: string;
  storeLogo?: string | null;
  storeDescription?: string | null;
  storeZone?: string | null;
  storeRating?: number;
  storeKm?: string | null;
}

export function ProductSellerInfo({
  storeName,
  storeSlug,
  storeLogo,
  storeZone,
  storeRating = 4.8,
  storeKm,
}: ProductSellerInfoProps) {
  return (
    <section
      aria-label={`Vendido por ${storeName}`}
      className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mb-2">Vendido por</p>

      <div className="flex items-center gap-3">
        <StoreAvatar name={storeName} logo={storeLogo} size={40} rounded="rounded-lg" />
        <div className="min-w-0">
          <h3 className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)] truncate leading-tight">
            {storeName}
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-label="verificada" />
          </h3>
          <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" strokeWidth={0} aria-hidden />
            <span className="font-semibold text-[var(--text-primary)] tabular-nums">{storeRating.toFixed(1)}</span>
            <span className="text-[var(--text-tertiary)]">· Responde &lt;5 min</span>
          </p>
        </div>
      </div>

      {storeZone && (
        <p className="mt-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          {storeZone}{storeKm && ` · ${storeKm}`}
        </p>
      )}

      <Link
        href={`/marketplace/${storeSlug}`}
        className="mt-3 flex items-center justify-center gap-1 rounded-sm border border-[var(--rule-base)] py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--surface-sunken)] transition-colors"
      >
        Ir a la tienda
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
