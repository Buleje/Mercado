"use client";

/**
 * StoreReviewsAdminModule — moderación de reseñas para el bodeguero.
 *
 * Permite:
 *   - Filtrar por status (pending | approved | rejected | hidden | all)
 *   - Aprobar / rechazar / ocultar
 *   - Responder con adminReply (visible al cliente)
 *
 * Consume /api/admin/store-reviews (GET, PATCH).
 */

import { useEffect, useState } from "react";
import {
  Star,
  CheckCircle2,
  XCircle,
  EyeOff,
  MessageSquare,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

type Status = "pending" | "approved" | "rejected" | "hidden" | "all";

interface AdminReview {
  id: string;
  name: string;
  location: string;
  text: string;
  rating: number;
  phone: string | null;
  status: "pending" | "approved" | "rejected" | "hidden";
  date: string;
  adminReply: string | null;
  adminReplyDate: string | null;
  storeId: string | null;
}

interface ApiResponse {
  data: AdminReview[];
  counts: Record<string, number>;
}

const STATUS_LABEL: Record<Status, string> = {
  pending:  "Pendientes",
  approved: "Publicadas",
  rejected: "Rechazadas",
  hidden:   "Ocultas",
  all:      "Todas",
};

const STATUS_COLORS: Record<AdminReview["status"], string> = {
  pending:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-rose-100 text-[var(--data-error-500)] dark:bg-rose-900/30 dark:text-[var(--data-error-500)]",
  hidden:   "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function StarsDisplay({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("h-3.5 w-3.5", n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300 dark:text-gray-700")}
          strokeWidth={1.5}
          aria-hidden
        />
      ))}
    </span>
  );
}

function ReplyBox({ review, onReplied }: { review: AdminReview; onReplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(review.adminReply ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (reply.trim().length < 1) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/store-reviews", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: review.id, action: "reply", reply: reply.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onReplied();
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open && !review.adminReply) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline"
      >
        <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Responder
      </button>
    );
  }
  if (!open && review.adminReply) {
    return (
      <div className="rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)]/20 p-3">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)] mb-1">
          Tu respuesta · {review.adminReplyDate ? new Date(review.adminReplyDate).toLocaleDateString("es-PE") : ""}
        </p>
        <p className="text-sm text-[var(--text-primary)]">{review.adminReply}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] hover:underline"
        >
          Editar respuesta
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Gracias por tu reseña…"
        className="w-full rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
      />
      {err && <p className="text-xs text-[var(--data-error-500)]">{err}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || reply.trim().length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-600,var(--accent))] text-white text-xs font-bold hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
          {review.adminReply ? "Actualizar" : "Publicar respuesta"}
        </button>
      </div>
    </div>
  );
}

export default function StoreReviewsAdminModule() {
  const [status, setStatus] = useState<Status>("pending");
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = async (s: Status) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store-reviews?status=${s}&limit=50`, { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as ApiResponse;
      setReviews(json.data);
      setCounts(json.counts ?? {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(status); }, [status]);

  const act = async (id: string, action: "approve" | "reject" | "hide") => {
    setActing(id);
    try {
      const res = await fetch("/api/admin/store-reviews", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await load(status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[var(--text-primary)]">Reseñas de tu tienda</h2>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Aprobá las que querés publicar, ocultá las que no, respondé a tus clientes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(status)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--surface-sunken)]"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} strokeWidth={2} />
          Refrescar
        </button>
      </header>

      {/* Status tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-1 overflow-x-auto">
        {(["pending", "approved", "rejected", "hidden", "all"] as Status[]).map((s) => {
          const count = s === "all"
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : counts[s] ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap",
                status === s
                  ? "bg-[var(--accent-600,var(--accent))] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
              )}
            >
              {STATUS_LABEL[s]} {count > 0 && <span className="opacity-70 tabular-nums">· {count}</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/30 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] shrink-0 mt-0.5" strokeWidth={2} />
          <p className="text-sm text-[var(--text-primary)]">{error}</p>
        </div>
      )}

      {loading && reviews.length === 0 && (
        <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm font-bold">Cargando reseñas…</span>
        </div>
      )}

      {!loading && reviews.length === 0 && !error && (
        <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-8 text-center">
          <p className="text-sm font-bold text-[var(--text-primary)]">Sin reseñas en esta categoría</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Cuando los clientes dejen reseñas, aparecerán acá para que las moderes.
          </p>
        </div>
      )}

      {/* Reviews list */}
      <ul className="space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-[var(--text-primary)] truncate">{r.name}</span>
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider", STATUS_COLORS[r.status])}>
                    {r.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                  <StarsDisplay rating={r.rating} />
                  <span className="tabular-nums">{new Date(r.date).toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" })}</span>
                  {r.location && <span>· {r.location}</span>}
                  {r.phone && <span className="font-mono">· {r.phone}</span>}
                </div>
              </div>
            </div>

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4 whitespace-pre-wrap">{r.text}</p>

            <ReplyBox review={r} onReplied={() => load(status)} />

            <div className="mt-3 pt-3 border-t border-[var(--rule-soft)] flex flex-wrap items-center gap-2">
              {r.status !== "approved" && (
                <button
                  type="button"
                  onClick={() => act(r.id, "approve")}
                  disabled={acting === r.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-success-600)] text-white text-xs font-bold hover:bg-[var(--data-success-700)] disabled:opacity-40"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Aprobar
                </button>
              )}
              {r.status !== "rejected" && (
                <button
                  type="button"
                  onClick={() => act(r.id, "reject")}
                  disabled={acting === r.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-40"
                >
                  <XCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Rechazar
                </button>
              )}
              {r.status !== "hidden" && (
                <button
                  type="button"
                  onClick={() => act(r.id, "hide")}
                  disabled={acting === r.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] text-xs font-bold hover:bg-[var(--surface-sunken)] disabled:opacity-40"
                >
                  <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                  Ocultar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
