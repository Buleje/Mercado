"use client";

import { useState, useEffect, useCallback } from "react";
import { Star, CheckCircle, XCircle, MessageSquare } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { TableSkeleton, type ReviewItem } from "../types";

// ── Status config ────────────────────────────────────────────────────────────
const REVIEW_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:  { label: "Pendiente", className: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" },
  approved: { label: "Aprobada",  className: "bg-[var(--accent-soft)] text-[var(--data-success-500)]" },
  rejected: { label: "Rechazada", className: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" },
};

// ── Filter type ───────────────────────────────────────────────────────────────
type ReviewFilter =
  | "all"
  | "unreplied"
  | "pending"
  | "approved"
  | "rejected"
  | "5"
  | "4"
  | "3"
  | "2"
  | "1";

// ── Reply templates ───────────────────────────────────────────────────────────
const REPLY_TEMPLATES: Array<{
  id: string;
  label: string;
  ratingScope: number[];
  build: (r: ReviewItem) => string;
}> = [
  {
    id: "thanks",
    label: "Agradecer",
    ratingScope: [5, 4],
    build: (r) =>
      `Hola ${r.name?.split(" ")[0] || ""}, gracias por tu reseña 🙌. Nos motiva mucho que tu experiencia haya sido buena. ¡Te esperamos pronto!`,
  },
  {
    id: "feedback",
    label: "Agradecer feedback",
    ratingScope: [3, 4],
    build: (r) =>
      `Hola ${r.name?.split(" ")[0] || ""}, gracias por tomarte el tiempo de comentar. Tomamos nota para mejorar y esperamos verte de nuevo pronto.`,
  },
  {
    id: "apologize",
    label: "Disculparse",
    ratingScope: [2, 1],
    build: (r) =>
      `Hola ${r.name?.split(" ")[0] || ""}, lamentamos mucho que tu experiencia no fuera la esperada. Nos gustaría compensarte — escríbenos por WhatsApp para resolverlo.`,
  },
  {
    id: "promise",
    label: "Mejorar",
    ratingScope: [3, 2, 1],
    build: () =>
      `Apreciamos tu sinceridad. Estamos ajustando lo que mencionas y volveremos a estar a la altura en tu próxima visita.`,
  },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function ResenasTab() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const loadReviews = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    // TODO: pasar ?storeId=${storeId} cuando el endpoint acepte el param
    fetch("/api/reviews?all=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ReviewItem[]) => {
        if (cancelled) return;
        const storeReviews = data.filter((r) => r.storeId);
        setReviews(storeReviews);
      })
      .catch((err) => { if (!cancelled) console.warn("[ResenasTab] fetch failed", err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return loadReviews(); }, [loadReviews]);

  const handleStatusChange = async (id: string, status: string) => {
    setSaving(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      }
    } catch { /* silencioso */ }
    setSaving(null);
  };

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/reviews/${id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminReply: replyText.trim() }),
      });
      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, adminReply: replyText.trim(), adminReplyDate: new Date().toISOString() }
              : r,
          ),
        );
        setReplyingTo(null);
        setReplyText("");
      }
    } catch { /* silencioso */ }
    setSaving(null);
  };

  // Derived counts
  const pendingCount   = reviews.filter((r) => r.status === "pending").length;
  const unrepliedCount = reviews.filter((r) => !r.adminReply || r.adminReply.trim() === "").length;
  const ratingCount    = (n: number) => reviews.filter((r) => r.rating === n).length;
  const avgRating      = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  const filtered = (() => {
    switch (filter) {
      case "all":       return reviews;
      case "unreplied": return reviews.filter((r) => !r.adminReply || r.adminReply.trim() === "");
      case "pending":
      case "approved":
      case "rejected":  return reviews.filter((r) => r.status === filter);
      default:          return reviews.filter((r) => r.rating === Number(filter));
    }
  })();

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-5">
      {/* Summary strip — KPI 4-up */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-primary">{reviews.length}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Total reseñas</p>
        </div>
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-[var(--data-warning-500)] flex items-center justify-center gap-1">
            <Star className="h-5 w-5 fill-[var(--data-warning-500)]" />
            {avgRating > 0 ? avgRating.toFixed(1) : "—"}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Rating promedio</p>
        </div>
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-[var(--data-error-500)]">{unrepliedCount}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Sin responder</p>
        </div>
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-3 text-center">
          <p className="text-2xl font-extrabold text-[var(--data-warning-500)]">{pendingCount}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Por moderar</p>
        </div>
      </div>

      {/* Distribución por rating */}
      {reviews.length > 0 && (
        <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
          <p className="text-xs font-bold text-[var(--text-secondary)] mb-2">Distribución por rating</p>
          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingCount(star);
              const pct   = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-0.5 w-12 text-[var(--text-secondary)] font-semibold">
                    {star} <Star className="h-3 w-3 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" />
                  </span>
                  <div className="flex-1 h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        star >= 4 ? "bg-[var(--data-success-500)]"
                        : star === 3 ? "bg-[var(--data-warning-500)]"
                        : "bg-[var(--data-error-500)]",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-[var(--text-secondary)] font-semibold">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chips de filtro — fila 1 estados, fila 2 ratings */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "unreplied", "pending", "approved", "rejected"] as const).map((f) => {
            const labels: Record<typeof f, string> = {
              all:       `Todas (${reviews.length})`,
              unreplied: `Sin responder (${unrepliedCount})`,
              pending:   `Pendientes (${pendingCount})`,
              approved:  `Aprobadas (${reviews.filter((r) => r.status === "approved").length})`,
              rejected:  `Rechazadas (${reviews.filter((r) => r.status === "rejected").length})`,
            };
            const isWarning = f === "unreplied" && unrepliedCount > 0;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                  filter === f
                    ? "bg-primary text-white"
                    : isWarning
                    ? "bg-[var(--data-error-50)] text-[var(--data-error-500)] hover:brightness-95"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]",
                )}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-[var(--text-secondary)] self-center mr-1">Por rating:</span>
          {([5, 4, 3, 2, 1] as const).map((star) => (
            <button
              key={star}
              onClick={() => setFilter(String(star) as ReviewFilter)}
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                filter === String(star)
                  ? "bg-primary text-white"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]",
              )}
            >
              {star}
              <Star
                className={cn(
                  "h-3 w-3",
                  filter === String(star) ? "fill-white" : "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]",
                )}
              />
              <span className="ml-0.5 opacity-70">({ratingCount(star)})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-8 text-[var(--text-tertiary)]">
          <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No hay reseñas {filter !== "all" ? "con este filtro" : "todavía"}</p>
        </div>
      )}

      {/* Review list */}
      <div className="space-y-3">
        {filtered.map((review) => {
          const cfg = REVIEW_STATUS_CONFIG[review.status] ?? REVIEW_STATUS_CONFIG.pending;
          return (
            <div key={review.id} className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
              {/* Header: name, stars, status badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-[var(--text-primary)] truncate">
                      {review.name || "Anónimo"}
                    </span>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", cfg.className)}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={cn(
                          "h-3.5 w-3.5",
                          s <= review.rating
                            ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                            : "text-gray-200",
                        )}
                      />
                    ))}
                    <span className="text-xs text-[var(--text-tertiary)] ml-1">
                      {new Date(review.date).toLocaleDateString("es-PE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {review.status !== "approved" && (
                    <button
                      onClick={() => handleStatusChange(review.id, "approved")}
                      disabled={saving === review.id}
                      className="p-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] transition-colors"
                      title="Aprobar"
                    >
                      <CheckCircle className="h-4 w-4" />
                    </button>
                  )}
                  {review.status !== "rejected" && (
                    <button
                      onClick={() => handleStatusChange(review.id, "rejected")}
                      disabled={saving === review.id}
                      className="p-1.5 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error-500)] hover:bg-[var(--data-error-100)] transition-colors"
                      title="Rechazar"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setReplyingTo(replyingTo === review.id ? null : review.id);
                      setReplyText(review.adminReply ?? "");
                    }}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      replyingTo === review.id
                        ? "bg-primary/20 text-primary"
                        : "bg-[var(--surface-alt)] text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]",
                    )}
                    title="Responder"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Review text */}
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{review.text}</p>

              {/* Existing admin reply */}
              {review.adminReply && replyingTo !== review.id && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                  <p className="text-xs font-bold text-primary mb-1">Tu respuesta:</p>
                  <p className="text-xs text-[var(--text-primary)]">{review.adminReply}</p>
                </div>
              )}

              {/* Reply form con plantillas contextuales */}
              {replyingTo === review.id && (
                <div className="space-y-2">
                  {(() => {
                    const applicable = REPLY_TEMPLATES.filter((t) =>
                      t.ratingScope.includes(review.rating),
                    );
                    if (applicable.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-[var(--text-secondary)] font-semibold">
                          Plantilla:
                        </span>
                        {applicable.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setReplyText(t.build(review))}
                            className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition"
                          >
                            {t.label}
                          </button>
                        ))}
                        <button
                          onClick={() => setReplyText("")}
                          className="px-2 py-1 rounded-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition"
                        >
                          limpiar
                        </button>
                      </div>
                    );
                  })()}
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escribe tu respuesta al cliente..."
                    rows={3}
                    className="w-full rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {replyText.length} caracteres
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setReplyingTo(null); setReplyText(""); }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-xs font-bold hover:bg-[var(--rule-soft)] transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleReply(review.id)}
                        disabled={saving === review.id || !replyText.trim()}
                        className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
                      >
                        {saving === review.id ? "Guardando..." : "Enviar respuesta"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
