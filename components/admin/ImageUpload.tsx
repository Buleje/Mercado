"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { LoadingState } from "@buleje/design-system";
import { Upload, X, ImageIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { validateProductImage, type ImageValidationResult } from "@/lib/image-validator";
import { ImageValidationPanel } from "@/components/admin/shared/ImageValidationPanel";
import { installDragGuard, uninstallDragGuard, compressIfLarge } from "@/lib/image-upload-utils";
import { csrfHeaders } from "@/lib/csrf-client";

type ImageUploadProps = {
  value?: string;
  onChange: (url: string) => void;
  onClear?: () => void;
  folder?: string;
  label?: string;
  hint?: string;
  className?: string;
  aspectRatio?: "square" | "video" | "banner";
  /**
   * Si true, valida la imagen contra el estándar de producto del marketplace
   * (resolución, peso, fondo, formato). Muestra warnings/errors antes de subir.
   * Default: false (solo activar en upload de productos de catálogo).
   */
  validateProduct?: boolean;
};

const ASPECT_MAP = {
  square: "aspect-square",
  video: "aspect-video",
  banner: "aspect-[3/1]",
};

export default function ImageUpload({
  value,
  onChange,
  onClear,
  folder = "general",
  label = "Imagen",
  hint,
  className,
  aspectRatio = "video",
  validateProduct = false,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validation, setValidation] = useState<ImageValidationResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Preview optimista — URL de objeto local para mostrar la imagen mientras
  // se sube. Se libera (revokeObjectURL) cuando llega la URL real o falla.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const optimisticRef = useRef<string | null>(null);

  // Instalar global drag guard mientras este componente esté montado.
  useEffect(() => {
    installDragGuard();
    return () => {
      uninstallDragGuard();
      // Cleanup de cualquier objectURL pendiente (memory leak prevention).
      if (optimisticRef.current) {
        URL.revokeObjectURL(optimisticRef.current);
        optimisticRef.current = null;
      }
    };
  }, []);

  const releaseOptimistic = useCallback(() => {
    if (optimisticRef.current) {
      URL.revokeObjectURL(optimisticRef.current);
      optimisticRef.current = null;
    }
    setOptimistic(null);
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      try {
        // Comprimir client-side si la imagen es grande — reduce el payload
        // antes de subir, mejora la velocidad percibida 3-5× en redes lentas.
        const finalFile = await compressIfLarge(file);

        const formData = new FormData();
        formData.append("file", finalFile);
        formData.append("folder", folder);

        // CSRF: proxy.ts valida X-CSRF-Token en mutaciones (POST/PUT/PATCH/DELETE).
        // Sin este header, devuelve 403. No seteamos Content-Type — el browser lo
        // genera con boundary correcto para multipart/form-data.
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: csrfHeaders(),
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Error al subir imagen");
          // Si falló, revertir preview optimista
          releaseOptimistic();
          return;
        }

        onChange(data.url);
        // Liberar el objectURL — la imagen ahora vive en data.url (Supabase).
        releaseOptimistic();
      } catch {
        setError("Error de conexión al subir imagen");
        releaseOptimistic();
      } finally {
        setUploading(false);
      }
    },
    [folder, onChange, releaseOptimistic],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;

      // Si validateProduct=true, corre validación antes del upload.
      // Errores bloquean; warnings se muestran pero permiten continuar.
      if (validateProduct) {
        const result = await validateProductImage(file);
        setValidation(result);
        if (!result.ok) {
          // Hay errores bloqueantes — no subir
          return;
        }
      }

      // Mostrar preview optimista INMEDIATAMENTE — el usuario ve su imagen
      // antes de que termine la subida. Si falla, se revierte.
      if (optimisticRef.current) URL.revokeObjectURL(optimisticRef.current);
      const previewUrl = URL.createObjectURL(file);
      optimisticRef.current = previewUrl;
      setOptimistic(previewUrl);

      uploadFile(file);
    },
    [uploadFile, validateProduct],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleClear = () => {
    if (onClear) onClear();
    else onChange("");
    releaseOptimistic();
    setError(null);
  };

  // URL efectivo a renderizar: optimistic > value real.
  const displayUrl = optimistic ?? value;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
      )}

      {displayUrl ? (
        /* ── Con imagen (real o preview optimista) ──────────── */
        <div
          className="relative group"
          data-dropzone="true"
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragOver(false);
          }}
          onDrop={handleDrop}
        >
          <div className={cn("relative rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-surface transition-all", ASPECT_MAP[aspectRatio], dragOver && "ring-2 ring-primary ring-offset-2")}>
            <Image
              src={displayUrl}
              alt={label ?? ""}
              fill
              sizes="(max-width: 768px) 100vw, 300px"
              className="object-cover"
              unoptimized={displayUrl.startsWith("data:") || displayUrl.startsWith("blob:")}
            />
          </div>
          {/* Overlay con acciones */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="bg-white/90 text-[var(--text-primary)] px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white dark:bg-[var(--color-card)] transition-colors"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="bg-[var(--data-error-500)]/90 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[var(--data-error-500)] transition-colors"
            >
              Quitar
            </button>
          </div>
          {uploading && <LoadingState variant="overlay" message="" size="sm" />}
        </div>
      ) : (
        /* ── Sin imagen — drop zone ─────────────────────────── */
        <div
          data-dropzone="true"
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragLeave={(e) => {
            // Solo desactivar si el cursor sale del dropzone real (no de un hijo).
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragOver(false);
          }}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "rounded-lg border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-2 p-6",
            ASPECT_MAP[aspectRatio],
            dragOver
              ? "border-primary bg-primary/5 dark:bg-primary/10"
              : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:bg-[var(--surface-alt)] dark:hover:bg-surface",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          {uploading ? (
            <LoadingState variant="inline" size="md" />
          ) : (
            <>
              <div className="h-10 w-10 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center">
                {dragOver ? (
                  <Upload className="h-5 w-5 text-primary" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {dragOver ? "Suelta aquí" : "Click o arrastra imagen"}
                </p>
                <p className="text-xs text-muted mt-0.5">JPG, PNG, WebP o SVG. Max 5 MB.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Input oculto.
          Reset del value tras el handler — sin esto, seleccionar el MISMO archivo
          dos veces seguidas no dispara onChange (el input considera que no hubo
          cambio). Así el file picker funciona siempre al primer click. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
          <X className="h-3 w-3" />
          {error}
        </div>
      )}

      {/* Validación de producto (warnings/errors de estándar) */}
      {validation && (
        <ImageValidationPanel result={validation} className="mt-2" />
      )}

      {/* Hint */}
      {hint && !error && (
        <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}
