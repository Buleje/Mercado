"use client";

import { Clock, Sparkles } from "lucide-react";

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
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Progreso global
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {stats.done} de {stats.total} completados
            </span>
          </div>
          <span className="text-2xl font-bold text-teal-600 dark:text-teal-400">{progressPct}%</span>
        </div>

        <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-teal-600 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="grid grid-cols-4 gap-3 mt-4">
          <div className="text-center">
            <div className="text-xl font-extrabold text-gray-900 dark:text-white">{stats.total}</div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Total</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-orange-500">{stats.pending}</div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Pendientes</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-emerald-500">{stats.done}</div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Hechos</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-extrabold text-amber-500">{stats.blocked}</div>
            <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Bloqueados</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          <span>
            Tiempo estimado restante: <strong>{stats.pendingMinutes} minutos</strong>
            {stats.pendingMinutes > 0 && " (de tu tiempo, no del mío)"}
          </span>
        </div>
      </div>

      {allDone && (
        <div className="bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-2xl p-6 flex items-center gap-4">
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
