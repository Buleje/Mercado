"use client";

/**
 * ImageZoomViewer — Viewer de imagen con zoom, pan y swipe para galerias.
 *
 * Desktop: click abre en lightbox, scroll wheel zoom, arrastrar pan.
 * Mobile: pinch zoom + swipe entre imagenes (usa hook useSwipe del DS).
 *
 * Casos de uso:
 *   - Galeria de producto en PDP
 *   - Preview de transferencia Yape/Plin
 *   - Reseñas con foto
 *
 * Simplificado (no usa framer-motion): transform CSS + touch events.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw } from "@buleje/design-system/icons";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/lib/utils";

interface Props {
  images: { src: string; alt: string }[];
  /** Index inicial. Default 0 */
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.5;

export default function ImageZoomViewer({ images, initialIndex = 0, open, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const focusTrapRef = useFocusTrap<HTMLDivElement>({ enabled: open, onEscape: onClose });

  // Reset al cambiar imagen
  useEffect(() => {
     
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);

  // Reset al abrir
  useEffect(() => {
    if (open) {
       
      setIndex(initialIndex);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [open, initialIndex]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex((i) => Math.min(images.length - 1, i + 1)), [images.length]);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP)), []);
  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "0") resetZoom();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, prev, next, zoomIn, zoomOut, resetZoom]);

  // Mouse pan (solo si zoom > 1)
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    panStartRef.current = { x: e.clientX, y: e.clientY, startX: pan.x, startY: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!panStartRef.current) return;
    setPan({
      x: panStartRef.current.startX + (e.clientX - panStartRef.current.x),
      y: panStartRef.current.startY + (e.clientY - panStartRef.current.y),
    });
  };
  const onPointerUp = () => {
    panStartRef.current = null;
  };

  if (!open) return null;

  const current = images[index];

  return (
    <div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-label="Visor de imágenes"
      className="fixed inset-0 z-50 bg-black/90 flex flex-col motion-safe:animate-[fadeIn_0.2s]"
    >
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between p-3 text-white/90">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tabular-nums">
            {index + 1} / {images.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Reducir zoom"
            className="h-9 w-9 rounded-full hover:bg-white/10 disabled:opacity-30 inline-flex items-center justify-center transition-colors"
          >
            <ZoomOut className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Ampliar zoom"
            className="h-9 w-9 rounded-full hover:bg-white/10 disabled:opacity-30 inline-flex items-center justify-center transition-colors"
          >
            <ZoomIn className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            aria-label="Reiniciar"
            className="h-9 w-9 rounded-full hover:bg-white/10 inline-flex items-center justify-center transition-colors"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-9 w-9 rounded-full hover:bg-white/10 inline-flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        className={cn(
          "flex-1 flex items-center justify-center overflow-hidden select-none",
          zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className="relative motion-safe:transition-transform motion-safe:duration-200"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <Image
            src={current.src}
            alt={current.alt}
            width={1200}
            height={1200}
            className="max-h-[80vh] w-auto object-contain pointer-events-none"
            priority
          />
        </div>
      </div>

      {/* Nav arrows */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            disabled={index === 0}
            aria-label="Imagen anterior"
            className="absolute left-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white inline-flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={next}
            disabled={index === images.length - 1}
            aria-label="Imagen siguiente"
            className="absolute right-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white inline-flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </>
      )}

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="shrink-0 px-4 pb-4">
          <ul className="flex gap-2 justify-center overflow-x-auto no-scrollbar">
            {images.map((img, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Ver imagen ${i + 1}`}
                  aria-current={i === index}
                  className={cn(
                    "shrink-0 h-14 w-14 rounded-lg overflow-hidden border-2 transition-all",
                    i === index ? "border-white" : "border-transparent opacity-60 hover:opacity-100",
                  )}
                >
                  <Image
                    src={img.src}
                    alt=""
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
