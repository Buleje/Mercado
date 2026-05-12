"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { X, ZoomIn, ChevronLeft, ChevronRight, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: string[];
  alt: string;
}

export default function ProductGallery({ images, alt }: ProductGalleryProps) {
  const [selected, setSelected] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const imgRef = useRef<HTMLDivElement>(null);

  const hasMultiple = images.length > 1;

  const navigate = useCallback(
    (dir: 1 | -1) => {
      setSelected((prev) => (prev + dir + images.length) % images.length);
    },
    [images.length],
  );

  // Keyboard nav for lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowLeft") navigate(-1);
      if (e.key === "ArrowRight") navigate(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox, navigate]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  };

  if (images.length === 0) {
    return (
      <div className="aspect-square bg-gray-50 dark:bg-surface rounded-2xl flex items-center justify-center">
        <Package className="h-16 w-16 text-gray-300" />
      </div>
    );
  }

  return (
    <>
      {/* Main image */}
      <div className="space-y-3">
        <div
          ref={imgRef}
          className="relative aspect-square bg-gray-50 dark:bg-surface rounded-2xl overflow-hidden cursor-zoom-in group border border-[var(--rule-base)]"
          onClick={() => setLightbox(true)}
          onMouseEnter={() => setZoom(true)}
          onMouseLeave={() => setZoom(false)}
          onMouseMove={handleMouseMove}
        >
          <Image
            src={images[selected]}
            alt={`${alt} - imagen ${selected + 1}`}
            fill
            className={cn(
              "object-cover transition-transform duration-300",
              zoom && "scale-150",
            )}
            style={zoom ? { transformOrigin: `${zoomPos.x}% ${zoomPos.y}%` } : undefined}
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
          <button
            className="absolute bottom-3 right-3 h-10 w-10 rounded-full bg-white/80 dark:bg-[var(--surface-raised)]/80 flex items-center justify-center shadow-[var(--shadow-md)] opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Ampliar imagen"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(true);
            }}
          >
            <ZoomIn className="h-5 w-5 text-gray-700 dark:text-muted" />
          </button>
          {/* Arrow navigation */}
          {hasMultiple && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 dark:bg-[var(--surface-raised)]/80 flex items-center justify-center shadow-[var(--shadow-md)] opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Imagen anterior"
              >
                <ChevronLeft className="h-5 w-5 text-gray-700 dark:text-muted" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white/80 dark:bg-[var(--surface-raised)]/80 flex items-center justify-center shadow-[var(--shadow-md)] opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Imagen siguiente"
              >
                <ChevronRight className="h-5 w-5 text-gray-700 dark:text-muted" />
              </button>
            </>
          )}
          {/* Dots indicator */}
          {hasMultiple && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-2 rounded-full transition-all",
                    i === selected ? "w-5 bg-white" : "w-2 bg-white/50",
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Thumbnails */}
        {hasMultiple && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((src, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={cn(
                  "relative h-16 w-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all",
                  i === selected
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-[var(--rule-base)] hover:border-gray-400",
                )}
              >
                <Image
                  src={src}
                  alt={`${alt} thumbnail ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 z-10 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            aria-label="Cerrar"
            onClick={() => setLightbox(false)}
          >
            <X className="h-6 w-6 text-white" />
          </button>

          {hasMultiple && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-7 w-7 text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label="Siguiente"
              >
                <ChevronRight className="h-7 w-7 text-white" />
              </button>
            </>
          )}

          <div
            className="relative max-w-4xl max-h-[85vh] w-full aspect-square"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={images[selected]}
              alt={`${alt} - imagen ${selected + 1}`}
              fill
              className="object-contain"
              sizes="100vw"
              priority
            />
          </div>

          {hasMultiple && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setSelected(i); }}
                  className={cn(
                    "h-2.5 rounded-full transition-all",
                    i === selected ? "w-7 bg-white" : "w-2.5 bg-white/40 hover:bg-white/60",
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
