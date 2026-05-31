"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, CheckCircle2, Camera, Image as ImageIcon, Heart } from "@buleje/design-system/icons";
import RatingStars from "@/components/ui-system/RatingStars";

// Limites para upload de fotos en reviews
const MAX_PHOTOS = 4;
const MAX_FILE_SIZE_MB = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface ReviewPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

interface WriteReviewModalProps {
  open: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
  onSubmitted?: () => void;
}

const RATING_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "No me gustó", color: "text-[var(--data-error-600)]" },
  2: { label: "Algo decepcionante", color: "text-[var(--data-warning-600)]" },
  3: { label: "Está bien", color: "text-[var(--data-warning-700)]" },
  4: { label: "Me gustó", color: "text-[var(--accent)]" },
  5: { label: "¡Excelente!", color: "text-[var(--accent)]" },
};

const PROMPT_CHIPS = [
  "Llegó fresco",
  "Buen empaque",
  "Precio justo",
  "Delivery rápido",
  "Súper atento",
  "Volvería a pedir",
];

export default function WriteReviewModal({
  open,
  onClose,
  productId: _productId,
  productName,
  onSubmitted,
}: WriteReviewModalProps) {
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
    const newPhotos: ReviewPhoto[] = [];
    for (let i = 0; i < files.length; i++) {
      if (photos.length + newPhotos.length >= MAX_PHOTOS) {
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
      newPhotos.push({
        id: `${Date.now()}-${i}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (newPhotos.length) setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [photos.length]);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const toRemove = prev.find((p) => p.id === id);
      if (toRemove) URL.revokeObjectURL(toRemove.previewUrl);
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

  useEffect(() => {
    if (open) return;
    // Reset al cerrar — revoca URLs de preview para evitar leak
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setRating(0);
    setBody("");
    setName("");
    setSubmitting(false);
    setSubmitted(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (rating === 0) {
      setError("Tocá las estrellas para calificar.");
      return;
    }
    if (body.trim().length < 10) {
      setError("Escribí un poco más (mínimo 10 caracteres) para que ayude a otros.");
      return;
    }
    if (!name.trim()) {
      setError("Ingresá tu nombre para publicar.");
      return;
    }

    setSubmitting(true);
    try {
      // Endpoint mock — cuando se integre reviews reales, POST a
      // /api/marketplace/reviews con orderId verificado.
      await new Promise((r) => setTimeout(r, 600));
      setSubmitted(true);
      onSubmitted?.();
    } catch {
      setError("No pudimos enviar tu reseña. Intentá más tarde.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const ratingMeta = rating > 0 ? RATING_LABELS[rating] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--text-primary)]/50 backdrop-blur-sm motion-safe:animate-[fadeIn_0.2s]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-[var(--surface-raised)] shadow-2xl overflow-hidden border-2 border-[var(--rule-base)] motion-safe:animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="p-10 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
              <CheckCircle2 className="h-10 w-10" strokeWidth={2} />
            </div>
            <h3 className="mt-5 text-2xl font-black tracking-tight text-[var(--text-primary)]">
              ¡Gracias por tu reseña!
            </h3>
            <p className="mt-2 text-base text-[var(--text-secondary)] max-w-md mx-auto">
              Tu opinión ayuda a otros vecinos de Ciudad Constitución a comprar mejor.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 h-12 px-8 rounded-2xl bg-[var(--accent)] text-base font-bold text-white hover:opacity-95 active:scale-[0.98] transition-all shadow-md"
            >
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <header className="px-6 py-5 border-b-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--accent)]/5 to-transparent">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)]/10 shrink-0">
                    <Heart className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="review-modal-title"
                      className="text-xl font-black tracking-tight text-[var(--text-primary)]"
                    >
                      Compartí tu opinión
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] truncate">
                      Sobre <span className="font-bold text-[var(--text-primary)]">{productName}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 w-9 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </div>
            </header>

            <div className="px-6 py-5 space-y-5 max-h-[calc(100dvh-16rem)] overflow-y-auto">
              {/* Rating — estrellas grandes con feedback */}
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 text-center">
                <p className="text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                  ¿Qué tal te pareció?
                </p>
                <div className="flex justify-center mb-2">
                  <RatingStars
                    value={rating}
                    onChange={setRating}
                    mode="input"
                    size="lg"
                    label="Calificación del producto"
                  />
                </div>
                <p
                  className={`text-base font-bold min-h-[1.5rem] transition-colors ${
                    ratingMeta ? ratingMeta.color : "text-[var(--text-tertiary)]"
                  }`}
                >
                  {ratingMeta ? ratingMeta.label : "Tocá las estrellas para calificar"}
                </p>
              </div>

              {/* Body con prompt chips */}
              <div>
                <label
                  htmlFor="rv-body"
                  className="block text-base font-bold text-[var(--text-primary)] mb-2"
                >
                  Contanos cómo te fue
                </label>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  Tocá una idea para empezar, o escribí lo que querás:
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {PROMPT_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => insertPrompt(chip)}
                      className="inline-flex items-center px-3 h-9 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/5 active:scale-95 transition-all"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={bodyRef}
                  id="rv-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  maxLength={1000}
                  placeholder="Por ejemplo: 'Llegó en 20 min, todo bien empacado. La señora del local fue super amable. Volvería a pedir.'"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] outline-none resize-none transition-colors"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Mínimo 10 caracteres
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
                    {body.length} / 1000
                  </p>
                </div>
              </div>

              {/* Photos — más grande y cálido */}
              <div>
                <p className="block text-base font-bold text-[var(--text-primary)] mb-2">
                  Subí fotos <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span>
                </p>
                <p className="text-sm text-[var(--text-secondary)] inline-flex items-center gap-1.5 mb-3">
                  <ImageIcon className="h-4 w-4" />
                  Las fotos generan más confianza · Hasta {MAX_PHOTOS} fotos · {MAX_FILE_SIZE_MB}MB c/u
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative h-24 w-24 rounded-2xl overflow-hidden border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.previewUrl}
                        alt="Foto de la reseña"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        aria-label="Eliminar foto"
                        className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--text-primary)]/80 text-white hover:bg-[var(--text-primary)] transition-colors shadow-md"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-24 w-24 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] flex flex-col items-center justify-center gap-1 text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/5 active:scale-95 transition-all"
                      aria-label="Agregar foto"
                    >
                      <Camera className="h-6 w-6" strokeWidth={2} />
                      <span className="text-xs font-bold">
                        Agregar
                      </span>
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
                <label
                  htmlFor="rv-name"
                  className="block text-base font-bold text-[var(--text-primary)] mb-2"
                >
                  ¿Cómo te llamamos?
                </label>
                <input
                  id="rv-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Tu nombre o como te conocen"
                  className="w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] outline-none transition-colors"
                />
              </div>

              {error && (
                <p className="rounded-2xl bg-[var(--data-error-600)]/10 border-2 border-[var(--data-error-600)]/30 text-[var(--data-error-700)] px-4 py-3 text-sm font-semibold">
                  {error}
                </p>
              )}
            </div>

            <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="h-12 px-5 rounded-2xl text-base font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-[var(--accent)] text-base font-bold text-white shadow-md hover:opacity-95 hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <Send className="h-5 w-5" strokeWidth={2.5} />
                {submitting ? "Enviando…" : "Publicar reseña"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
