"use client";

/**
 * WriteReviewForm — Formulario INLINE de reseña (Brandon 2026-06-14: SIN modal).
 * Se renderiza dentro de la sección de opiniones, estilo MercadoLibre: bordes
 * rectos, tipografía suave, sin colores neón. Toggle vía prop `open` desde
 * ProductReviews. Submit es mock hasta integrar /api/marketplace/reviews real.
 */

import { useState, useRef, useCallback } from "react";
import { Send, CheckCircle2, Camera, Image as ImageIcon, X } from "@buleje/design-system/icons";
import RatingStars from "@/components/ui-system/RatingStars";

const MAX_PHOTOS = 4;
const MAX_FILE_SIZE_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface ReviewPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

interface WriteReviewFormProps {
  productId: number;
  productName: string;
  onSubmitted?: () => void;
  onCancel?: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: "No me gustó",
  2: "Algo decepcionante",
  3: "Está bien",
  4: "Me gustó",
  5: "¡Excelente!",
};

const PROMPT_CHIPS = [
  "Llegó fresco",
  "Buen empaque",
  "Precio justo",
  "Delivery rápido",
  "Súper atento",
  "Volvería a pedir",
];

export default function WriteReviewForm({
  productId: _productId,
  productName,
  onSubmitted,
  onCancel,
}: WriteReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoAdd = useCallback((files: FileList | null) => {
    if (!files) return;
    setError(null);
    const next: ReviewPhoto[] = [];
    for (let i = 0; i < files.length; i++) {
      if (photos.length + next.length >= MAX_PHOTOS) {
        setError(`Máximo ${MAX_PHOTOS} fotos por reseña`);
        break;
      }
      const file = files[i];
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Solo JPG, PNG o WebP");
        continue;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`Cada foto debe pesar menos de ${MAX_FILE_SIZE_MB}MB`);
        continue;
      }
      next.push({ id: `${i}-${file.name}`, file, previewUrl: URL.createObjectURL(file) });
    }
    if (next.length) setPhotos((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [photos.length]);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const insertPrompt = useCallback((chip: string) => {
    setBody((prev) => {
      if (prev.trim().length === 0) return chip + ". ";
      if (prev.endsWith(" ") || prev.endsWith(".")) return prev + chip + ". ";
      return prev + " " + chip + ". ";
    });
    bodyRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (rating === 0) return setError("Tocá las estrellas para calificar.");
    if (body.trim().length < 10) return setError("Escribí un poco más (mínimo 10 caracteres).");
    if (!name.trim()) return setError("Ingresá tu nombre para publicar.");
    setSubmitting(true);
    try {
      // Mock — cuando se integre reviews reales: POST /api/marketplace/reviews con orderId verificado.
      await new Promise((r) => setTimeout(r, 600));
      setSubmitted(true);
      onSubmitted?.();
    } catch {
      setError("No pudimos enviar tu reseña. Intentá más tarde.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--accent)]">
          <CheckCircle2 className="h-6 w-6" strokeWidth={2} />
        </div>
        <h3 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">¡Gracias por tu reseña!</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Tu opinión ayuda a otros vecinos a comprar mejor.
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-4 h-10 px-6 rounded-sm border border-[var(--rule-base)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Cerrar
          </button>
        )}
      </div>
    );
  }

  const ratingLabel = rating > 0 ? RATING_LABELS[rating] : "Tocá las estrellas para calificar";

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-[var(--rule-base)] bg-[var(--surface-raised)]"
      aria-label={`Escribir reseña de ${productName}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] px-4 py-3">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Escribí tu opinión</h3>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Cerrar formulario"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* Rating */}
        <div className="flex flex-wrap items-center gap-3">
          <RatingStars value={rating} onChange={setRating} mode="input" size="lg" label="Calificación" />
          <span className="text-sm text-[var(--text-secondary)]">{ratingLabel}</span>
        </div>

        {/* Prompt chips */}
        <div className="flex flex-wrap gap-2">
          {PROMPT_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => insertPrompt(chip)}
              className="inline-flex h-8 items-center rounded-sm border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Body */}
        <div>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Contanos cómo te fue: llegada, empaque, atención…"
            className="w-full rounded-sm border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none resize-none transition-colors"
          />
          <div className="mt-1 flex items-center justify-between text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            <span>Mínimo 10 caracteres</span>
            <span className="tabular-nums">{body.length} / 1000</span>
          </div>
        </div>

        {/* Photos */}
        <div>
          <p className="mb-2 inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            <ImageIcon className="h-4 w-4" aria-hidden />
            Fotos (opcional) · hasta {MAX_PHOTOS}
          </p>
          <div className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative h-20 w-20 overflow-hidden border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt="Foto de la reseña" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  aria-label="Eliminar foto"
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-sm bg-[var(--text-primary)]/80 text-white"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 border border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                aria-label="Agregar foto"
              >
                <Camera className="h-5 w-5" strokeWidth={2} />
                <span className="text-[length:var(--ts-xs)]">Agregar</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            onChange={(e) => handlePhotoAdd(e.target.files)}
            className="hidden"
            aria-hidden
          />
        </div>

        {/* Name */}
        <div>
          <label htmlFor="rv-name" className="mb-1 block text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
            ¿Cómo te llamamos?
          </label>
          <input
            id="rv-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Tu nombre"
            className="h-10 w-full rounded-sm border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none transition-colors"
          />
        </div>

        {error && (
          <p className="border border-[var(--data-error-600)]/30 bg-[var(--data-error-600)]/10 px-3 py-2 text-sm font-medium text-[var(--data-error-700)]">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--rule-soft)] px-4 py-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-10 rounded-sm px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          <Send className="h-4 w-4" strokeWidth={2} />
          {submitting ? "Enviando…" : "Publicar reseña"}
        </button>
      </div>
    </form>
  );
}
