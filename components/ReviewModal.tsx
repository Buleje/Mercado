"use client";

import { useState, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import { X, Star, Send, Pencil } from "lucide-react";
import { useReviews } from "@/contexts/reviews-context";
import { useScrollLock } from "@/hooks/use-scroll-lock";

const PRESETS: Record<"critical" | "neutral" | "positive", string[]> = {
  critical: [
    "El servicio tuvo inconvenientes esta vez. Espero que mejoren.",
    "Algunos productos no llegaron frescos. Es importante mejorar la calidad.",
    "La atención puede mejorar. Tuve que insistir varias veces con mi pedido.",
    "Los productos no coincidían con lo que pedí. Necesita más cuidado.",
    "Esta vez no quedé conforme, pero le daré otra oportunidad.",
  ],
  neutral: [
    "El servicio fue aceptable, aunque hay aspectos que podrían mejorar.",
    "Los productos llegaron bien, pero la entrega tardó más de lo esperado.",
    "Experiencia normal. Espero que mejore en futuros pedidos.",
    "Está bien por ahora. La atención fue correcta pero no excepcional.",
    "Servicio correcto. Con algunas mejoras sería excelente.",
  ],
  positive: [
    "Excelente servicio, los productos llegaron frescos y a tiempo. Muy recomendado.",
    "Todo perfecto, la atención fue muy amable y el pedido llegó completo.",
    "Precios justos y productos de calidad. Sin duda volveré a pedir.",
    "Súper rápido el delivery. Los productos venían muy frescos.",
    "Me encantó la facilidad de pedir por WhatsApp. Muy conveniente.",
  ],
};

function getRatingTier(r: number): "critical" | "neutral" | "positive" {
  if (r <= 2) return "critical";
  if (r === 3) return "neutral";
  return "positive";
}

const STAR_LABELS = ["", "Malo", "Regular", "Bueno", "Muy bueno", "Excelente"];

export default function ReviewModal() {
  const { reviewModal, closeReviewModal, addReview } = useReviews();
  const [rating, setRating] = useState(5);
  const [hovered, setHovered] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customText, setCustomText] = useState("");
  const [published, setPublished] = useState(false);
  const [textareaFocused, setTextareaFocused] = useState(false);
  const [promptPulse, setPromptPulse] = useState(false);

  // Start pulse timer when modal opens; clear it (and the flag) on close
  useEffect(() => {
    if (!reviewModal.open) return;
    const t = setTimeout(() => setPromptPulse(true), 2000);
    return () => {
      clearTimeout(t);
      setPromptPulse(false);
    };
  }, [reviewModal.open]);

  useScrollLock(reviewModal.open);

  if (!reviewModal.open) return null;

  const customerName = reviewModal.customerName;
  const customerLocation = reviewModal.customerLocation;
  const tier = getRatingTier(rating);
  const currentPresets = PRESETS[tier];
  const activeText = selectedPreset !== null ? currentPresets[selectedPreset] : customText;
  const canPublish = activeText.trim().length >= 10 && rating >= 1;

  const handleRatingChange = (n: number) => {
    if (getRatingTier(n) !== tier) setSelectedPreset(null);
    setRating(n);
  };

  const handlePreset = (idx: number) => {
    setSelectedPreset(idx);
    setCustomText("");
    setPromptPulse(false);
  };

  const handleCustomChange = (val: string) => {
    setCustomText(val);
    setSelectedPreset(null);
    setPromptPulse(false);
  };

  const handlePublish = async () => {
    if (!canPublish) return;
    addReview({ name: customerName, location: customerLocation, text: activeText.trim(), rating });
    // Persist to backend
    try {
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: customerName, location: customerLocation, text: activeText.trim(), rating }),
      });
    } catch { /* non-critical — review saved locally */ }
    setPublished(true);
    setTimeout(() => {
      closeReviewModal();
      setPublished(false);
      const el = document.getElementById("nuestros-clientes");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 3000);
  };

  const selectedStyle =
    tier === "critical"
      ? "border-red-400 bg-red-50 text-red-700 font-medium"
      : tier === "neutral"
      ? "border-amber-400 bg-amber-50 text-amber-700 font-medium"
      : "border-primary bg-primary/8 text-primary font-medium";

  const labelColor =
    tier === "critical" ? "text-red-500" : "text-amber-500";

  return (
    <AnimatePresence>
      <>
        {/* Overlay */}
        <m.div
          key="review-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={published ? undefined : closeReviewModal}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          style={{ zIndex: 9000 }}
        />

        {/* Modal */}
        <m.div
          key="review-modal"
          initial={{ opacity: 0, scale: 0.88, y: 28 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.88, y: 28 }}
          transition={{ type: "spring", damping: 26, stiffness: 310 }}
          className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
          style={{ zIndex: 9001 }}
        >
          <div className="pointer-events-auto w-full max-w-md bg-white dark:bg-background rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ background: "linear-gradient(90deg, #245c43, #2d6a4f, #245c43)" }}>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
                  <span className="text-xl">⭐</span>
                </div>
                <div>
                  <p className="font-bold text-white text-base leading-tight">¿Cómo fue tu experiencia?</p>
                  <p className="text-white/55 text-xs">{customerName}</p>
                </div>
              </div>
              {!published && (
                <button
                  onClick={closeReviewModal}
                  className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5 text-white/80" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {published ? (
                <m.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center gap-4 py-8 text-center"
                >
                  <m.div
                    animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.6 }}
                    className="text-6xl"
                  >
                    🎉
                  </m.div>
                  <p className="text-xl font-extrabold text-primary">¡Gracias por tu opinion!</p>
                  <p className="text-sm text-muted">Tu reseña ya aparece en la seccion de clientes.</p>
                </m.div>
              ) : (
                <>
                  {/* Stars */}
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2">Tu calificación</p>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <m.button
                          key={n}
                          onMouseEnter={() => setHovered(n)}
                          onMouseLeave={() => setHovered(0)}
                          onClick={() => handleRatingChange(n)}
                          whileHover={{ scale: 1.25 }}
                          whileTap={{ scale: 0.85 }}
                          aria-label={`${n} estrella${n !== 1 ? "s" : ""}`}
                        >
                          <Star
                            className="h-9 w-9 transition-colors"
                            fill={(hovered || rating) >= n ? "#FBBF24" : "none"}
                            color={(hovered || rating) >= n ? "#FBBF24" : "#D1D5DB"}
                          />
                        </m.button>
                      ))}
                      <AnimatePresence mode="wait">
                        <m.span
                          key={`lbl-${hovered || rating}`}
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          transition={{ duration: 0.14 }}
                          className={`ml-2 text-sm font-bold ${labelColor}`}
                        >
                          {STAR_LABELS[hovered || rating]}
                        </m.span>
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Preset messages — slide in/out when tier changes */}
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2">
                      Selecciona un mensaje o escribe el tuyo
                    </p>
                    <AnimatePresence mode="wait">
                      <m.div
                        key={tier}
                        initial={{ opacity: 0, x: 22 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -22 }}
                        transition={{ duration: 0.22 }}
                        className="space-y-2"
                      >
                        {currentPresets.map((msg, idx) => (
                          <m.button
                            key={idx}
                            onClick={() => handlePreset(idx)}
                            whileHover={{ x: 4 }}
                            whileTap={{ scale: 0.98 }}
                            className={`w-full text-left text-sm px-4 py-3 rounded-xl border transition-all leading-relaxed ${
                              selectedPreset === idx
                                ? selectedStyle
                                : "border-gray-200 hover:border-primary/40 hover:bg-primary/4 text-foreground"
                            }`}
                          >
                            {msg}
                          </m.button>
                        ))}
                      </m.div>
                    </AnimatePresence>
                  </div>

                  {/* Custom text — animated to attract attention */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-semibold text-foreground">O escribe tu propio mensaje</p>
                      <AnimatePresence>
                        {promptPulse && (
                          <m.span
                            key="pencil-icon"
                            initial={{ opacity: 0, scale: 0, rotate: -20 }}
                            animate={{
                              opacity: 1,
                              scale: [1, 1.3, 1, 1.3, 1],
                              rotate: [-8, 8, -8, 8, 0],
                            }}
                            exit={{ opacity: 0, scale: 0 }}
                            transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.1 }}
                            className="text-primary"
                          >
                            <Pencil className="h-4 w-4" />
                          </m.span>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Pulsing glow wrapper */}
                    <m.div
                      animate={
                        promptPulse && !textareaFocused
                          ? {
                              boxShadow: [
                                "0 0 0 0px rgba(45,106,79,0)",
                                "0 0 0 5px rgba(45,106,79,0.22)",
                                "0 0 0 0px rgba(45,106,79,0)",
                              ],
                            }
                          : { boxShadow: "0 0 0 0px rgba(45,106,79,0)" }
                      }
                      transition={{
                        duration: 1.5,
                        repeat: promptPulse && !textareaFocused ? Infinity : 0,
                        ease: "easeInOut",
                      }}
                      className="rounded-xl"
                    >
                      <textarea
                        value={customText}
                        onChange={(e) => handleCustomChange(e.target.value)}
                        onFocus={() => setTextareaFocused(true)}
                        onBlur={() => setTextareaFocused(false)}
                        placeholder="Cuéntanos tu experiencia con Bodega San Martín…"
                        rows={3}
                        maxLength={240}
                        className={`w-full rounded-xl border px-4 py-3 text-sm text-foreground resize-none outline-none transition-all leading-relaxed ${
                          textareaFocused
                            ? "border-primary ring-2 ring-primary/20 shadow-sm"
                            : selectedPreset === null && customText
                            ? "border-primary ring-1 ring-primary/30"
                            : promptPulse
                            ? "border-primary/60 bg-primary/2"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      />
                    </m.div>
                    <p className="text-xs text-muted text-right mt-1">{customText.length}/240</p>
                  </div>

                  {/* Preview */}
                  {activeText.trim().length >= 10 && (
                    <m.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-primary/5 border border-primary/15 px-4 py-3 space-y-1.5"
                    >
                      <p className="text-xs font-bold text-primary uppercase tracking-wide">Vista previa</p>
                      <p className="text-sm text-foreground leading-relaxed">{activeText.trim()}</p>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className="h-3.5 w-3.5" fill={n <= rating ? "#FBBF24" : "none"} color={n <= rating ? "#FBBF24" : "#D1D5DB"} />
                        ))}
                      </div>
                      <p className="text-xs text-muted font-medium">{customerName} · {customerLocation}</p>
                    </m.div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!published && (
              <div className="px-6 pb-5 pt-2 shrink-0 border-t border-gray-100">
                <m.button
                  onClick={handlePublish}
                  disabled={!canPublish}
                  whileHover={{ scale: canPublish ? 1.02 : 1 }}
                  whileTap={{ scale: canPublish ? 0.97 : 1 }}
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="h-5 w-5" />
                  Publicar mi opinion
                </m.button>
              </div>
            )}
          </div>
        </m.div>
      </>
    </AnimatePresence>
  );
}
