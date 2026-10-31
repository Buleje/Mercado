"use client";

/**
 * Los crons que fallaron después de todos los reintentos («dead letters») y la
 * salud de cada cron en las últimas 24 h.
 *
 * Salió de `app/admin/cron-dead-letters/page.tsx` (plan «panel unificado»,
 * ola 2): la misma lógica la usan la página suelta y el bloque de
 * Configuración › Sistema › Colas. No cambia ningún endpoint.
 *
 * `GET /api/admin/cron-dead-letters` es sólo de la plataforma (los registros no
 * tienen negocio: verlos desde un negocio mostraría los de todos). Un 403 se
 * marca en `prohibido` para que el bloque lo diga en una línea en vez de
 * pintar un error.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

export interface DeadLetter {
  id: string;
  jobName: string;
  error: string;
  attempts: number;
  payload: string | null;
  createdAt: string;
}

export interface JobSummary {
  jobName: string;
  failureCount: number;
}

export interface HealthJob {
  jobName: string;
  successCount24h: number;
  failureCount24h: number;
  avgDurationMs: number;
  deadLetters: number;
}

export interface CronFallidos {
  entries: DeadLetter[];
  summary: JobSummary[];
  health: HealthJob[];
  loading: boolean;
  error: string | null;
  /** El servidor respondió 403: sólo la plataforma ve estos registros. */
  prohibido: boolean;
  deletingJob: string | null;
  deletingId: string | null;
  filterJob: string;
  setFilterJob: (job: string) => void;
  load: () => Promise<void>;
  clearByJob: (jobName: string) => Promise<void>;
  clearById: (id: string) => Promise<void>;
  totalDead: number;
  jobNames: string[];
}

export function useCronFallidos(): CronFallidos {
  const [entries, setEntries] = useState<DeadLetter[]>([]);
  const [summary, setSummary] = useState<JobSummary[]>([]);
  const [health, setHealth] = useState<HealthJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prohibido, setProhibido] = useState(false);
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
      setProhibido(dlRes.status === 403);
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

  const clearByJob = useCallback(
    async (jobName: string) => {
      setDeletingJob(jobName);
      try {
        const res = await fetch("/api/admin/cron-dead-letters", {
          method: "DELETE",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ jobName }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await load();
      } catch {
        setError("Error al limpiar entradas");
      } finally {
        setDeletingJob(null);
      }
    },
    [load],
  );

  const clearById = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/cron-dead-letters", {
        method: "DELETE",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setError("Error al eliminar entrada");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const totalDead = summary.reduce((sum, s) => sum + s.failureCount, 0);
  const jobNames = summary.map((s) => s.jobName);

  return {
    entries, summary, health, loading, error, prohibido, deletingJob, deletingId,
    filterJob, setFilterJob, load, clearByJob, clearById, totalDead, jobNames,
  };
}
