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
  AlertOctagon,
} from "@buleje/design-system/icons";
import AdminTabShell from "@/app/admin/_components/_shared/AdminTabShell";
import AdminEmptyState from "@/app/admin/_components/_shared/AdminEmptyState";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";

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
        title="Cron Dead Letters"
        description="Jobs programados que fallaron después de todos los reintentos. Investiga la causa y limpia las entradas resueltas."
        icon={AlertOctagon}
        actions={
          <>
            {jobNames.length > 0 && (
              <select
                value={filterJob}
                onChange={(e) => setFilterJob(e.target.value)}
                className={ADMIN_TOKENS.input + " w-auto"}
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
              className={ADMIN_TOKENS.btnSecondary}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Actualizar
            </button>
          </>
        }
      >
        {error && <div className={ADMIN_TOKENS.errorBanner}>{error}</div>}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className={`${ADMIN_TOKENS.card} p-4`}>
            <p className={ADMIN_TOKENS.hint}>Dead Letters</p>
            <p className="mt-1 text-2xl font-bold text-[var(--data-error)]">{totalDead}</p>
          </div>
          <div className={`${ADMIN_TOKENS.card} p-4`}>
            <p className={ADMIN_TOKENS.hint}>Jobs afectados</p>
            <p className="mt-1 text-2xl font-bold text-[var(--data-warning)]">{summary.length}</p>
          </div>
          <div className={`${ADMIN_TOKENS.card} p-4`}>
            <p className={ADMIN_TOKENS.hint}>Crons activos (24h)</p>
            <p className="mt-1 text-2xl font-bold text-[var(--data-success)]">
              {health.filter((h) => h.successCount24h > 0).length}
            </p>
          </div>
          <div className={`${ADMIN_TOKENS.card} p-4`}>
            <p className={ADMIN_TOKENS.hint}>Crons con fallos (24h)</p>
            <p className="mt-1 text-2xl font-bold text-[var(--data-warning)]">
              {health.filter((h) => h.failureCount24h > 0).length}
            </p>
          </div>
        </div>

        {health.length > 0 && (
          <section className={ADMIN_TOKENS.card}>
            <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule-soft)]">
              <Activity className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
              <h3 className={ADMIN_TOKENS.headingH3}>Salud de Crons (24h)</h3>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/60 text-xs font-semibold uppercase text-[var(--text-tertiary)]">
                  <tr>
                    <th className="px-4 py-3">Job</th>
                    <th className="px-4 py-3 text-center">Éxitos</th>
                    <th className="px-4 py-3 text-center">Fallos</th>
                    <th className="px-4 py-3 text-center">Duración prom.</th>
                    <th className="px-4 py-3 text-center">Dead Letters</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {health.map((h) => (
                    <tr key={h.jobName} className="hover:bg-[var(--surface-sunken)]/40">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                        {h.jobName}
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--data-success)]">
                        {h.successCount24h}
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--data-error)]">
                        {h.failureCount24h || "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-[var(--text-secondary)]">
                        {h.avgDurationMs ? `${h.avgDurationMs}ms` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {h.deadLetters > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-error-50)] px-2 py-0.5 text-xs font-semibold text-[var(--data-error)]">
                            <AlertTriangle size={10} aria-hidden /> {h.deadLetters}
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
          </section>
        )}

        {summary.length > 0 && (
          <section>
            <header className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
              <h3 className={ADMIN_TOKENS.headingH3}>Resumen por Job</h3>
            </header>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summary.map((s) => (
                <div
                  key={s.jobName}
                  className={`${ADMIN_TOKENS.card} p-4 flex items-center justify-between`}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-[var(--text-primary)] truncate">
                      {s.jobName}
                    </p>
                    <p className="text-xs text-[var(--data-error)]">
                      {s.failureCount} fallo{s.failureCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setFilterJob(s.jobName)}
                      className={ADMIN_TOKENS.btnGhost}
                    >
                      Filtrar
                    </button>
                    <button
                      onClick={() => clearByJob(s.jobName)}
                      disabled={deletingJob === s.jobName}
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--data-error-50)] px-2 py-1 text-xs font-semibold text-[var(--data-error)] hover:bg-[var(--data-error-100)] disabled:opacity-50 transition-colors"
                    >
                      <Trash2 size={12} aria-hidden />
                      Limpiar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <header className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            <h3 className={ADMIN_TOKENS.headingH3}>Entradas ({entries.length})</h3>
          </header>

          {loading ? (
            <div className="flex justify-center py-12 text-[var(--text-tertiary)]">
              <RefreshCw size={24} className="animate-spin" aria-hidden />
            </div>
          ) : entries.length === 0 ? (
            <AdminEmptyState
              icon={CheckCircle2}
              title="Sin dead letters"
              description="Todos los crons están sanos — ningún job programado quedó atascado."
            />
          ) : (
            <div className={`overflow-hidden ${ADMIN_TOKENS.card}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/60 text-xs font-semibold uppercase text-[var(--text-tertiary)]">
                    <tr>
                      <th className="px-4 py-3">Job</th>
                      <th className="px-4 py-3">Error</th>
                      <th className="px-4 py-3 text-center">Intentos</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule-soft)]">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-[var(--surface-sunken)]/40">
                        <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">
                          {entry.jobName}
                        </td>
                        <td className="max-w-xs px-4 py-3 text-xs text-[var(--data-error)]">
                          <span title={entry.error}>{truncate(entry.error, 80)}</span>
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
                            className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error)] disabled:opacity-50 transition-colors"
                            title="Eliminar entrada"
                            aria-label="Eliminar entrada"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </AdminTabShell>
    </div>
  );
}
