"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

interface CategoryImageUploaderProps {
  /** Nombre de la categoría (key en el mapa). */
  categoryName: string;
  /** URL actual de la imagen, o `null` si no hay. */
  value: string | null;
  /** URL del default global del superadmin (para mostrar de placeholder). */
  defaultValue?: string | null;
  /** Endpoint donde subir el archivo. Por default `/api/upload`. */
  uploadEndpoint?: string;
  /** Folder dentro del bucket (segmenta storage). */
  folder?: string;
  /** Callback con la nueva URL (o "" para borrar). */
  onChange: (url: string) => void;
  /** Tamaño en px del thumbnail. Default 56. */
  size?: number;
}

export default function CategoryImageUploader({
  categoryName,
  value,
  defaultValue,
  uploadEndpoint = "/api/upload",
  folder = "category-images",
  onChange,
  size = 56,
}: CategoryImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayUrl = value || defaultValue || null;
  const isUsingDefault = !value && Boolean(defaultValue);

  const handleSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      const res = await fetch(uploadEndpoint, { method: "POST", headers: csrfHeaders(), body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { url?: string };
      if (!json.url) throw new Error("respuesta sin URL");
      onChange(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClear = () => {
    onChange("");
    setError(null);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleSelect}
        disabled={uploading}
        title={
          displayUrl
            ? `Cambiar imagen de ${categoryName}`
            : `Subir imagen para ${categoryName}`
        }
        className={cn(
          "relative shrink-0 overflow-hidden rounded-xl border-2 border-dashed transition-colors",
          displayUrl
            ? "border-transparent ring-1 ring-[var(--rule-base)]"
            : "border-[var(--rule-base)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30",
          uploading && "opacity-60 cursor-wait",
          isUsingDefault && "ring-1 ring-amber-400/60",
        )}
        style={{ width: size, height: size }}
      >
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={categoryName}
            fill
            sizes={`${size}px`}
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--surface-sunken)]">
            <ImagePlus className="h-5 w-5 text-[var(--text-tertiary)]" />
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </div>
        )}
        {isUsingDefault && (
          <span className="absolute bottom-0 left-0 right-0 bg-amber-500/90 text-[length:var(--ts-2xs)] font-bold text-white text-center py-0.5">
            global
          </span>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={handleSelect}
          disabled={uploading}
          className="text-[length:var(--ts-xs)] font-bold text-[var(--accent)] hover:underline disabled:opacity-50"
        >
          {value ? "Cambiar" : isUsingDefault ? "Reemplazar default" : "Subir"}
        </button>
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-0.5 text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)] hover:text-red-500"
            title="Borrar imagen propia (vuelve al default global o sin imagen)"
          >
            <Trash2 className="h-3 w-3" /> Borrar
          </button>
        )}
        {error && (
          <span className="text-[length:var(--ts-2xs)] font-medium text-red-500" title={error}>
            Error
          </span>
        )}
      </div>
    </div>
  );
}
