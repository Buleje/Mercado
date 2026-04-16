"use client";

/**
 * components/admin/support/UnifiedSupportInbox.tsx
 *
 * Tabla unificada de mensajes de soporte de múltiples fuentes:
 *  - WhatsApp bot logs (ActivityLog entity = "whatsapp.inbound")
 *  - Reviews pendientes de moderación (Review status = "pending")
 *
 * Columnas: Fuente | Cliente | Mensaje | Recibido | Estado
 * Filtro por fuente. Botón "Marcar resuelto" (fire-and-forget, regla #7).
 */

import { useState, useCallback, useEffect } from "react";
import { MessageCircle, Star, Inbox, CheckCircle2, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/admin/EmptyState";
import type { SupportInboxItem } from "@/app/api/admin/support/inbox/route";

type SourceFilter = "all" | "whatsapp" | "review";

const SOURCE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  whatsapp: {
    label: "WhatsApp",
    icon: <MessageCircle className="w-3.5 h-3.5" />,
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  review: {
    label: "Reseña",
    icon: <Star className="w-3.5 h-3.5" />,
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

export function UnifiedSupportInbox() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [data, setData] = useState<{ items: SupportInboxItem[]; total: number }>({ items: [], total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const apiUrl =
    sourceFilter === "all"
      ? "/api/admin/support/inbox"
      : `/api/admin/support/inbox?source=${sourceFilter}`;

  const loadInbox = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(apiUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch_failed");
      const json = (await res.json()) as { items?: SupportInboxItem[]; total?: number };
      setData({
        items: Array.isArray(json.items) ? json.items : [],
        total: typeof json.total === "number" ? json.total : 0,
      });
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    setIsLoading(true);
    void loadInbox();

    const id = setInterval(() => {
      void loadInbox();
    }, 30_000);

    return () => clearInterval(id);
  }, [loadInbox]);

  const handleMarkResolved = useCallback(
    (id: string) => {
      setResolving((prev) => new Set(prev).add(id));
      // Fire-and-forget (regla #7) — optimistic UI
      fetch(`/api/admin/support/inbox/${id}/resolve`, { method: "PATCH" })
        .then(() => loadInbox())
        .catch(() => {})
        .finally(() => setResolving((prev) => { const s = new Set(prev); s.delete(id); return s; }));
    },
    [loadInbox],
  );

  const items = data.items;
  const filtered =
    sourceFilter === "all" ? items : items.filter((i) => i.source === sourceFilter);
  const pending = filtered.filter((i) => i.status === "pending");

  // ── Estados ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 dark:text-muted gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Cargando bandeja de soporte…</span>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertCircle className="text-red-400" />}
        title="Error al cargar la bandeja"
        description="No se pudo conectar con el servidor. Intenta nuevamente."
          actions={[{ label: "Reintentar", onClick: () => { void loadInbox(); }, variant: "primary" }]}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros de fuente */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "whatsapp", "review"] as SourceFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setSourceFilter(f)}
            className={[
              "min-h-[44px] px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors border",
              sourceFilter === f
                ? "bg-primary text-white border-primary"
                : "bg-white dark:bg-card border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:border-primary",
            ].join(" ")}
          >
            {f === "all" ? "Todos" : SOURCE_LABELS[f]?.label}
          </button>
        ))}
        <button
          onClick={() => { void loadInbox(); }}
          className="min-h-[44px] ml-auto p-2 rounded-lg border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition"
          aria-label="Actualizar bandeja"
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
        <span className="text-xs text-gray-400 dark:text-muted">
          {pending.length} pendiente{pending.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <EmptyState
          icon={<Inbox />}
          title="Bandeja vacía"
          description="No hay mensajes de soporte en este momento."
        />
      )}

      {/* Tabla */}
      {filtered.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-card-border overflow-hidden bg-white dark:bg-card">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[120px_1fr_2fr_130px_110px_130px] gap-3 bg-gray-50 dark:bg-surface px-4 py-2.5 text-[11px] font-bold text-gray-400 dark:text-muted">
            <span>Fuente</span>
            <span>Cliente</span>
            <span>Mensaje</span>
            <span>Recibido</span>
            <span>Estado</span>
            <span>Acción</span>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-card-border">
            {filtered.map((item) => {
              const src = SOURCE_LABELS[item.source];
              const isResolving = resolving.has(item.id);

              return (
                <div
                  key={item.id}
                  className="grid grid-cols-1 md:grid-cols-[120px_1fr_2fr_130px_110px_130px] gap-2 md:gap-3 px-4 py-3 items-start md:items-center hover:bg-gray-50/50 dark:hover:bg-surface/50 transition"
                >
                  {/* Fuente */}
                  <span
                    className={[
                      "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full w-fit",
                      src?.color ?? "bg-gray-100 text-gray-600",
                    ].join(" ")}
                  >
                    {src?.icon}
                    {src?.label ?? item.source}
                  </span>

                  {/* Cliente */}
                  <span className="text-sm font-medium text-gray-800 dark:text-foreground truncate">
                    {item.customer}
                  </span>

                  {/* Mensaje */}
                  <p className="text-sm text-gray-600 dark:text-muted line-clamp-2 break-words">
                    {item.message || <span className="italic text-gray-300">Sin mensaje</span>}
                  </p>

                  {/* Recibido */}
                  <span className="text-xs text-gray-400 dark:text-muted whitespace-nowrap">
                    {formatRelative(item.receivedAt)}
                  </span>

                  {/* Estado */}
                  <span
                    className={[
                      "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full w-fit",
                      item.status === "resolved"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
                    ].join(" ")}
                  >
                    {item.status === "resolved" ? "Resuelto" : "Pendiente"}
                  </span>

                  {/* Acción */}
                  {item.status === "pending" ? (
                    <button
                      onClick={() => handleMarkResolved(item.id)}
                      disabled={isResolving}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isResolving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      Resolver
                    </button>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-muted px-3 py-1.5">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
