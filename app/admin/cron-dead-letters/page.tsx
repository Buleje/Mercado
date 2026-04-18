"use client";

import { PageTitle, SectionTitle } from "@buleje/design-system";
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
} from "@buleje/design-system/icons";

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
    <div className="min-h-screen bg-[var(--surface-canvas)] p-4 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push("/admin")}
          className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          aria-label="Volver al admin"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <PageTitle className="text-xl font-bold text-[var(--text-primary)]">
            Cron Dead Letters
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            Jobs que fallaron después de todos los reintentos
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {jobNames.length > 0 && (
            <select
              value={filterJob}
              onChange={(e) => setFilterJob(e.target.value)}
              className="rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] dark:border-[var(--rule-base)] dark:bg-gray-900 dark:text-[var(--text-tertiary)]"
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
            className="flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-gray-100 disabled:opacity-50 dark:border-[var(--rule-base)] dark:bg-gray-900 dark:text-[var(--text-tertiary)] transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-[var(--data-error)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error)] dark:border-[var(--data-error)] dark:bg-red-950 dark:text-[var(--data-error)]">
          {error}
        </div>
      )}

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-xs font-medium text-[var(--text-tertiary)]">
            Dead Letters
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--data-error)] dark:text-[var(--data-error)]">
            {totalDead}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-xs font-medium text-[var(--text-tertiary)]">
            Jobs afectados
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)]">
            {summary.length}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-xs font-medium text-[var(--text-tertiary)]">
            Crons activos (24h)
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--data-success)] dark:text-[var(--data-success)]">
            {health.filter((h) => h.successCount24h > 0).length}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="text-xs font-medium text-[var(--text-tertiary)]">
            Crons con fallos (24h)
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)]">
            {health.filter((h) => h.failureCount24h > 0).length}
          </p>
        </div>
      </div>

      {/* Health overview */}
      {health.length > 0 && (
        <div className="mb-6">
          <SectionTitle className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <Activity size={16} /> Salud de Crons (24h)
          </SectionTitle>
          <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--rule-soft)] bg-gray-50 text-xs font-medium uppercase text-[var(--text-secondary)] dark:border-[var(--rule-base)] dark:bg-gray-950 dark:text-[var(--text-tertiary)]">
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
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                        {h.jobName}
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--data-success)] dark:text-[var(--data-success)]">
                        {h.successCount24h}
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--data-error)] dark:text-[var(--data-error)]">
                        {h.failureCount24h || "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--text-secondary)]">
                        {h.avgDurationMs ? `${h.avgDurationMs}ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {h.deadLetters > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-xs font-medium text-[var(--data-error)] dark:bg-[var(--data-error)] dark:text-[var(--data-error)]">
                            <AlertTriangle size={10} /> {h.deadLetters}
                          </span>
                        ) : (
                          <span className="text-[var(--text-tertiary)]">0</span>
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
          <SectionTitle className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <AlertTriangle size={16} /> Resumen por Job
          </SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((s) => (
              <div
                key={s.jobName}
                className="flex items-center justify-between rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900"
              >
                <div>
                  <p className="font-mono text-xs text-[var(--text-primary)]">
                    {s.jobName}
                  </p>
                  <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">
                    {s.failureCount} fallo{s.failureCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFilterJob(s.jobName)}
                    className="rounded-lg border border-[var(--rule-base)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-gray-100 dark:border-[var(--rule-base)] dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800 transition-colors"
                  >
                    Filtrar
                  </button>
                  <button
                    onClick={() => clearByJob(s.jobName)}
                    disabled={deletingJob === s.jobName}
                    className="flex items-center gap-1 rounded-lg bg-[var(--data-error-100)] px-2 py-1 text-xs text-[var(--data-error)] hover:bg-[var(--data-error)] disabled:opacity-50 dark:bg-[var(--data-error)] dark:text-[var(--data-error)] dark:hover:bg-[var(--data-error)] transition-colors"
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
      <SectionTitle className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
        <Clock size={16} /> Entradas ({entries.length})
      </SectionTitle>

      {loading ? (
        <div className="flex justify-center py-12 text-[var(--text-tertiary)]">
          <RefreshCw size={24} className="animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white py-16 text-center dark:border-[var(--rule-base)] dark:bg-gray-900">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-[var(--data-success)]" />
          <p className="text-sm text-[var(--text-secondary)]">
            No hay dead letters — todos los crons están sanos
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--rule-soft)] bg-gray-50 text-xs font-medium uppercase text-[var(--text-secondary)] dark:border-[var(--rule-base)] dark:bg-gray-950 dark:text-[var(--text-tertiary)]">
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
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                      {entry.jobName}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-[var(--data-error)] dark:text-[var(--data-error)]">
                      <span title={entry.error}>
                        {truncate(entry.error, 80)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-[var(--text-secondary)]">
                      {entry.attempts}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--text-secondary)]">
                      {fmt(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => clearById(entry.id)}
                        disabled={deletingId === entry.id}
                        className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--data-error-100)] hover:text-[var(--data-error)] disabled:opacity-50 dark:hover:bg-[var(--data-error)] dark:hover:text-[var(--data-error)] transition-colors"
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
