"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Activity,
} from "lucide-react";

interface DeadLetter {
  id: string;
  jobName: string;
  error: string;
  attempts: number;
  payload: string | null;
  createdAt: string;
}

interface JobSummary {
  jobName: string;
  failureCount: number;
}

interface HealthJob {
  jobName: string;
  successCount24h: number;
  failureCount24h: number;
  avgDurationMs: number;
  deadLetters: number;
}

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export default function CronDeadLettersPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<DeadLetter[]>([]);
  const [summary, setSummary] = useState<JobSummary[]>([]);
  const [health, setHealth] = useState<HealthJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingJob, setDeletingJob] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filterJob, setFilterJob] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filterJob ? `?jobName=${encodeURIComponent(filterJob)}` : "";
      const [dlRes, healthRes] = await Promise.all([
        fetch(`/api/admin/cron-dead-letters${params}`),
        fetch("/api/admin/cron-health"),
      ]);
      if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`);
      const dlData = await dlRes.json();
      setEntries(dlData.entries ?? []);
      setSummary(dlData.summary ?? []);
      if (healthRes.ok) {
        const hData = await healthRes.json();
        setHealth(hData.jobs ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [filterJob]);

  useEffect(() => {
    load();
  }, [load]);

  const clearByJob = async (jobName: string) => {
    setDeletingJob(jobName);
    try {
      const res = await fetch("/api/admin/cron-dead-letters", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobName }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch {
      setError("Error al limpiar entradas");
    } finally {
      setDeletingJob(null);
    }
  };

  const clearById = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/cron-dead-letters", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError("Error al eliminar entrada");
    } finally {
      setDeletingId(null);
    }
  };

  const totalDead = summary.reduce((sum, s) => sum + s.failureCount, 0);
  const jobNames = summary.map((s) => s.jobName);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push("/admin")}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          aria-label="Volver al admin"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Cron Dead Letters
          </h1>
          <p className="text-sm text-gray-500">
            Jobs que fallaron después de todos los reintentos
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {jobNames.length > 0 && (
            <select
              value={filterJob}
              onChange={(e) => setFilterJob(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="">Todos los jobs</option>
              {jobNames.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Dead Letters
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
            {totalDead}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Jobs afectados
          </p>
          <p className="mt-1 text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {summary.length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Crons activos (24h)
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
            {health.filter((h) => h.successCount24h > 0).length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Crons con fallos (24h)
          </p>
          <p className="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">
            {health.filter((h) => h.failureCount24h > 0).length}
          </p>
        </div>
      </div>

      {/* Health overview */}
      {health.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <Activity size={16} /> Salud de Crons (24h)
          </h2>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Job</th>
                    <th className="px-4 py-3 text-center">Éxitos</th>
                    <th className="px-4 py-3 text-center">Fallos</th>
                    <th className="px-4 py-3 text-center">Duración prom.</th>
                    <th className="px-4 py-3 text-center">Dead Letters</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {health.map((h) => (
                    <tr
                      key={h.jobName}
                      className="hover:bg-gray-50 dark:hover:bg-gray-950"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-900 dark:text-gray-100">
                        {h.jobName}
                      </td>
                      <td className="px-4 py-3 text-center text-green-600 dark:text-green-400">
                        {h.successCount24h}
                      </td>
                      <td className="px-4 py-3 text-center text-red-600 dark:text-red-400">
                        {h.failureCount24h || "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                        {h.avgDurationMs ? `${h.avgDurationMs}ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {h.deadLetters > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                            <AlertTriangle size={10} /> {h.deadLetters}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Summary per job */}
      {summary.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <AlertTriangle size={16} /> Resumen por Job
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((s) => (
              <div
                key={s.jobName}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <div>
                  <p className="font-mono text-xs text-gray-900 dark:text-gray-100">
                    {s.jobName}
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {s.failureCount} fallo{s.failureCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilterJob(s.jobName)}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
                  >
                    Filtrar
                  </button>
                  <button
                    onClick={() => clearByJob(s.jobName)}
                    disabled={deletingJob === s.jobName}
                    className="flex items-center gap-1 rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800 transition-colors"
                  >
                    <Trash2 size={12} />
                    Limpiar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dead letter entries table */}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        <Clock size={16} /> Entradas ({entries.length})
      </h2>

      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">
          <RefreshCw size={24} className="animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center dark:border-gray-800 dark:bg-gray-900">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
          <p className="text-sm text-gray-500">
            No hay dead letters — todos los crons están sanos
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3 text-center">Intentos</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-950"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-900 dark:text-gray-100">
                      {entry.jobName}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-red-600 dark:text-red-400">
                      <span title={entry.error}>
                        {truncate(entry.error, 80)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-700 dark:text-gray-300">
                      {entry.attempts}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {fmt(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => clearById(entry.id)}
                        disabled={deletingId === entry.id}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900 dark:hover:text-red-400 transition-colors"
                        title="Eliminar entrada"
                      >
                        <Trash2 size={14} />
                      </button>
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
