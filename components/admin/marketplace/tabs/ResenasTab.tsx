"use client";
import { cn } from "@/lib/utils";
import { useMarketplaceReviews } from "@/components/admin/marketplace/hooks/use-marketplace-reviews";
import { TableSkeleton, REVIEW_STATUS_CONFIG } from "@/components/admin/marketplace/shared";
import { CheckCircle, MessageSquare, Star, XCircle } from "@buleje/design-system/icons";

export function MarketplaceResenasTab() {
  const {
    reviews, filtered, loading, filter, setFilter,
    replyingTo, setReplyingTo, replyText, setReplyText,
    saving, pendingCount,
    handleStatusChange, handleReply,
  } = useMarketplaceReviews();

  if (loading) return <TableSkeleton />;

  // Métricas agregadas
  const total = reviews.length;
  const avg = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const approvedCount = reviews.filter((r) => r.status === "approved").length;
  const rejectedCount = reviews.filter((r) => r.status === "rejected").length;
  const responseRate = approvedCount > 0
    ? Math.round((reviews.filter((r) => r.status === "approved" && r.adminReply).length / approvedCount) * 100)
    : 0;

  // Distribución por estrellas (5,4,3,2,1)
  const distribution = [5, 4, 3, 2, 1].map((s) => {
    const count = reviews.filter((r) => r.rating === s).length;
    const pct = total > 0 ? (count / total) * 100 : 0;
    return { stars: s, count, pct };
  });

  // Iniciales avatar
  const initials = (name: string | null | undefined) => {
    const n = (name ?? "").trim();
    if (!n) return "?";
    return n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  };

  const filterMeta = {
    all: { label: "Todas", count: total },
    pending: { label: "Por moderar", count: pendingCount },
    approved: { label: "Aprobadas", count: approvedCount },
    rejected: { label: "Rechazadas", count: rejectedCount },
  } as const;

  return (
    <div className="space-y-6">
      {/* ── Hero: rating promedio + distribución ── */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-linear-to-br from-[var(--data-warning)]/5 via-white to-[var(--surface-sunken)] p-5 sm:p-6">
        <div className="absolute -top-20 -right-20 h-56 w-56 rounded-full bg-[var(--data-warning)]/10 blur-3xl pointer-events-none" />
        <div className="relative grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-6 items-center">
          {/* Promedio grande */}
          <div className="text-center sm:text-left sm:border-r sm:border-[var(--rule-base)] sm:pr-6">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Calificación promedio</p>
            <p className="mt-1 flex items-center gap-2 justify-center sm:justify-start">
              <span className="text-5xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none">
                {avg > 0 ? avg.toFixed(1) : "—"}
              </span>
              <span className="text-base font-bold text-[var(--text-tertiary)] tabular-nums">/ 5.0</span>
            </p>
            <div className="mt-2 flex items-center gap-0.5 justify-center sm:justify-start">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={cn(
                    "h-5 w-5",
                    s <= Math.round(avg)
                      ? "fill-[var(--data-warning)] text-[var(--data-warning)]"
                      : "text-[var(--rule-base)]"
                  )}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              <span className="font-bold text-[var(--text-primary)] tabular-nums">{total}</span> {total === 1 ? "reseña" : "reseñas"}
            </p>
          </div>

          {/* Distribución por estrellas */}
          <div className="space-y-1.5">
            {distribution.map(({ stars, count, pct }) => (
              <div key={stars} className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 w-8 font-bold text-[var(--text-secondary)] tabular-nums shrink-0">
                  {stars}
                  <Star className="h-3 w-3 fill-[var(--data-warning)] text-[var(--data-warning)]" />
                </span>
                <div className="flex-1 h-2 rounded-full bg-[var(--rule-soft)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--data-warning)] rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right font-bold text-[var(--text-tertiary)] tabular-nums shrink-0">{count}</span>
              </div>
            ))}
          </div>

          {/* Mini stats secundarias */}
          <div className="grid grid-cols-3 sm:grid-cols-1 gap-3 sm:gap-2 sm:border-l sm:border-[var(--rule-base)] sm:pl-6 sm:min-w-[140px]">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-warning)]">Por moderar</p>
              <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">{pendingCount}</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success)]">Aprobadas</p>
              <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">{approvedCount}</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary">Respondidas</p>
              <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">{responseRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filtros como chips grandes ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "pending", "approved", "rejected"] as const).map((f) => {
          const active = filter === f;
          const meta = filterMeta[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-center gap-2 h-10 px-4 rounded-xl border-2 text-sm font-bold transition-all",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-[var(--rule-base)] bg-white text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]"
              )}
            >
              {meta.label}
              <span className={cn(
                "tabular-nums text-xs font-bold px-1.5 py-0.5 rounded-md",
                active ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
              )}>
                {meta.count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 px-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-[var(--data-warning)]/10 text-[var(--data-warning)] mb-4">
            <Star className="h-6 w-6" />
          </div>
          <p className="text-base font-extrabold text-[var(--text-primary)]">
            {filter === "all" ? "Sin reseñas todavía" : `Sin reseñas ${filterMeta[filter].label.toLowerCase()}`}
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
            {filter === "all"
              ? "Cuando los clientes valoren tus productos, las reseñas aparecerán acá."
              : "Probá con otro filtro para ver más resultados."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => {
            const cfg = REVIEW_STATUS_CONFIG[review.status] ?? REVIEW_STATUS_CONFIG.pending;
            const isReplying = replyingTo === review.id;
            const hasReply = !!review.adminReply;
            return (
              <div
                key={review.id}
                className={cn(
                  "relative overflow-hidden rounded-2xl border-2 bg-white transition-all",
                  review.status === "pending"
                    ? "border-[var(--data-warning)]/40 hover:border-[var(--data-warning)]"
                    : review.status === "rejected"
                    ? "border-[var(--rule-base)] opacity-75"
                    : "border-[var(--rule-base)] hover:border-primary/30"
                )}
              >
                {/* Banda lateral según estado */}
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1.5",
                  review.status === "pending"
                    ? "bg-[var(--data-warning)]"
                    : review.status === "approved"
                    ? "bg-[var(--data-success)]"
                    : "bg-[var(--rule-base)]"
                )} />

                <div className="pl-3 p-5 space-y-4">
                  {/* Header: avatar + nombre + estrellas + estado + acciones */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Avatar con iniciales */}
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/5 border border-primary/20 text-primary font-extrabold text-sm shrink-0">
                        {initials(review.name)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-sm text-[var(--text-primary)] truncate">
                            {review.name || "Anónimo"}
                          </span>
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
                            cfg.className
                          )}>
                            {cfg.label}
                          </span>
                          {hasReply && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold text-primary bg-primary/10">
                              <MessageSquare className="h-2.5 w-2.5" /> Respondida
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={cn(
                                  "h-4 w-4",
                                  s <= review.rating
                                    ? "fill-[var(--data-warning)] text-[var(--data-warning)]"
                                    : "text-[var(--rule-base)]"
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">·</span>
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                            {new Date(review.date).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {review.status !== "approved" && (
                        <button
                          onClick={() => handleStatusChange(review.id, "approved")}
                          disabled={saving === review.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-success)]/10 text-[var(--data-success)] text-xs font-bold hover:bg-[var(--data-success)] hover:text-white transition-colors disabled:opacity-50"
                          title="Aprobar"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Aprobar</span>
                        </button>
                      )}
                      {review.status !== "rejected" && (
                        <button
                          onClick={() => handleStatusChange(review.id, "rejected")}
                          disabled={saving === review.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error)] text-xs font-bold hover:bg-[var(--data-error)] hover:text-white transition-colors disabled:opacity-50"
                          title="Rechazar"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Rechazar</span>
                        </button>
                      )}
                      <button
                        onClick={() => { setReplyingTo(isReplying ? null : review.id); setReplyText(review.adminReply ?? ""); }}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                          isReplying
                            ? "bg-primary text-white"
                            : "bg-primary/10 text-primary hover:bg-primary hover:text-white"
                        )}
                        title="Responder"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{hasReply ? "Editar" : "Responder"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Texto de la reseña — destacado tipo cita */}
                  <blockquote className="text-sm text-[var(--text-primary)] leading-relaxed italic font-display border-l-4 border-[var(--rule-base)] pl-4">
                    “{review.text}”
                  </blockquote>

                  {/* Respuesta admin existente */}
                  {hasReply && !isReplying && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                          <MessageSquare className="h-2.5 w-2.5" />
                        </span>
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary">Tu respuesta</p>
                      </div>
                      <p className="text-sm text-[var(--text-primary)] leading-relaxed">{review.adminReply}</p>
                    </div>
                  )}

                  {/* Reply form */}
                  {isReplying && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                            <MessageSquare className="h-2.5 w-2.5" />
                          </span>
                          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary">
                            {hasReply ? "Editar respuesta" : "Nueva respuesta"}
                          </p>
                        </div>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                          {replyText.length}/500
                        </span>
                      </div>
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Gracias por tu reseña…"
                        rows={3}
                        maxLength={500}
                        className="w-full rounded-lg border-2 border-[var(--rule-base)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setReplyingTo(null); setReplyText(""); }}
                          className="px-3 py-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-white text-[var(--text-secondary)] text-xs font-bold hover:bg-[var(--surface-sunken)] transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleReply(review.id)}
                          disabled={saving === review.id || !replyText.trim()}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
                        >
                          {saving === review.id ? (
                            <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <MessageSquare className="h-3 w-3" />
                          )}
                          {saving === review.id ? "Guardando…" : "Enviar respuesta"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────
// Orquestador principal
// ─────────────────────────────────────────────
