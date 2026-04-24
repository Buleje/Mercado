"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Star, Send, CheckCircle2, Camera, Image as ImageIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

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

export default function WriteReviewModal({
  open,
  onClose,
  productId: _productId,
  productName,
  onSubmitted,
}: WriteReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [photos, setPhotos] = useState<ReviewPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoAdd = useCallback((files: FileList | null) => {
    if (!files) return;
    setError(null);
    const newPhotos: ReviewPhoto[] = [];
    for (let i = 0; i < files.length; i++) {
      if (photos.length + newPhotos.length >= MAX_PHOTOS) {
        setError(`Maximo ${MAX_PHOTOS} fotos por reseña`);
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

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => titleRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
    // Reset al cerrar — revoca URLs de preview para evitar leak
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setRating(0);
    setHover(0);
    setTitle("");
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
      setError("Elige tu puntuación en estrellas.");
      return;
    }
    if (!title.trim()) {
      setError("Escribe un título corto.");
      return;
    }
    if (body.trim().length < 10) {
      setError("Cuéntanos un poco más (mínimo 10 caracteres).");
      return;
    }
    if (!name.trim()) {
      setError("Ingresa tu nombre.");
      return;
    }

    setSubmitting(true);
    try {
      // Este endpoint hoy es mock; cuando integremos a reviews reales
      // enviamos POST a /api/marketplace/reviews con orderId verificado.
      await new Promise((r) => setTimeout(r, 600));
      setSubmitted(true);
      onSubmitted?.();
    } catch {
      setError("No pudimos enviar tu reseña. Intenta más tarde.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
              ¡Gracias por tu reseña!
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              La revisaremos y publicaremos en unos minutos.
            </p>
            <button
              onClick={onClose}
              className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark transition-colors"
            >
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2
                id="review-modal-title"
                className="text-lg font-bold text-gray-900 dark:text-white"
              >
                Escribir reseña
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="px-5 py-4 space-y-4 max-h-[calc(100vh-14rem)] overflow-y-auto">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Estás reseñando: <span className="font-medium text-gray-700 dark:text-gray-300">{productName}</span>
              </p>

              {/* Rating */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                  Tu calificación
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setRating(i)}
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(0)}
                      aria-label={`${i} estrellas`}
                      className="p-1"
                    >
                      <Star
                        className={cn(
                          "h-7 w-7 transition-colors",
                          (hover || rating) >= i
                            ? "text-amber-500 fill-amber-500"
                            : "text-gray-300 dark:text-gray-600",
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label
                  htmlFor="rv-title"
                  className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5"
                >
                  Título
                </label>
                <input
                  ref={titleRef}
                  id="rv-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="Resumen corto (ej. &ldquo;Llegó fresquito&rdquo;)"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                />
              </div>

              {/* Body */}
              <div>
                <label
                  htmlFor="rv-body"
                  className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5"
                >
                  Cuéntanos tu experiencia
                </label>
                <textarea
                  id="rv-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="¿Cómo te llegó? ¿Qué te gustó o mejorarías?"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-none"
                />
                <p className="mt-1 text-xs text-gray-400">{body.length} / 1000</p>
              </div>

              {/* Photos — upload con preview (feature NEW 2026-04-24) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                  Fotos (opcional, hasta {MAX_PHOTOS})
                </label>
                <div className="flex flex-wrap gap-2">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="relative h-20 w-20 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
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
                        className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-900/70 text-white hover:bg-gray-900 transition-colors"
                      >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-20 w-20 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-primary hover:text-primary transition-colors"
                      aria-label="Agregar foto"
                    >
                      <Camera className="h-5 w-5" strokeWidth={1.5} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">
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
                <p className="mt-1.5 text-xs text-gray-400 inline-flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" />
                  Las fotos dan más confianza (hasta {MAX_PHOTOS} · {MAX_FILE_SIZE_MB}MB c/u)
                </p>
              </div>

              {/* Name */}
              <div>
                <label
                  htmlFor="rv-name"
                  className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5"
                >
                  Tu nombre
                </label>
                <input
                  id="rv-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Ej. María Elena V."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-danger/10 text-danger px-3 py-2 text-xs font-medium">
                  {error}
                </p>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitting ? "Enviando…" : "Publicar reseña"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
