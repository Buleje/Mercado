"use client";

import { Clock, Sparkles } from "@buleje/design-system/icons";

interface Stats {
  total: number;
  done: number;
  pending: number;
  blocked: number;
  pendingMinutes: number;
}

interface SetupStatsCardProps {
  stats: Stats;
  allDone: boolean;
}

export default function SetupStatsCard({ stats, allDone }: SetupStatsCardProps) {
  const progressPct = Math.round((stats.done / stats.total) * 100);

  return (
    <>
      <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-secondary)]">
              Progreso global
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {stats.done} de {stats.total} completados
            </span>
          </div>
          <span className="text-2xl font-bold text-[var(--accent)]">{progressPct}%</span>
        </div>

        <div className="w-full h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-[var(--dur-slow)]"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="text-center">
            <div className="text-xl font-extrabold text-[var(--text-primary)]">{stats.total}</div>
            <div className="text-[length:var(--ts-xs)] text-gray-400 uppercase font-semibold tracking-wide">Total</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-[var(--data-warning)]">{stats.pending}</div>
            <div className="text-[length:var(--ts-xs)] text-gray-400 uppercase font-semibold tracking-wide">Pendientes</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-[var(--data-success)]">{stats.done}</div>
            <div className="text-[length:var(--ts-xs)] text-gray-400 uppercase font-semibold tracking-wide">Hechos</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-[var(--data-warning)]">{stats.blocked}</div>
            <div className="text-[length:var(--ts-xs)] text-gray-400 uppercase font-semibold tracking-wide">Bloqueados</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Clock className="w-3 h-3" />
          <span>
            Tiempo estimado restante: <strong>{stats.pendingMinutes} minutos</strong>
            {stats.pendingMinutes > 0 && " (de tu tiempo, no del mío)"}
          </span>
        </div>
      </div>

      {allDone && (
        <div className="bg-[var(--accent)] text-white rounded-xl p-6 flex items-center gap-4">
          <Sparkles className="w-10 h-10 shrink-0" />
          <div>
            <h2 className="text-xl font-bold">¡Setup completo!</h2>
            <p className="text-sm opacity-90 mt-0.5">
              Todas las acciones humanas pendientes están hechas. Claude tiene acceso completo.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
