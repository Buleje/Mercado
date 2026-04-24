"use client";

/**
 * ProductGalleryDS — Galería de imágenes para Product Detail Page.
 *
 * - Imagen principal aspect-square rounded-xl con AnimatePresence.
 * - Thumbnails clickables abajo (máx 5).
 * - Fallback: ilustración SVG por categoría (stroke 1.5, text-tertiary, opacity-60).
 * - ProductBadge superpuesto top-left si se provee.
 * - Swipe táctil para cambiar imagen en mobile.
 *
 * Nombrado ProductGalleryDS para no colisionar con el ProductGallery.tsx
 * existente en /components/marketplace/ que usa la misma ruta de importación.
 */

import { useState, useCallback } from "react";
import Image from "next/image";
import { m as motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ZoomIn, X } from "@buleje/design-system/icons";
import { cn, ProductBadge, type ProductBadgeIntent } from "@buleje/design-system";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
} from "@/components/ui-system/illustrations/categories";
import { Package } from "@buleje/design-system/icons";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface GalleryImage {
  url: string;
  alt?: string;
}

export interface ProductGalleryDSProps {
  images: GalleryImage[];
  productName: string;
  category?: string | null;
  badge?: { intent: ProductBadgeIntent; label: string } | null;
}

// ── Fallback por categoría ─────────────────────────────────────────────────────

const CATEGORY_FALLBACK_MAP: Record<string, React.FC<{ size?: number; className?: string }>> = {
  verdura: VerduraFresca,
  fruta: VerduraFresca,
  vegetal: VerduraFresca,
  carne: CarniceriaFresca,
  pollo: CarniceriaFresca,
  res: CarniceriaFresca,
  lacteo: LacteosRefresh,
  leche: LacteosRefresh,
  queso: LacteosRefresh,
  bebida: BebidasVarias,
  gaseosa: BebidasVarias,
  agua: BebidasVarias,
  limpieza: LimpiezaDomicilio,
  detergente: LimpiezaDomicilio,
};

function getCategoryIllustration(category?: string | null) {
  if (!category) return null;
  const key = category.toLowerCase();
  for (const [k, Comp] of Object.entries(CATEGORY_FALLBACK_MAP)) {
    if (key.includes(k)) return Comp;
  }
  return null;
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function ProductGalleryDS({ images, productName, category, badge }: ProductGalleryDSProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const hasImages = images.length > 0;
  const showThumbs = images.length > 1;
  const activeImage = hasImages ? images[activeIndex] : null;

  // getCategoryIllustration retorna uno de 5 componentes stateless del DS —
  // el rule react-hooks/static-components detecta un falso positivo porque
  // es un patron de switch dinamico, no una creacion en render con closure.
  // eslint-disable-next-line react-hooks/static-components
  const FallbackIllustration = getCategoryIllustration(category);

  const prev = useCallback(() => {
    setActiveIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  }, [images.length]);

  const next = useCallback(() => {
    setActiveIndex((i) => (i === images.length - 1 ? 0 : i + 1));
  }, [images.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = touchStart - (e.changedTouches[0]?.clientX ?? 0);
    if (Math.abs(diff) > 40) {
      if (diff > 0) next();
      else prev();
    }
    setTouchStart(null);
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Imagen principal */}
        <div
          className="relative aspect-square w-full overflow-hidden rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-muted)]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Badge superpuesto */}
          {badge && (
            <div className="absolute top-3 left-3 z-10">
              <ProductBadge intent={badge.intent}>{badge.label}</ProductBadge>
            </div>
          )}

          {hasImages ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0"
              >
                <Image
                  src={activeImage!.url}
                  alt={activeImage!.alt ?? `${productName} — imagen ${activeIndex + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 45vw"
                  priority={activeIndex === 0}
                />
              </motion.div>
            </AnimatePresence>
          ) : FallbackIllustration ? (
            /* Ilustración DS por categoría */
            <div className="flex h-full w-full items-center justify-center">
              {/* eslint-disable-next-line react-hooks/static-components */}
              <FallbackIllustration
                size={140}
                className="text-[var(--text-tertiary)] opacity-60"
              />
            </div>
          ) : (
            /* Fallback genérico */
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
              <Package className="h-14 w-14 opacity-40" />
            </div>
          )}

          {/* Controles prev/next */}
          {showThumbs && (
            <>
              <button
                onClick={prev}
                aria-label="Imagen anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-raised)]/80 backdrop-blur-sm shadow-sm border border-[var(--rule-muted)] hover:scale-105 active:scale-95 transition-transform"
              >
                <ChevronLeft className="h-5 w-5 text-[var(--text-secondary)]" />
              </button>
              <button
                onClick={next}
                aria-label="Imagen siguiente"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-raised)]/80 backdrop-blur-sm shadow-sm border border-[var(--rule-muted)] hover:scale-105 active:scale-95 transition-transform"
              >
                <ChevronRight className="h-5 w-5 text-[var(--text-secondary)]" />
              </button>
            </>
          )}

          {/* Botón zoom (desktop) */}
          {hasImages && (
            <button
              onClick={() => setZoomOpen(true)}
              aria-label="Ver imagen ampliada"
              className="absolute bottom-2 right-2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-raised)]/80 backdrop-blur-sm shadow-sm border border-[var(--rule-muted)] hover:scale-105 active:scale-95 transition-transform"
            >
              <ZoomIn className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
          )}

          {/* Contador mobile */}
          {showThumbs && (
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 sm:hidden text-[length:var(--ts-2xs)] font-medium bg-[var(--text-primary)]/50 text-[var(--surface-canvas)] px-2 py-0.5 rounded-full">
              {activeIndex + 1} / {images.length}
            </span>
          )}
        </div>

        {/* Thumbnails */}
        {showThumbs && (
          <div className="hidden sm:flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {images.slice(0, 5).map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                aria-label={`Ver imagen ${i + 1}`}
                className={cn(
                  "relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                  i === activeIndex
                    ? "border-[var(--accent)] scale-105 shadow-sm"
                    : "border-[var(--rule-base)] hover:border-[var(--accent)]/50"
                )}
              >
                <Image
                  src={img.url}
                  alt={img.alt ?? `Miniatura ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Modal fullscreen zoom */}
      <AnimatePresence>
        {zoomOpen && activeImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setZoomOpen(false)}
          >
            <button
              onClick={() => setZoomOpen(false)}
              aria-label="Cerrar zoom"
              className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative w-full max-w-2xl aspect-square"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={activeImage.url}
                alt={activeImage.alt ?? productName}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 672px"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
