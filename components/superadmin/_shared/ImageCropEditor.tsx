"use client";

/**
 * ImageCropEditor — Modal de ajuste de imagen antes de subir.
 *
 * Usa react-easy-crop para zoom (lupa +/-), pan (drag) y crop (cortar).
 * Output: Blob WebP listo para POST /api/superadmin/upload.
 *
 * Acepta:
 *   - srcDataUrl: data URL del archivo elegido (FileReader.readAsDataURL)
 *   - aspect: ratio target (1 para square, 16/7 para wide)
 *
 * Devuelve el File listo para subir vía onApply(file).
 */

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Check,
  MousePointer,
} from "@buleje/design-system/icons";

interface ImageCropEditorProps {
  open: boolean;
  srcDataUrl: string | null;
  aspect?: number;
  fileName?: string;
  onApply: (file: File) => void;
  onCancel: () => void;
}

async function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (err) => reject(err));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

async function cropToFile(
  srcDataUrl: string,
  pixelCrop: Area,
  rotation: number,
  fileName: string,
): Promise<File> {
  const image = await createImage(srcDataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_ctx_failed");

  // Caja envolvente para soportar rotación
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxWidth = image.width * cos + image.height * sin;
  const bBoxHeight = image.width * sin + image.height * cos;

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rad);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  // Cortar área pedida
  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height);
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.putImageData(data, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("blob_failed"))),
      "image/webp",
      0.92,
    ),
  );

  const baseName = fileName.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}

export default function ImageCropEditor({
  open,
  srcDataUrl,
  aspect = 1,
  fileName = "image",
  onApply,
  onCancel,
}: ImageCropEditorProps) {
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixelCrop, setPixelCrop] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setPixelCrop(areaPixels);
  }, []);

  const handleApply = useCallback(async () => {
    if (!srcDataUrl || !pixelCrop) return;
    setWorking(true);
    setErrorMsg(null);
    try {
      const file = await cropToFile(srcDataUrl, pixelCrop, rotation, fileName);
      onApply(file);
    } catch (e) {
      setErrorMsg((e as Error).message || "Error al recortar");
    } finally {
      setWorking(false);
    }
  }, [srcDataUrl, pixelCrop, rotation, fileName, onApply]);

  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  }, []);

  if (!open || !srcDataUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ajustar imagen"
      onClick={(e) => {
        if (e.target === e.currentTarget && !working) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !working) onCancel();
      }}
    >
      <div className="relative w-full max-w-3xl rounded-3xl bg-[var(--surface-raised)] shadow-2xl overflow-hidden border-2 border-[var(--rule-soft)]">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
              Editor de imagen
            </p>
            <h2 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Ajustá tu imagen
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[var(--rule-soft)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </header>

        {/* Crop canvas */}
        <div className="relative h-[400px] bg-black">
          <Cropper
            image={srcDataUrl}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            cropShape="rect"
            showGrid={true}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
          {/* Hint pan */}
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg bg-white/90 backdrop-blur px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-primary)]">
            <MousePointer className="h-3 w-3" strokeWidth={2.25} />
            Arrastrá para mover
          </div>
        </div>

        {/* Controls */}
        <div className="border-t-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-4 space-y-3">
          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, +(z - 0.1).toFixed(2)))}
              aria-label="Alejar"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition hover:border-[var(--accent)]/40"
            >
              <ZoomOut className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                  Zoom
                </span>
                <span className="text-xs font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {(zoom * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full h-2 rounded-full bg-[var(--surface-sunken)] accent-[var(--accent)] cursor-pointer"
                aria-label="Nivel de zoom"
              />
            </div>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
              aria-label="Acercar"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition hover:border-[var(--accent)]/40"
            >
              <ZoomIn className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>

          {/* Rotation + reset */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] transition hover:border-[var(--accent)]/40"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} />
              Rotar
            </button>
            <span className="text-xs font-mono tabular-nums text-[var(--text-tertiary)] min-w-[40px]">
              {rotation}°
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40"
            >
              Restablecer
            </button>
          </div>

          {errorMsg && (
            <div className="rounded-xl border-2 border-rose-300/60 bg-rose-50/50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-end gap-2 border-t-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={working || !pixelCrop}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-extrabold uppercase tracking-wider text-white shadow-md shadow-[var(--accent)]/25 transition hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
            {working ? "Procesando…" : "Aplicar y subir"}
          </button>
        </footer>
      </div>
    </div>
  );
}
