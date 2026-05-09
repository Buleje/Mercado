"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Star, Send, CheckCircle, Truck } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { csrfHeaders } from "@/lib/csrf-client";

export default function CalificarEntregaPage() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("id") ?? "";

  const [stars, setStars] = useState(0);
  const [hoverStars, setHoverStars] = useState(0);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error" | "already">("idle");

  const handleSubmit = async () => {
    if (!stars || !assignmentId) return;
    setStatus("sending");

    try {
      const res = await fetch("/api/delivery/rate", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ assignmentId, stars, comment: comment.trim() || undefined }),
      });

      if (res.status === 409) {
        setStatus("already");
        return;
      }

      if (!res.ok) {
        setStatus("error");
        return;
      }

      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  if (!assignmentId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-sunken)] p-4">
        <div className="text-center">
          <Truck className="mx-auto h-12 w-12 text-[var(--text-tertiary)] mb-4" />
          <p className="text-[var(--text-tertiary)]">Enlace de calificación inválido.</p>
          <Link href="/marketplace" className="text-primary text-sm hover:underline mt-2 inline-block">
            Ir al marketplace
          </Link>
        </div>
      </div>
    );
  }

  if (status === "done" || status === "already") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-sunken)] p-4">
        <div className="max-w-md w-full text-center bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
            {status === "already" ? "Ya calificaste esta entrega" : "¡Gracias por tu calificación!"}
          </h2>
          <p className="text-[var(--text-tertiary)] text-sm">
            {status === "already"
              ? "Esta entrega ya fue calificada anteriormente."
              : "Tu opinión nos ayuda a mejorar el servicio de delivery."}
          </p>
          <Link
            href="/marketplace"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition"
          >
            Volver al marketplace
          </Link>
        </div>
      </div>
    );
  }

  const displayStars = hoverStars || stars;
  const labels = ["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-sunken)] p-4">
      <div className="max-w-md w-full bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Truck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">¿Cómo fue tu entrega?</h1>
          <p className="text-[var(--text-tertiary)] text-sm mt-1">Tu opinión ayuda a que el servicio mejore.</p>
        </div>

        {/* Stars */}
        <div className="flex justify-center gap-2 mb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStars(n)}
              onMouseEnter={() => setHoverStars(n)}
              onMouseLeave={() => setHoverStars(0)}
              className="p-1 transition-transform hover:scale-110"
              aria-label={`${n} estrellas`}
            >
              <Star
                className={cn(
                  "h-10 w-10 transition-colors",
                  n <= displayStars
                    ? "fill-amber-400 text-amber-400"
                    : "text-gray-200"
                )}
              />
            </button>
          ))}
        </div>
        <p className="text-center text-sm font-medium text-[var(--text-tertiary)] h-5 mb-4">
          {displayStars ? labels[displayStars] : "Toca una estrella"}
        </p>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="¿Algún comentario? (opcional)"
          maxLength={500}
          rows={3}
          className="w-full rounded-xl border border-gray-200 bg-[var(--surface-sunken)] px-4 py-3 text-sm placeholder:text-[var(--text-tertiary)] focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none"
        />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!stars || status === "sending"}
          className={cn(
            "mt-4 w-full flex items-center justify-center gap-2 rounded-full py-3 text-sm font-bold transition",
            stars
              ? "bg-primary text-white hover:bg-primary-dark"
              : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
          )}
        >
          {status === "sending" ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Enviar calificación
            </>
          )}
        </button>

        {status === "error" && (
          <p className="mt-3 text-center text-sm text-[var(--data-error-500)]">
            Hubo un error. Intenta de nuevo.
          </p>
        )}
      </div>
    </div>
  );
}
