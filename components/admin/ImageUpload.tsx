"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ImageUploadProps = {
  value?: string;
  onChange: (url: string) => void;
  onClear?: () => void;
  folder?: string;
  label?: string;
  hint?: string;
  className?: string;
  aspectRatio?: "square" | "video" | "banner";
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
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", folder);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Error al subir imagen");
          return;
        }

        onChange(data.url);
      } catch {
        setError("Error de conexión al subir imagen");
      } finally {
        setUploading(false);
      }
    },
    [folder, onChange],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.[0]) return;
      uploadFile(files[0]);
    },
    [uploadFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleClear = () => {
    if (onClear) onClear();
    else onChange("");
    setError(null);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <p className="text-sm font-medium text-foreground">{label}</p>
      )}

      {value ? (
        /* ── Con imagen ─────────────────────────────────────── */
        <div className="relative group">
          <div className={cn("relative rounded-xl overflow-hidden border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface", ASPECT_MAP[aspectRatio])}>
            <Image
              src={value}
              alt={label ?? ""}
              fill
              sizes="(max-width: 768px) 100vw, 300px"
              className="object-cover"
              unoptimized={value.startsWith("data:")}
            />
          </div>
          {/* Overlay con acciones */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="bg-white/90 text-gray-900 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white transition-colors"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="bg-red-500/90 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-500 transition-colors"
            >
              Quitar
            </button>
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-black/50 rounded-xl flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      ) : (
        /* ── Sin imagen — drop zone ─────────────────────────── */
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "rounded-lg border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-2 p-6",
            ASPECT_MAP[aspectRatio],
            dragOver
              ? "border-primary bg-primary/5 dark:bg-primary/10"
              : "border-gray-200 dark:border-card-border hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-surface",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <>
              <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                {dragOver ? (
                  <Upload className="h-5 w-5 text-primary" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-gray-400" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {dragOver ? "Suelta aquí" : "Click o arrastra imagen"}
                </p>
                <p className="text-xs text-muted mt-0.5">JPG, PNG, WebP o SVG. Max 5 MB.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Input oculto */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <X className="h-3 w-3" />
          {error}
        </div>
      )}

      {/* Hint */}
      {hint && !error && (
        <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}
