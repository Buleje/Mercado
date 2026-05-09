"use client";

import { useState, useEffect, useRef } from "react";
import { X, Send, CheckCircle2, MessageCircle } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

interface AskQuestionModalProps {
  open: boolean;
  onClose: () => void;
  productId: number;
  storeName: string;
  onSubmitted?: () => void;
}

export default function AskQuestionModal({
  open,
  onClose,
  productId,
  storeName,
  onSubmitted,
}: AskQuestionModalProps) {
  const [question, setQuestion] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
    setQuestion("");
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
    if (question.trim().length < 10) {
      setError("La pregunta necesita al menos 10 caracteres.");
      return;
    }
    if (!name.trim()) {
      setError("Ingresa tu nombre.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/marketplace/qa/${productId}`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          userName: name.trim(),
          question: question.trim(),
        }),
      });
      if (!res.ok) {
        throw new Error("submit failed");
      }
      setSubmitted(true);
      onSubmitted?.();
    } catch {
      setError("No pudimos enviar tu pregunta. Intenta más tarde.");
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
      aria-labelledby="ask-modal-title"
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
            <h3 className="mt-4 text-lg font-bold text-[var(--text-primary)] dark:text-white">
              Pregunta enviada
            </h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)] dark:text-gray-400">
              {storeName} recibirá tu consulta y responderá por este mismo canal.
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
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <h2
                  id="ask-modal-title"
                  className="text-lg font-bold text-[var(--text-primary)] dark:text-white"
                >
                  Hacer una pregunta
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] dark:hover:text-gray-200 hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-800 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-[var(--text-secondary)] dark:text-gray-400">
                Tu pregunta será visible públicamente. {storeName} y otros compradores podrán responder.
              </p>

              <div>
                <label
                  htmlFor="qa-q"
                  className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] dark:text-gray-400 mb-1.5"
                >
                  Pregunta
                </label>
                <textarea
                  ref={textareaRef}
                  id="qa-q"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Ej. ¿Hay delivery a Yarinacocha el mismo día?"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-[var(--surface-alt)] dark:bg-gray-950 text-sm text-[var(--text-primary)] dark:text-white placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-none"
                />
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">{question.length} / 500</p>
              </div>

              <div>
                <label
                  htmlFor="qa-name"
                  className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] dark:text-gray-400 mb-1.5"
                >
                  Tu nombre
                </label>
                <input
                  id="qa-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Ej. Ana L."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-[var(--surface-alt)] dark:bg-gray-950 text-sm text-[var(--text-primary)] dark:text-white placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-danger/10 text-danger px-3 py-2 text-xs font-medium">
                  {error}
                </p>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800 bg-[var(--surface-alt)] dark:bg-gray-950">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] dark:text-gray-400 hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitting ? "Enviando…" : "Publicar pregunta"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
