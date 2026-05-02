"use client";

/**
 * StreaksAndBonusCard — gamificación tipo Uber/Rappi para el repartidor.
 *
 * Secciones:
 *   1. Racha de días online (top-left)
 *   2. Meta semanal con progress ring SVG inline (top-right)
 *   3. Bonus activos en chips horizontales (full-width, bottom)
 *
 * Datos: live desde `/api/delivery/me/streaks` (refresh cada 60s).
 * Si la API falla o aún no cargó, cae al MOCK por defecto (UX no se rompe).
 */

import { useState, useId, useEffect, useCallback } from "react";
import {
  Flame,
  Target,
  Zap,
  CloudRain,
  Calendar,
  Sunset,
  Trophy,
  Sparkles,
  type LucideIcon,
} from "@buleje/design-system/icons";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface BonusItem {
  id: string;
  icon: LucideIcon;
  label: string;
  current?: number;
  target?: number;
  tone: "rose" | "amber" | "purple";
}

interface MockData {
  streak: {
    days: number;
    recentDays: boolean[]; // últimos 7 días, índice 0 = hace 6 días, índice 6 = hoy
  };
  weeklyGoal: {
    current: number;
    target: number;
    daysRemaining: number;
  };
  bonuses: BonusItem[];
}

// ─── Mock ────────────────────────────────────────────────────────────────────

const MOCK: MockData = {
  streak: {
    days: 5,
    recentDays: [true, true, false, true, true, true, true],
  },
  weeklyGoal: {
    current: 450,
    target: 600,
    daysRemaining: 3,
  },
  bonuses: [
    { id: "rain", icon: CloudRain, label: "Lluvia +30%", tone: "rose" },
    {
      id: "trip5",
      icon: Calendar,
      label: "5 viajes",
      current: 3,
      target: 5,
      tone: "amber",
    },
    { id: "peak", icon: Sunset, label: "Hora pico +S/3", tone: "purple" },
  ],
};

// ─── Paleta de tono para chips ────────────────────────────────────────────────

const TONE_CLASSES: Record<BonusItem["tone"], string> = {
  rose: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  amber: "bg-amber-400/10 text-amber-500 border-amber-400/20",
  purple: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const TONE_BAR: Record<BonusItem["tone"], string> = {
  rose: "bg-rose-400",
  amber: "bg-amber-400",
  purple: "bg-purple-400",
};

// ─── Labels de día de la semana (L M M J V S D) ──────────────────────────────

function getWeekDayLabels(): string[] {
  // recentDays[0] = hace 6 días, recentDays[6] = hoy
  const labels: string[] = [];
  const SHORT = ["D", "L", "M", "M", "J", "V", "S"];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(SHORT[d.getDay()]);
  }
  return labels;
}

// ─── Sub-componente: Racha de días ───────────────────────────────────────────

function StreakSection({
  isOnline,
  streak,
}: {
  isOnline: boolean;
  streak: MockData["streak"];
}) {
  const dayLabels = getWeekDayLabels();
  const bonusDaysLeft = 7 - streak.days;
  const goalReached = streak.days >= 7;

  if (!isOnline) {
    return (
      <div className="flex flex-col gap-3">
        {/* Encabezado */}
        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
          <Flame className="h-4 w-4" strokeWidth={2} aria-hidden />
          <p className="text-xs font-extrabold uppercase tracking-wider">
            Racha online
          </p>
        </div>
        <p className="text-sm font-semibold text-[var(--text-secondary)]">
          Conéctate para empezar a sumar racha
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Encabezado */}
      <div className="flex items-center gap-2 text-[var(--accent)]">
        <Flame className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        <p className="text-xs font-extrabold uppercase tracking-wider">
          Racha online
        </p>
      </div>

      {/* Número grande */}
      <div className="flex items-end gap-2">
        <span className="text-5xl font-extrabold tabular-nums text-[var(--text-primary)]">
          {streak.days}
        </span>
        <span className="mb-1.5 text-base font-bold text-[var(--text-secondary)]">
          días seguidos
        </span>
      </div>

      {/* 7 dots de días */}
      <div className="flex items-center gap-1.5" role="list" aria-label="Últimos 7 días">
        {streak.recentDays.map((online, idx) => (
          <div key={idx} className="flex flex-col items-center gap-1" role="listitem">
            <div
              className={`h-3 w-3 rounded-full transition-colors ${
                online
                  ? "bg-[var(--data-success)]"
                  : "bg-[var(--text-tertiary)]/30"
              }`}
              aria-label={`${dayLabels[idx]}: ${online ? "online" : "offline"}`}
            />
            <span className="text-[10px] font-bold text-[var(--text-tertiary)]">
              {dayLabels[idx]}
            </span>
          </div>
        ))}
      </div>

      {/* Subtítulo */}
      <p className="text-sm font-semibold text-[var(--text-secondary)]">
        {goalReached ? (
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Racha activa — ¡Sigue así!
          </span>
        ) : (
          `Próximo bonus en ${bonusDaysLeft} día${bonusDaysLeft !== 1 ? "s" : ""}`
        )}
      </p>
    </div>
  );
}

