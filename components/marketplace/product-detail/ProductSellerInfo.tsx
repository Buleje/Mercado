"use client";

/**
 * ProductSellerInfo — Card editorial con info de la bodega vendedora.
 * Ilustración BodegaAbriendo + nombre + rating + tiempo respuesta + CTA.
 */

import Link from "next/link";
import { Star, Clock, MapPin, ArrowRight } from "@buleje/design-system/icons";
import { Kicker, SectionTitle, BodyText, Caption } from "@buleje/design-system";
import { BodegaAbriendo } from "@/components/ui-system/illustrations/contextual";

export interface ProductSellerInfoProps {
  storeName: string;
  storeSlug: string;
  storeDescription?: string | null;
  storeZone?: string | null;
  storeRating?: number;
  storeKm?: string | null;
}

export function ProductSellerInfo({
  storeName,
  storeSlug,
  storeDescription,
  storeZone,
  storeRating = 4.8,
  storeKm,
}: ProductSellerInfoProps) {
  return (
    <section aria-label={`Información de la tienda ${storeName}`} className="space-y-3">
      <Kicker as="p">Vendedor</Kicker>
      <SectionTitle as="h2">Sobre la tienda</SectionTitle>

      <div className="rounded-xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] overflow-hidden">
        <div className="flex items-start gap-5 p-5">
          {/* Ilustración bodega */}
          <div className="shrink-0 flex items-center justify-center w-20 h-20 rounded-lg bg-[var(--surface-sunken)]">
            <BodegaAbriendo
              size={64}
              className="text-[var(--text-tertiary)] opacity-70"
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            <h3 className="text-[length:var(--ts-base)] font-semibold text-[var(--text-primary)] truncate">
              {storeName}
            </h3>

            {/* Rating */}
            <div className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-[var(--text-primary)] fill-[var(--text-primary)]" aria-hidden />
              <Caption className="font-semibold text-[var(--text-primary)]">{storeRating.toFixed(1)}</Caption>
              <Caption className="text-[var(--text-tertiary)]">· Muy buena calificación</Caption>
            </div>

            {/* Tiempo respuesta */}
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
              <Caption className="text-[var(--text-secondary)]">Responde en menos de 5 min</Caption>
            </div>

            {/* Zona */}
            {storeZone && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
                <Caption className="text-[var(--text-secondary)]">
                  {storeZone}
                  {storeKm && ` · ${storeKm}`}
                </Caption>
              </div>
            )}

            {/* Descripción */}
            {storeDescription && (
              <BodyText className="text-[var(--text-secondary)] text-[length:var(--ts-xs)] line-clamp-2">
                {storeDescription}
              </BodyText>
            )}
          </div>
        </div>

        {/* CTA footer */}
        <div className="border-t border-[var(--rule-muted)] px-5 py-3 bg-[var(--surface-canvas)]">
          <Link
            href={`/marketplace/${storeSlug}`}
            className="inline-flex items-center gap-1.5 text-[length:var(--ts-sm)] font-medium text-[var(--accent)] hover:opacity-80 transition-opacity"
            aria-label={`Ver tienda ${storeName}`}
          >
            Ver tienda completa
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
