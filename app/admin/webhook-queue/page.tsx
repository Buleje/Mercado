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
} from "lucide-react";

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
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 size={12} /> Procesado
      </span>
    );
  }
  if (item.attempts >= 6) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertTriangle size={12} /> Abandonado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/admin")}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          aria-label="Volver al admin"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Cola de Webhooks Stripe</h1>
          <p className="text-sm text-gray-500">Eventos fallidos pendientes de reintento</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
          <button
            onClick={triggerReplay}
            disabled={replayLoading || pending.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <RotateCcw size={14} className={replayLoading ? "animate-spin" : ""} />
            Ejecutar replay ({pending.length})
          </button>
        </div>
      </div>

      {/* Replay result banner */}
      {replayResult && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300">
          Replay completado — <strong>{replayResult.replayed} procesados</strong>,{" "}
          {replayResult.failed} fallidos
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          { label: "Pendientes", value: pending.length, color: "yellow" },
          { label: "Abandonados", value: abandoned.length, color: "red" },
          { label: "Procesados", value: processed.length, color: "green" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
          >
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <p
              className={`mt-1 text-2xl font-bold text-${color}-600 dark:text-${color}-400`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">
          <RefreshCw size={24} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 py-16 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
          <p className="text-sm text-gray-500">No hay eventos en la cola</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60">
                <tr>
                  {["Estado", "Tipo de evento", "Intentos", "Próximo retry", "Creado", "Último error", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-3">
                      <StatusBadge item={item} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {item.eventType}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                      {item.attempts}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {item.processedAt ? <span className="text-green-600">{fmt(item.processedAt)}</span> : fmt(item.nextRetryAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {fmt(item.createdAt)}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-red-500">
                      {item.lastError ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {!item.processedAt && (
                        <button
                          onClick={() => dismissItem(item.id)}
                          disabled={deletingId === item.id}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                          aria-label="Descartar evento"
                          title="Descartar evento de la cola"
                        >
                          {deletingId === item.id ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
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
    </div>
  );
}
