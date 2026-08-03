"use client";

/**
 * FridgeScanCard — "Foto del refri → IA detecta faltantes".
 *
 * Flow:
 *   1. Boton "Subí foto del refri o despensa"
 *   2. File input con capture="environment" (abre cámara en mobile)
 *   3. Preview de la foto
 *   4. POST a /api/fridge-scan con multipart
 *   5. IA detecta visible + sugiere faltantes basicos peruanos
 *   6. UI muestra:
 *      - "Detectamos: arroz, cebolla, huevos..."
 *      - Lista sugeridos con "Agregar" por cada uno
 *   7. Tap "Agregar" en chips → bulk add al carrito
 *
 * Magic moment: cliente abre fridge, saca foto, Buleje arma el pedido.
 */

import { useState, useCallback, useRef } from "react";
import {
  Camera,
  Upload,
  Loader2,
  ShoppingCart,
  Check,
  AlertCircle,
  Sparkles,
  X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Suggested {
  name: string;
  qty: number;
  unit?: string;
  reason: string;
}

interface Props {
  onAddToCart?: (items: Suggested[]) => Promise<void> | void;
  endpoint?: string;
}

type Status = "idle" | "uploading" | "analyzing" | "ready" | "added" | "error";

const MAX_SIZE_MB = 8;
const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic";

export default function FridgeScanCard({
  onAddToCart,
  endpoint = "/api/fridge-scan",
}: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [detected, setDetected] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<Suggested[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`Imagen muy grande (max ${MAX_SIZE_MB}MB)`);
        setStatus("error");
        return;
      }
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);
      setStatus("uploading");

      const form = new FormData();
      form.append("image", file);

      try {
        setStatus("analyzing");
        const res = await fetch(endpoint, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "No pudimos analizar la foto");
          setStatus("error");
          return;
        }
        setDetected(data.detected ?? []);
        setSuggested(data.suggested ?? []);
        setSelectedIdx(new Set((data.suggested ?? []).map((_: unknown, i: number) => i)));
        setStatus(data.suggested?.length > 0 ? "ready" : "error");
        if (!data.suggested?.length) {
          setError("No detectamos productos. Probá con otra foto más clara.");
        }
      } catch {
        setError("Error de conexión");
        setStatus("error");
      }
    },
    [endpoint],
  );

  const toggleSelected = useCallback((idx: number) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleAddAll = useCallback(async () => {
    if (selectedIdx.size === 0) return;
    const items = Array.from(selectedIdx).map((i) => suggested[i]);
    await onAddToCart?.(items);
    setStatus("added");
    setTimeout(() => {
      setStatus("idle");
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setDetected([]);
      setSuggested([]);
      setSelectedIdx(new Set());
    }, 2500);
  }, [suggested, selectedIdx, onAddToCart]);

  const handleReset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDetected([]);
    setSuggested([]);
    setSelectedIdx(new Set());
    setStatus("idle");
    setError(null);
  }, [previewUrl]);

  const isProcessing = status === "uploading" || status === "analyzing";

  return (
    <section
      aria-label="Analiza tu refri con IA"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <Camera className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              Magic Moment
            </p>
            <h3 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)] mt-0.5">
              Foto del refri → lista auto
            </h3>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Sacá una foto de tu refri o despensa. La IA te arma la lista de
              lo que te falta.
            </p>
          </div>
        </div>
      </div>

      {/* Upload area */}
      {!previewUrl && status === "idle" && (
        <div className="px-5 sm:px-6 pb-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--rule-base)] hover:border-[var(--accent)] bg-[var(--surface-sunken)] p-8 cursor-pointer transition-colors"
          >
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-[var(--text-primary)]">
              <Upload className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="text-center">
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                Subí foto o sacá ahora
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                JPG, PNG o WebP · Máx {MAX_SIZE_MB}MB
              </p>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
            className="hidden"
          />
        </div>
      )}

      {/* Preview + processing */}
      {previewUrl && (
        <div className="px-5 sm:px-6 pb-5">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-base)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Foto del refri"
              className="h-full w-full object-cover"
            />
            {isProcessing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
                <Loader2 className="h-8 w-8 animate-spin mb-2" strokeWidth={1.75} />
                <p className="text-sm font-extrabold">
                  {status === "uploading" ? "Subiendo…" : "Analizando con IA…"}
                </p>
              </div>
            )}
            {!isProcessing && (
              <button
                type="button"
                onClick={handleReset}
                aria-label="Quitar foto"
                className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--text-primary)]/70 text-white hover:bg-[var(--text-primary)] backdrop-blur transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isProcessing && (
        <div className="px-5 sm:px-6 pb-4">
          <div className="flex items-start gap-2 rounded-xl border border-[var(--data-error,_#e11d48)]/40 bg-[var(--data-error,_#e11d48)]/10 px-3 py-2 text-xs text-[var(--data-error,_#e11d48)]">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Detected */}
      {detected.length > 0 && status !== "added" && (
        <div className="px-5 sm:px-6 pb-4">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Vemos en tu foto
          </p>
          <div className="flex flex-wrap gap-1.5">
            {detected.map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]"
              >
                <Check className="h-3 w-3 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Suggested con bulk add */}
      {suggested.length > 0 && status !== "added" && (
        <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-5 sm:px-6 py-5">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)] mb-3 inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            Te sugerimos
          </p>
          <ul className="space-y-2">
            {suggested.map((item, idx) => {
              const isSelected = selectedIdx.has(idx);
              return (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => toggleSelected(idx)}
                    aria-pressed={isSelected}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                      isSelected
                        ? "border-[var(--accent)] bg-primary/10"
                        : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full border shrink-0 mt-0.5",
                        isSelected
                          ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                          : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-tertiary)]",
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {item.name}
                        </p>
                        <p className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-secondary)] shrink-0">
                          {item.qty} {item.unit ?? ""}
                        </p>
                      </div>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                        {item.reason}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={handleAddAll}
            disabled={selectedIdx.size === 0}
            className={cn(
              "mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold transition-all active:scale-[0.98]",
              selectedIdx.size > 0
                ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]"
                : "bg-[var(--surface-raised)] text-[var(--text-tertiary)] cursor-not-allowed",
            )}
          >
            <ShoppingCart className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Agregar {selectedIdx.size} al carrito
          </button>
        </div>
      )}

      {/* Added */}
      {status === "added" && (
        <div className="px-5 py-8 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white mb-4">
            <Check className="h-7 w-7" strokeWidth={2.5} aria-hidden />
          </span>
          <p className="text-base font-extrabold text-[var(--text-primary)]">
            ¡Agregado al carrito!
          </p>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            Seguí comprando o andá al checkout
          </p>
        </div>
      )}
    </section>
  );
}
