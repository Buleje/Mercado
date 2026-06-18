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

import { useState, useEffect, useCallback } from "react";
import {
  Flame,
  Target,
  Zap,
  Calendar,
  Trophy,
  type LucideIcon,
} from "@buleje/design-system/icons";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface BonusItem {
  id: string;
  icon: LucideIcon;
  label: string;
  current?: number;
  target?: number;
  tone: "amber";
}

interface StreaksData {
  streak: {
    days: number;
    recentDays: boolean[]; // lunes[0]…domingo[6] de la semana ISO actual
  };
  weeklyGoal: {
    current: number;
    target: number;
    daysRemaining: number;
  };
  bonuses: BonusItem[];
}

// Estado inicial vacío — sin valores fake. Brandon mayo 2026 v7: removido
// el MOCK con días/meta/bonuses inventados. Si el endpoint aún no respondió,
// mostramos zeros honestos (el skeleton/empty se nota y empuja a conectarse).
const EMPTY: StreaksData = {
  streak: { days: 0, recentDays: [false, false, false, false, false, false, false] },
  weeklyGoal: { current: 0, target: 600, daysRemaining: 0 },
  bonuses: [],
};

// Paleta unificada (sin rose/purple decorativos).
const TONE_CHIP =
  "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/25";
const TONE_BAR = "bg-[var(--accent)]";

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
  streak: StreaksData["streak"];
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
                  ? "bg-[var(--data-success-500)]"
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
        {goalReached
          ? "Racha de 7 días completada."
          : streak.days === 0
            ? "Empieza tu racha hoy"
            : `Quedan ${bonusDaysLeft} día${bonusDaysLeft !== 1 ? "s" : ""} para completar la semana`}
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
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--rule-base)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--accent)"
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

function WeeklyGoalSection({ weeklyGoal }: { weeklyGoal: StreaksData["weeklyGoal"] }) {
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
                Meta semanal alcanzada
              </span>
            ) : weeklyGoal.daysRemaining === 0 ? (
              "La semana cierra hoy"
            ) : (
              `${weeklyGoal.daysRemaining} día${weeklyGoal.daysRemaining !== 1 ? "s" : ""} restante${weeklyGoal.daysRemaining !== 1 ? "s" : ""}`
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componente: Chip de bonus ───────────────────────────────────────────

function BonusChip({ bonus }: { bonus: BonusItem }) {
  const hasProgress = bonus.current !== undefined && bonus.target !== undefined;
  const progressPct = hasProgress
    ? Math.round(((bonus.current ?? 0) / (bonus.target ?? 1)) * 100)
    : 0;

  // Chip simple, sin animaciones cosméticas. Si tiene progreso, muestra contador
  // y mini-barra inline (info útil); si no, sólo label + icono.
  return (
    <div
      className={`inline-flex items-center gap-2 border px-3.5 py-1.5 text-sm font-extrabold ${TONE_CHIP}`}
      aria-label={`Bonus: ${bonus.label}`}
    >
      <bonus.icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
      <span>{bonus.label}</span>
      {hasProgress && (
        <span className="inline-flex items-center gap-2 ml-1">
          <span className="text-xs font-bold tabular-nums opacity-80">
            {bonus.current}/{bonus.target}
          </span>
          <span className="relative h-1.5 w-10 bg-[var(--rule-base)] overflow-hidden">
            <span
              className={`absolute inset-y-0 left-0 ${TONE_BAR}`}
              style={{ width: `${progressPct}%` }}
            />
          </span>
        </span>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  isOnline: boolean;
}

export default function StreaksAndBonusCard({ isOnline }: Props) {
  // Live data desde el endpoint. Mientras no hay respuesta, mostramos zeros
  // honestos en vez de mocks decorativos (Brandon mayo 2026 v7).
  const [data, setData] = useState<StreaksData>(EMPTY);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/delivery/me/streaks", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as Omit<StreaksData, "bonuses"> & {
        bonuses: Array<Omit<BonusItem, "icon"> & { icon?: unknown }>;
      };
      const ID_TO_ICON: Record<string, LucideIcon> = {
        trip5: Calendar,
        weekend: Calendar,
      };
      const normalized: StreaksData = {
        ...json,
        bonuses: json.bonuses.map((b) => ({
          ...b,
          icon: ID_TO_ICON[b.id] ?? Calendar,
          tone: "amber",
        })),
      };
      setData(normalized);
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
      className=" border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden"
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
