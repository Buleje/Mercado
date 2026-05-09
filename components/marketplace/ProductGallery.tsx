"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { m as motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ZoomIn, X, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface GalleryImage {
  url: string;
  alt?: string;
}

interface ProductGalleryProps {
  images: GalleryImage[];
  productName: string;
  fallbackImage?: string;
}

export default function ProductGallery({ images, productName, fallbackImage }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const hasImages = images.length > 0;
  const showThumbs = images.length > 1;
  const activeImage = hasImages ? images[activeIndex] : null;

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
      diff > 0 ? next() : prev();
    }
    setTouchStart(null);
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Imagen principal */}
        <div
          className="relative aspect-square w-full overflow-hidden rounded-2xl bg-[var(--surface-alt)] dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {hasImages || fallbackImage ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0"
              >
                <Image
                  src={activeImage?.url ?? fallbackImage ?? ""}
                  alt={activeImage?.alt ?? `${productName} — imagen ${activeIndex + 1} de ${images.length}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority={activeIndex === 0}
                />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-300 dark:text-gray-600">
              <Package className="h-16 w-16" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Sin imagen
              </span>
            </div>
          )}

          {/* Controles prev/next (solo si hay mas de 1) */}
          {showThumbs && (
            <>
              <button
                onClick={prev}
                aria-label="Anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow-md border border-white/50 dark:border-gray-700 hover:scale-110 active:scale-95 transition-all"
              >
                <ChevronLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
              <button
                onClick={next}
                aria-label="Siguiente"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow-md border border-white/50 dark:border-gray-700 hover:scale-110 active:scale-95 transition-all"
              >
                <ChevronRight className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              </button>
            </>
          )}

          {/* Boton zoom (desktop) */}
          {hasImages && (
            <button
              onClick={() => setZoomOpen(true)}
              aria-label="Ver imagen ampliada"
              className="absolute bottom-2 right-2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow border border-white/50 dark:border-gray-700 hover:scale-110 active:scale-95 transition-all"
            >
              <ZoomIn className="h-4 w-4 text-gray-700 dark:text-gray-300" />
            </button>
          )}

          {/* Contador mobile */}
          {showThumbs && (
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 sm:hidden text-[length:var(--ts-2xs)] font-medium bg-black/50 text-white px-2 py-0.5 rounded-full">
              {activeIndex + 1} / {images.length}
            </span>
          )}
        </div>

        {/* Thumbnails (desktop: fila horizontal, max 6) */}
        {showThumbs && (
          <div className="hidden sm:flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {images.slice(0, 6).map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                aria-label={`Imagen ${i + 1} de ${images.length}`}
                className={cn(
                  "relative h-16 w-16 shrink-0 rounded-xl overflow-hidden border-2 transition-all",
                  i === activeIndex
                    ? "border-primary scale-105 shadow-md"
                    : "border-gray-200 dark:border-gray-700 hover:border-[var(--accent)]/50"
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
