"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Check, RotateCcw } from "@buleje/design-system/icons";

/**
 * ImageCropModal — recorte + ajuste de imagen sin salir del editor (Brandon
 * 2026-06-27, audit #4). El dueño encuadra (zoom + arrastrar), ajusta brillo y
 * contraste, y al aplicar se exporta el área visible a un canvas → blob → se
 * re-sube. El marco usa el aspect ratio del destino (banner/square/video).
 *
 * Requiere CORS en el origen de la imagen (Supabase lo permite) → crossOrigin.
 */
const ASPECT: Record<string, number> = { square: 1, video: 16 / 9, banner: 3 / 1 };
const FRAME_W = 360;

export default function ImageCropModal({
  src,
  aspectRatio = "video",
  onCancel,
  onApply,
}: {
  src: string;
  aspectRatio?: "square" | "video" | "banner";
  onCancel: () => void;
  onApply: (blob: Blob) => void;
}) {
  const ratio = ASPECT[aspectRatio] ?? 16 / 9;
  const frameH = Math.round(FRAME_W / ratio);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Cargar la imagen (con CORS) para medir tamaño natural + dibujar en canvas.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      setLoaded(true);
    };
    img.onerror = () => setErr("No se pudo cargar la imagen para editar.");
    img.src = src;
  }, [src]);

  // Escala base para que la imagen "cubra" el marco a zoom=1.
  const s0 = Math.max(FRAME_W / natural.w, frameH / natural.h);
  const dispW = natural.w * s0 * zoom;
  const dispH = natural.h * s0 * zoom;
  const dispX = FRAME_W / 2 - dispW / 2 + pan.x;
  const dispY = frameH / 2 - dispH / 2 + pan.y;
  const filter = `brightness(${brightness}%) contrast(${contrast}%)`;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  };
  const onPointerUp = () => { drag.current = null; };

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); setBrightness(100); setContrast(100); };

  const apply = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    setErr(null);
    try {
      // Salida en alta resolución: ancho objetivo 1200px (o el del marco si menor).
      const out = Math.min(1600, Math.max(FRAME_W, 1200));
      const k = out / FRAME_W;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(FRAME_W * k);
      canvas.height = Math.round(frameH * k);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no ctx");
      ctx.filter = filter;
      ctx.drawImage(img, dispX * k, dispY * k, dispW * k, dispH * k);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("toBlob falló (¿imagen sin CORS?)");
      onApply(blob);
    } catch (e) {
      setErr(e instanceof Error && e.message.includes("CORS") ? "La imagen no permite edición (CORS)." : "No se pudo recortar la imagen.");
      setBusy(false);
    }
  }, [dispX, dispY, dispW, dispH, filter, frameH, onApply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 dark">
      <button type="button" aria-label="Cerrar" onClick={onCancel} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-label="Ajustar imagen" className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#16181d] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Ajustar imagen</p>
          <button type="button" onClick={onCancel} aria-label="Cerrar" className="rounded-md p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Marco de recorte */}
        <div
          className="relative mx-auto overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/10 touch-none select-none"
          style={{ width: FRAME_W, height: frameH, cursor: drag.current ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {loaded && (
            // eslint-disable-next-line @next/next/no-img-element -- preview de edición en canvas
            <img
              src={src}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
              style={{ position: "absolute", left: dispX, top: dispY, width: dispW, height: dispH, filter, maxWidth: "none" }}
            />
          )}
          {/* Guías */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border border-white/10" />)}
          </div>
        </div>

        {/* Controles */}
        <div className="mt-4 space-y-3">
          {[
            { label: "Zoom", value: zoom, min: 1, max: 3, step: 0.01, set: setZoom, fmt: `${zoom.toFixed(2)}×` },
            { label: "Brillo", value: brightness, min: 50, max: 150, step: 1, set: setBrightness, fmt: `${brightness}%` },
            { label: "Contraste", value: contrast, min: 50, max: 150, step: 1, set: setContrast, fmt: `${contrast}%` },
          ].map((c) => (
            <label key={c.label} className="block">
              <span className="mb-1 flex items-center justify-between text-[length:var(--ts-2xs)] font-bold text-gray-300">
                {c.label}<span className="text-[var(--accent-soft)]">{c.fmt}</span>
              </span>
              <input type="range" min={c.min} max={c.max} step={c.step} value={c.value} onChange={(e) => c.set(Number(e.target.value))} className="w-full accent-[var(--accent-soft)]" />
            </label>
          ))}
        </div>

        {err && <p className="mt-2 text-[length:var(--ts-2xs)] font-semibold text-[var(--data-error-500)]">{err}</p>}

        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:bg-white/5">
            <RotateCcw className="h-3.5 w-3.5" /> Reiniciar
          </button>
          <button type="button" onClick={apply} disabled={!loaded || busy} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-soft)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> {busy ? "Aplicando…" : "Aplicar recorte"}
          </button>
        </div>
      </div>
    </div>
  );
}