// ─── Sub-componente: Progress Ring SVG ───────────────────────────────────────

function ProgressRing({
  percent,
  size = 80,
  strokeWidth = 7,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const id = useId();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      role="img"
    >
      <defs>
        <linearGradient id={`ring-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Track */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--rule-base)"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={`url(#ring-grad-${id})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ─── Sub-componente: Meta semanal ─────────────────────────────────────────────

function WeeklyGoalSection({ weeklyGoal }: { weeklyGoal: MockData["weeklyGoal"] }) {
  const percent = Math.round((weeklyGoal.current / weeklyGoal.target) * 100);
  const goalReached = weeklyGoal.current >= weeklyGoal.target;

  return (
    <div className="flex flex-col gap-3">
      {/* Encabezado */}
      <div className="flex items-center gap-2 text-[var(--accent)]">
        <Target className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        <p className="text-xs font-extrabold uppercase tracking-wider">
          Meta semanal
        </p>
      </div>

      {/* Ring + números */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
          <ProgressRing percent={percent} size={80} strokeWidth={7} />
          {/* Texto central */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)] leading-none">
              {percent}%
            </span>
            <span className="text-[9px] font-bold text-[var(--text-tertiary)] leading-none mt-0.5">
              S/{weeklyGoal.current}/{weeklyGoal.target}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
            S/{weeklyGoal.current}
          </p>
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            de S/{weeklyGoal.target} esta semana
          </p>
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            {goalReached ? (
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Meta alcanzada
              </span>
            ) : (
              `Faltan ${weeklyGoal.daysRemaining} día${weeklyGoal.daysRemaining !== 1 ? "s" : ""}`
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componente: Chip de bonus ───────────────────────────────────────────

function BonusChip({ bonus }: { bonus: BonusItem }) {
  const [open, setOpen] = useState(false);
  const hasProgress = bonus.current !== undefined && bonus.target !== undefined;
  const progressPct = hasProgress
    ? Math.round(((bonus.current ?? 0) / (bonus.target ?? 1)) * 100)
    : 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Bonus: ${bonus.label}`}
        className={`
          inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-extrabold
          transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]
          animate-pulse-subtle
          ${TONE_CLASSES[bonus.tone]}
        `}
      >
        <bonus.icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
        <span>{bonus.label}</span>

        {/* Mini progress inline para trip5 */}
        {hasProgress && (
          <span className="text-xs font-bold opacity-80 tabular-nums">
            {bonus.current}/{bonus.target}
          </span>
        )}
      </button>

      {/* Tooltip detalle */}
      {open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 mb-2 z-20 w-52 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-lg"
        >
          <div className="flex items-center gap-2 mb-2">
            <bonus.icon className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              {bonus.label}
            </p>
          </div>

          {hasProgress && (
            <>
              <div className="flex justify-between text-xs font-bold text-[var(--text-secondary)] mb-1">
                <span>Progreso</span>
                <span className="tabular-nums">
                  {bonus.current}/{bonus.target} ({progressPct}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--rule-base)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${TONE_BAR[bonus.tone]}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </>
          )}

          {!hasProgress && (
            <p className="text-xs font-semibold text-[var(--text-secondary)]">
              Bonus activo ahora mismo. Entrega más pedidos para aprovecharlo.
            </p>
          )}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  isOnline: boolean;
}

export default function StreaksAndBonusCard({ isOnline }: Props) {
  // Live data desde el endpoint — fallback al MOCK si aún no cargó o hay error.
  const [data, setData] = useState<MockData>(MOCK);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/delivery/me/streaks", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as MockData;
      setData(json);
    } catch {
      /* silent — UX no se rompe */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const { streak, weeklyGoal, bonuses } = data;

  return (
    <section
      aria-label="Racha, meta semanal y bonus activos"
      className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* ── Top: Racha + Meta (grid 1-col mobile / 2-col md+) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y-2 md:divide-y-0 md:divide-x-2 divide-[var(--rule-base)]">
        {/* Racha */}
        <div className="p-5 lg:p-6">
          <StreakSection isOnline={isOnline} streak={streak} />
        </div>

        {/* Meta semanal */}
        <div className="p-5 lg:p-6">
          <WeeklyGoalSection weeklyGoal={weeklyGoal} />
        </div>
      </div>

      {/* ── Bottom: Bonus activos (full-width) ── */}
      {bonuses.length > 0 && (
        <div className="border-t-2 border-[var(--rule-base)] px-5 py-4 lg:px-6">
          <div className="flex items-center gap-2 mb-3 text-[var(--accent)]">
            <Zap className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            <p className="text-xs font-extrabold uppercase tracking-wider">
              Bonus activos
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {bonuses.map((b) => (
              <BonusChip key={b.id} bonus={b} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
