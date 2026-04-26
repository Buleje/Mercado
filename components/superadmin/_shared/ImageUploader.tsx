"use client";

/**
 * ImageUploader — Componente reusable para subir imágenes desde superadmin.
 *
 * Soporta 3 métodos de input:
 *   - Click → abre file picker del SO
 *   - Drag & drop → arrastrar archivo desde explorador
 *   - Ctrl+V (paste) → cuando el componente tiene foco
 *
 * Optimización server-side automática (sharp WebP). Layout compacto
 * (no card gigante) — el caller controla el tamaño del wrapper.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Upload, RefreshCw, Trash2, AlertTriangle } from "@buleje/design-system/icons";

interface ImageUploaderProps {
  value: string | null;
  onChange: (url: string | null) => void;
  /** Folder en /uploads/ y en Supabase. Default: "platform" */
  folder?: string;
  /** "square" (cuadrado 800×800) o "wide" (1200xAUTO) */
  mode?: "square" | "wide";
  /** Aspect ratio del slot. Default según mode. */
  aspectClass?: string;
  /** Tamaño del slot. Pasá clases tailwind como "h-24 w-24" o "w-full h-32". */
  className?: string;
  /** Si true, escucha Ctrl+V global mientras el componente tiene foco */
  enablePaste?: boolean;
  alt?: string;
}

export default function ImageUploader({
  value,
  onChange,
  folder = "platform",
  mode = "square",
  aspectClass,
  className,
  enablePaste = true,
  alt = "Imagen",
}: ImageUploaderProps) {
  const reactId = useId();
  const inputId = `uploader-${reactId}`;
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedPct, setSavedPct] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setStatus("uploading");
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      fd.append("mode", mode);
      const res = await fetch("/api/superadmin/upload", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { url: string; savedPct: number };
      onChange(json.url);
      setSavedPct(json.savedPct);
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error).message ?? "Error subiendo imagen");
    }
  }

  // Paste handler — solo activo cuando el componente tiene foco
  useEffect(() => {
    if (!enablePaste || !isFocused) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            void uploadFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enablePaste, isFocused]);

  const aspect = aspectClass ?? (mode === "wide" ? "aspect-[16/7]" : "aspect-square");

  return (
    <div className={className}>
      {/* <label> + <input> nativo: clicar la label dispara el file picker
          sin necesidad de input.click() programático (más confiable y no
          requiere user gesture explícito). */}
      <label
        htmlFor={inputId}
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void uploadFile(file);
        }}
        aria-label={value ? "Cambiar imagen" : "Subir imagen"}
        className={`relative block w-full ${aspect} rounded-lg overflow-hidden border-2 transition-all group ${
          isDragging
            ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
            : isFocused
              ? "border-[var(--accent)]/60"
              : "border-dashed border-[var(--rule-base)] hover:border-[var(--accent)]/50"
        } ${status === "uploading" ? "cursor-progress" : "cursor-pointer"}`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={alt}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[var(--text-tertiary)] bg-[var(--surface-sunken)]">
            <Upload className="h-4 w-4" strokeWidth={1.75} />
            <p className="text-[10px] font-bold leading-tight">
              Click, arrastrar
              {enablePaste ? " o Ctrl+V" : ""}
            </p>
          </div>
        )}

        {isDragging && (
          <div className="absolute inset-0 bg-[var(--accent)]/30 backdrop-blur-sm flex items-center justify-center">
            <span className="text-xs font-bold text-white bg-[var(--accent)] px-2.5 py-1 rounded-full">
              Soltá aquí
            </span>
          </div>
        )}

        {status === "uploading" && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center gap-1 text-white">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-[10px] font-bold">Optimizando...</span>
          </div>
        )}

        {savedPct != null && savedPct > 0 && status === "idle" && value && (
          <span className="absolute top-1 right-1 inline-flex items-center gap-1 rounded-full bg-black/70 backdrop-blur text-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
            -{savedPct}%
          </span>
        )}

        {value && status === "idle" && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur text-[var(--text-primary)] px-2 py-0.5 text-[10px] font-bold">
              <Upload className="h-3 w-3" />
              Cambiar
            </span>
          </div>
        )}
      </label>

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
          e.target.value = "";
        }}
      />

      {errorMsg && (
        <div className="mt-1 flex items-start gap-1 text-[10px] text-rose-700">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <span className="leading-tight">{errorMsg}</span>
        </div>
      )}

      {value && status === "idle" && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:underline"
        >
          <Trash2 className="h-3 w-3" />
          Quitar
        </button>
      )}
    </div>
  );
}
