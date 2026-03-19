"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Star, Send, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "bsm_beta_feedback_done";

export default function BetaFeedbackWidget() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Defer mount to avoid hydration mismatch + check if already submitted
  useEffect(() => {
    const already = typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
    // Show widget 6 seconds after page loads (non-intrusive). Skip if already submitted.
    if (already) return;
    const t = setTimeout(() => setMounted(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!mounted) return null;

  const handleSubmit = async () => {
    if (rating === 0 || sending) return;
    setSending(true);
    try {
      await fetch("/api/beta-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() }),
      });
    } catch { /* silent — don't block the user if the request fails */ }
    localStorage.setItem(STORAGE_KEY, "1");
    setSent(true);
    setSending(false);
    setTimeout(() => {
      setMounted(false);
      setOpen(false);
    }, 2500);
  };

  const labels = ["", "Muy mala", "Mala", "Regular", "Buena", "Excelente"];

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 flex flex-col items-end gap-2">
      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="w-72 rounded-2xl bg-white dark:bg-card border border-gray-200 dark:border-card-border shadow-2xl overflow-hidden animate-[fadeDown_0.2s_ease-out]"
          role="dialog"
          aria-modal="true"
          aria-label="Widget de feedback beta"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-linear-to-r from-indigo-600 to-violet-600 text-white">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm font-bold">Feedback Beta</span>
              <span className="rounded-full px-1.5 py-0.5 bg-amber-400/30 text-amber-200 text-[9px] font-bold">v1 Beta</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Cerrar feedback"
              className="h-6 w-6 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {sent ? (
            /* Thank you state */
            <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="font-bold text-foreground">¡Gracias por tu feedback!</p>
              <p className="text-xs text-muted">Tu opinión ayuda a mejorar el proyecto.</p>
            </div>
          ) : (
            /* Form */
            <div className="px-4 py-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">¿Cómo calificarías la experiencia?</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHovered(n)}
                      onMouseLeave={() => setHovered(0)}
                      aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
                      className="p-0.5 transition-transform hover:scale-110"
                    >
                      <Star
                        className={cn(
                          "h-7 w-7 transition-colors",
                          (hovered || rating) >= n
                            ? "fill-amber-400 text-amber-400"
                            : "fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700"
                        )}
                      />
                    </button>
                  ))}
                </div>
                {(hovered || rating) > 0 && (
                  <p className="text-xs text-muted mt-1">{labels[hovered || rating]}</p>
                )}
              </div>

              <div>
                <label htmlFor="beta-feedback-comment" className="text-sm font-semibold text-foreground block mb-1">
                  Comentario (opcional)
                </label>
                <textarea
                  id="beta-feedback-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="¿Qué mejorarías o qué te gustó?"
                  className="w-full rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={rating === 0 || sending}
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all",
                  rating > 0
                    ? "bg-primary text-white hover:bg-primary/90 shadow-md"
                    : "bg-gray-100 dark:bg-surface text-muted cursor-not-allowed"
                )}
              >
                {sending ? (
                  <span className="h-4 w-4 rounded-full border-2 border-white/50 border-t-white animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Enviando..." : "Enviar feedback"}
              </button>

              <p className="text-[10px] text-muted text-center">
                Tus datos son anónimos · No aparece en ningún perfil público
              </p>
            </div>
          )}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Abrir feedback de la beta"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 rounded-full pl-3.5 pr-4 py-2.5 text-sm font-bold shadow-lg transition-all hover:scale-105 active:scale-95",
          open
            ? "bg-gray-800 dark:bg-gray-700 text-white"
            : "bg-linear-to-r from-indigo-600 to-violet-600 text-white"
        )}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
        <span className="rounded-full px-1.5 py-0.5 bg-amber-400/30 text-amber-200 text-[9px] font-bold">
          Beta
        </span>
      </button>
    </div>
  );
}
