"use client";

/**
 * Crons que fallaron («dead letters») — el contenido de la página
 * `/admin/cron-dead-letters`, extraído para mostrarlo también como bloque en
 * Configuración › Sistema › Colas (plan «panel unificado», ola 2).
 *
 * - `CronFallidosAcciones` + `CronFallidosContenido`: los usa la página, que
 *   conserva su `AdminTabShell` con las acciones en la cabecera.
 * - `CronFallidosBloque` (default): para el bloque plegable de Colas; si el
 *   servidor responde 403 (sólo la plataforma ve estos registros) lo dice en
 *   una línea.
 */
import { RefreshCw, Trash2, AlertTriangle, CheckCircle2, Clock, Activity, Lock } from "@buleje/design-system/icons";
import { ADMIN_TOKENS } from "@/app/admin/_components/_shared/admin-tokens";
import { DataTable, CardTitle, StatCard } from "@buleje/design-system";
import { EmptyState } from "@/components/admin/EmptyState";
import { IconAction } from "@/components/admin/shared/module-primitives";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { useCronFallidos, type CronFallidos } from "./use-cron-fallidos";

/** Zona Lima y 24 h, como todo el panel. */
const fmt = (dateStr: string) => formatDateTime(dateStr);

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

/** Filtro por job + «Actualizar». */
export function CronFallidosAcciones({ c }: { c: CronFallidos }) {
  return (
    <>
      {c.jobNames.length > 0 && (
        <select
          value={c.filterJob}
          onChange={(e) => c.setFilterJob(e.target.value)}
          aria-label="Filtrar por trabajo"
          className={cn(ADMIN_TOKENS.input, "h-12 w-auto rounded-xl")}
        >
          <option value="">Todos los trabajos</option>
          {c.jobNames.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={c.load} disabled={c.loading} className={button({ variant: "secondary", className: "rounded-xl" })}>
        <RefreshCw className={`h-4 w-4 ${c.loading ? "animate-spin" : ""}`} aria-hidden />
        Actualizar
      </button>
    </>
  );
}

export function CronFallidosContenido({ c }: { c: CronFallidos }) {
  const { entries, summary, health, loading, error, totalDead } = c;
  const conExito = health.filter((h) => h.successCount24h > 0).length;
  const conFallos = health.filter((h) => h.failureCount24h > 0).length;
  return (
    <>
      {error && <div className={ADMIN_TOKENS.errorBanner}>{error}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard density="compact" label="Atascados" value={totalDead} emphasis={totalDead > 0 ? "error" : "neutral"} />
        <StatCard density="compact" label="Trabajos afectados" value={summary.length} emphasis={summary.length > 0 ? "warning" : "neutral"} />
        <StatCard density="compact" label="Crons activos (24 h)" value={conExito} emphasis={conExito > 0 ? "success" : "neutral"} />
        <StatCard density="compact" label="Crons con fallos (24 h)" value={conFallos} emphasis={conFallos > 0 ? "warning" : "neutral"} />
      </div>

      {health.length > 0 && (
        <section className={ADMIN_TOKENS.card}>
          <header className="flex items-center gap-2 px-4 py-3 border-b border-[var(--rule-soft)]">
            <Activity className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            <CardTitle>Salud de los crons (24 h)</CardTitle>
          </header>
          <div className="overflow-x-auto">
            <DataTable className="w-full text-left text-sm">
              <thead className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/60 text-xs font-semibold uppercase text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-4 py-3">Trabajo</th>
                  <th className="px-4 py-3 text-center">Éxitos</th>
                  <th className="px-4 py-3 text-center">Fallos</th>
                  <th className="px-4 py-3 text-center">Duración prom.</th>
                  <th className="px-4 py-3 text-center">Atascados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {health.map((h) => (
                  <tr key={h.jobName} className="hover:bg-[var(--surface-sunken)]/40">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{h.jobName}</td>
                    <td className="px-4 py-3 text-center text-[var(--data-success-ink)]">{h.successCount24h}</td>
                    <td className="px-4 py-3 text-center text-[var(--data-error-ink)]">{h.failureCount24h || "—"}</td>
                    <td className="px-4 py-3 text-center text-[var(--text-secondary)]">
                      {h.avgDurationMs ? `${h.avgDurationMs} ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {h.deadLetters > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]">
                          <AlertTriangle size={10} aria-hidden /> {h.deadLetters}
                        </span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </section>
      )}

      {summary.length > 0 && (
        <section>
          <header className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            <CardTitle>Resumen por trabajo</CardTitle>
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.map((s) => (
              <div key={s.jobName} className={`${ADMIN_TOKENS.card} p-4 flex items-center justify-between`}>
                <div className="min-w-0">
                  <p className="font-mono text-xs text-[var(--text-primary)] truncate">{s.jobName}</p>
                  <p className="text-xs text-[var(--data-error-ink)]">
                    {s.failureCount} fallo{s.failureCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button type="button" onClick={() => c.setFilterJob(s.jobName)} className={button({ variant: "ghost", className: "rounded-xl px-3" })}>
                    Filtrar
                  </button>
                  <button
                    type="button"
                    onClick={() => c.clearByJob(s.jobName)}
                    disabled={c.deletingJob === s.jobName}
                    className={button({ variant: "secondary", className: "rounded-xl px-3 text-[var(--data-error-ink)]" })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
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
          <CardTitle>Entradas ({entries.length})</CardTitle>
        </header>

        {loading ? (
          <div className="flex justify-center py-12" role="status" aria-label="Cargando los crons">
            <LoadingSpinner size={32} />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState icon={<CheckCircle2 aria-hidden />} title="Ningún cron quedó atascado." className="py-8" />
        ) : (
          <div className={`overflow-hidden ${ADMIN_TOKENS.card}`}>
            <div className="overflow-x-auto">
              <DataTable className="w-full text-left text-sm">
                <thead className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]/60 text-xs font-semibold uppercase text-[var(--text-tertiary)]">
                  <tr>
                    <th className="px-4 py-3">Trabajo</th>
                    <th className="px-4 py-3">Error</th>
                    <th className="px-4 py-3 text-center">Intentos</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[var(--surface-sunken)]/40">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{entry.jobName}</td>
                      <td className="max-w-xs px-4 py-3 text-xs text-[var(--data-error-ink)]">
                        <span title={entry.error}>{truncate(entry.error, 80)}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-[var(--text-secondary)]">{entry.attempts}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--text-secondary)]">
                        {fmt(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <IconAction
                          icon={Trash2}
                          label="Eliminar entrada"
                          tone="danger"
                          className="ml-auto"
                          onClick={() => c.clearById(entry.id)}
                          disabled={c.deletingId === entry.id}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/** El bloque de Configuración › Sistema › Colas: acciones en una fila y el contenido. */
export default function CronFallidosBloque() {
  const c = useCronFallidos();
  if (c.prohibido) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Lock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        Sólo los ve el equipo de la plataforma: son registros de todo el sistema, no de tu negocio.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <CronFallidosAcciones c={c} />
      </div>
      <CronFallidosContenido c={c} />
    </div>
  );
}
