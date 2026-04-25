"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  ChevronLeft,
  Inbox,
} from "@buleje/design-system/icons";
import AdminTabShell from "@/app/admin/_components/_shared/AdminTabShell";
import AdminEmptyState from "@/app/admin/_components/_shared/AdminEmptyState";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";

interface QueueItem {
  id: string;
  stripeId: string;
  eventType: string;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function StatusBadge({ item }: { item: QueueItem }) {
  if (item.processedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--data-success)]">
        <CheckCircle2 size={12} /> Procesado
      </span>
    );
  }
  if (item.attempts >= 6) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error-50)] px-2 py-0.5 text-xs font-semibold text-[var(--data-error)]">
        <AlertTriangle size={12} /> Abandonado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-xs font-semibold text-[var(--data-warning)]">
      <Clock size={12} /> Pendiente ({item.attempts}/6)
    </span>
  );
}

export default function WebhookQueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [replayLoading, setReplayLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<{ replayed: number; failed: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/webhook-queue");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const triggerReplay = async () => {
    setReplayLoading(true);
    setReplayResult(null);
    try {
      const res = await fetch("/api/billing/webhook-replay", {
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReplayResult({ replayed: data.replayed ?? 0, failed: data.failed ?? 0 });
      await load();
    } catch {
      setError("Error al ejecutar replay. Verifica el CRON_SECRET.");
    } finally {
      setReplayLoading(false);
    }
  };

  const dismissItem = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/billing/webhook-queue?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError("Error al eliminar el evento");
    } finally {
      setDeletingId(null);
    }
  };

  const pending = items.filter((i) => !i.processedAt && i.attempts < 6);
  const abandoned = items.filter((i) => !i.processedAt && i.attempts >= 6);
  const processed = items.filter((i) => !!i.processedAt);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] p-4 sm:p-8">
      <div className="mb-4">
        <button
          onClick={() => router.push("/admin")}
          className={ADMIN_TOKENS.btnGhost}
          aria-label="Volver al admin"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Volver al admin
        </button>
      </div>

      <AdminTabShell
        title="Cola de Webhooks Stripe"
        description="Eventos fallidos pendientes de reintento. La cola reintenta automáticamente con backoff exponencial."
        icon={Inbox}
        actions={
          <>
            <button
              onClick={load}
              disabled={loading}
              className={ADMIN_TOKENS.btnSecondary}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Actualizar
            </button>
            <button
              onClick={triggerReplay}
              disabled={replayLoading || pending.length === 0}
              className={ADMIN_TOKENS.btnPrimary}
            >
              <RotateCcw className={`h-4 w-4 ${replayLoading ? "animate-spin" : ""}`} aria-hidden />
              Ejecutar replay ({pending.length})
            </button>
          </>
        }
      >
        {replayResult && (
          <div className={ADMIN_TOKENS.successBanner}>
            Replay completado — <strong>{replayResult.replayed} procesados</strong>,{" "}
            {replayResult.failed} fallidos
          </div>
        )}

        {error && <div className={ADMIN_TOKENS.errorBanner}>{error}</div>}

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Pendientes", value: pending.length, tone: "warning" as const },
            { label: "Abandonados", value: abandoned.length, tone: "error" as const },
            { label: "Procesados", value: processed.length, tone: "success" as const },
          ].map(({ label, value, tone }) => (
            <div key={label} className={`${ADMIN_TOKENS.card} p-4`}>
              <p className={ADMIN_TOKENS.hint}>{label}</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  tone === "warning"
                    ? "text-[var(--data-warning)]"
                    : tone === "error"
                    ? "text-[var(--data-error)]"
                    : "text-[var(--data-success)]"
                }`}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12 text-[var(--text-tertiary)]">
            <RefreshCw size={24} className="animate-spin" aria-hidden />
          </div>
        ) : items.length === 0 ? (
          <AdminEmptyState
            icon={CheckCircle2}
            title="Sin eventos en la cola"
            description="Todos los webhooks de Stripe se procesaron correctamente."
          />
        ) : (
          <div className={`overflow-hidden ${ADMIN_TOKENS.card}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)]/60">
                  <tr>
                    {["Estado", "Tipo de evento", "Intentos", "Próximo retry", "Creado", "Último error", ""].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)]"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--surface-sunken)]/40">
                      <td className="px-4 py-3">
                        <StatusBadge item={item} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
                        {item.eventType}
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--text-secondary)]">
                        {item.attempts}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-tertiary)]">
                        {item.processedAt ? (
                          <span className="text-[var(--data-success)]">{fmt(item.processedAt)}</span>
                        ) : (
                          fmt(item.nextRetryAt)
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-tertiary)]">
                        {fmt(item.createdAt)}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-xs text-[var(--data-error)]">
                        {item.lastError ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {!item.processedAt && (
                          <button
                            onClick={() => dismissItem(item.id)}
                            disabled={deletingId === item.id}
                            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error)] disabled:opacity-50 transition-colors"
                            aria-label="Descartar evento"
                            title="Descartar evento de la cola"
                          >
                            {deletingId === item.id ? (
                              <RefreshCw size={14} className="animate-spin" aria-hidden />
                            ) : (
                              <Trash2 size={14} aria-hidden />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AdminTabShell>
    </div>
  );
}
