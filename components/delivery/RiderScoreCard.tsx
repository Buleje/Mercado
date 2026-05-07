"use client";

/**
 * RiderScoreCard — Score + badges de gamificación para el repartidor.
 *
 * Props vienen del endpoint /api/delivery/me/me (campo `partner`).
 * El campo `score` es opcional: cuando no existe en DB se calcula
 * con heurística `totalAccepted * 70` para no bloquear el lanzamiento.
 *
 * Layout: grid-cols-1 lg:grid-cols-2 (hero izquierda / badges derecha).
 * Tokens CSS: --accent, --surface-raised, --rule-base, --text-primary,
 *             --text-secondary, --text-tertiary, --accent-soft.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Trophy,
  Star,
  Zap,
  Shield,
  Rocket,
  Flame,
  Sparkles,
  Lock,
  type LucideIcon,
} from "@buleje/design-system/icons";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RiderScoreCardProps {
  rating: number;
  totalAccepted: number;
  acceptanceRate: number;
  /** Puntos reales del rider. Si no existe en DB, se usa heurística. */
  score?: number;
}

type TierId = "bronce" | "plata" | "oro" | "diamante";
type BadgeState = "unlocked" | "in-progress" | "locked";

interface Tier {
  id: TierId;
  name: string;
  min: number;
  max: number;
  /** Clases Tailwind para el gradient del hero badge */
  gradient: string;
  /** Color del texto sobre el gradient */
  textClass: string;
}

interface BadgeDef {
  id: string;
  name: string;
  Icon: LucideIcon;
  desc: string;
  state: BadgeState;
  /** Progreso 0-100 (solo para in-progress) */
  progress?: number;
  /** Clase de color del icono cuando está unlocked */
  colorClass: string;
  /** Clase de fondo cuando está unlocked */
  bgClass: string;
}

// ─── Datos estáticos ──────────────────────────────────────────────────────────

const TIERS: Tier[] = [
  {
    id: "bronce",
    name: "Bronce",
    min: 0,
    max: 2000,
    gradient: "from-orange-400 to-[var(--data-warning-700)]",
    textClass: "text-amber-900",
  },
  {
    id: "plata",
    name: "Plata",
    min: 2000,
    max: 6000,
    gradient: "from-zinc-300 to-zinc-600",
    textClass: "text-zinc-900",
  },
  {
    id: "oro",
    name: "Oro",
    min: 6000,
    max: 9000,
    gradient: "from-yellow-400 to-orange-500",
    textClass: "text-orange-950",
  },
  {
    id: "diamante",
    name: "Diamante",
    min: 9000,
    max: Infinity,
    gradient: "from-cyan-300 to-blue-600",
    textClass: "text-blue-950",
  },
];

const MOCK_BADGES: BadgeDef[] = [
  {
    id: "cumplidor",
    name: "Cumplidor",
    Icon: Trophy,
    desc: "100% on-time este mes",
    state: "unlocked",
    colorClass: "text-yellow-500",
    bgClass: "bg-yellow-500/10",
  },
  {
    id: "estrella",
    name: "Estrella",
    Icon: Star,
    desc: "5★ por 30 días",
    state: "in-progress",
    progress: 70,
    colorClass: "text-[var(--data-warning-500)]",
    bgClass: "bg-[var(--data-warning-500)]/10",
  },
  {
    id: "velocidad",
    name: "Velocidad",
    Icon: Zap,
    desc: "Top 10 rápidos",
    state: "unlocked",
    colorClass: "text-sky-500",
    bgClass: "bg-sky-500/10",
  },
  {
    id: "confiable",
    name: "Confiable",
    Icon: Shield,
    desc: "0 cancelaciones",
    state: "unlocked",
    colorClass: "text-[var(--data-success-500)]",
    bgClass: "bg-[var(--data-success-500)]/10",
  },
  {
    id: "crecimiento",
    name: "Crecimiento",
    Icon: Rocket,
    desc: "+20% viajes",
    state: "locked",
    colorClass: "text-purple-500",
    bgClass: "bg-purple-500/10",
  },
  {
    id: "racha30",
    name: "Racha 30",
    Icon: Flame,
    desc: "30 días online",
    state: "in-progress",
    progress: 17,
    colorClass: "text-rose-500",
    bgClass: "bg-rose-500/10",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTier(pts: number): Tier {
  return (
    TIERS.slice()
      .reverse()
      .find((t) => pts >= t.min) ?? TIERS[0]
  );
}

function getNextTier(current: Tier): Tier | null {
  const idx = TIERS.findIndex((t) => t.id === current.id);
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

function formatPts(n: number): string {
  return n.toLocaleString("es-PE");
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

/** Badge circular de gamificación */
function BadgeCircle({ badge }: { badge: BadgeDef }) {
  const isUnlocked = badge.state === "unlocked";
  const isInProgress = badge.state === "in-progress";
  const isLocked = badge.state === "locked";

  return (
    <div className="flex flex-col items-center gap-1.5 group/badge">
      {/* Círculo */}
      <div
        className={[
          "relative h-16 w-16 rounded-full flex items-center justify-center transition-transform duration-200",
          isUnlocked
            ? [
                badge.bgClass,
                "border-2 border-current",
                badge.colorClass,
                // scale + sparkle en hover (respeta reduce-motion vía Tailwind)
                "motion-safe:group-hover/badge:scale-110",
              ].join(" ")
            : isInProgress
              ? "bg-[var(--surface-raised)] border-2 border-[var(--rule-base)]"
              : "bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] opacity-50",
        ].join(" ")}
        aria-label={`Badge ${badge.name}: ${badge.state === "unlocked" ? "obtenido" : badge.state === "in-progress" ? `en progreso ${badge.progress}%` : "bloqueado"}`}
      >
        {/* Icono principal */}
        <badge.Icon
          className={[
            "h-7 w-7 transition-colors duration-200",
            isUnlocked ? badge.colorClass : "text-[var(--text-tertiary)]",
          ].join(" ")}
          strokeWidth={isUnlocked ? 2 : 1.5}
        />

        {/* Overlay candado para locked */}
        {isLocked && (
          <span className="absolute inset-0 flex items-end justify-end p-1 pointer-events-none">
            <Lock
              className="h-4 w-4 text-[var(--text-tertiary)] drop-shadow-sm"
              strokeWidth={2.5}
            />
          </span>
        )}

        {/* Dot pulsante para in-progress */}
        {isInProgress && (
          <span className="absolute -top-0.5 -right-0.5">
            <span className="relative flex h-3 w-3">
              <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--data-warning-500)]" />
            </span>
          </span>
        )}

        {/* Sparkle en hover para unlocked */}
        {isUnlocked && (
          <span
            className="absolute -top-1 -right-1 opacity-0 motion-safe:group-hover/badge:opacity-100 transition-opacity duration-200 pointer-events-none"
            aria-hidden
          >
            <Sparkles className={`h-4 w-4 ${badge.colorClass}`} strokeWidth={1.5} />
          </span>
        )}
      </div>

      {/* Nombre */}
      <span
        className={[
          "text-xs font-bold text-center leading-tight max-w-[4.5rem] truncate",
          isUnlocked
            ? "text-[var(--text-primary)]"
            : "text-[var(--text-tertiary)]",
        ].join(" ")}
        data-no-translate
      >
        {badge.name}
      </span>

      {/* Descripción / progreso */}
      {isInProgress && badge.progress !== undefined ? (
        <div className="w-14">
          <div className="h-1 rounded-full bg-[var(--rule-base)] overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-400 transition-all duration-700"
              style={{ width: `${badge.progress}%` }}
              role="progressbar"
              aria-valuenow={badge.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${badge.name} ${badge.progress}% completado`}
            />
          </div>
          <p className="mt-0.5 text-center text-[10px] font-semibold text-[var(--text-tertiary)] tabular-nums">
            {badge.progress}%
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-center text-[var(--text-tertiary)] leading-tight max-w-[4.5rem]">
          {badge.desc}
        </p>
      )}
    </div>
  );
}

/** Barra de progreso al siguiente tier */
function TierProgress({
  score,
  current,
  next,
}: {
  score: number;
  current: Tier;
  next: Tier;
}) {
  const range = next.min - current.min;
  const progress = Math.min(100, Math.round(((score - current.min) / range) * 100));
  const remaining = next.min - score;

  return (
    <div className="mt-4 space-y-2">
      {/* Track */}
      <div
        className="h-2 rounded-full bg-[var(--rule-base)] overflow-hidden"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso hacia ${next.name}: ${progress}%`}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${next.gradient} transition-all duration-700`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Label */}
      <p className="text-xs font-semibold text-[var(--text-secondary)]">
        Faltan{" "}
        <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
          {formatPts(remaining)} pts
        </span>{" "}
        para{" "}
        <span data-no-translate className="font-extrabold text-[var(--text-primary)]">
          {next.name}
        </span>
      </p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RiderScoreCard({
  rating,
  totalAccepted,
  acceptanceRate,
  score: scoreProp,
}: RiderScoreCardProps) {
  // Live data desde el endpoint — fallback a la heurística inicial.
  const [liveScore, setLiveScore] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/delivery/me/score", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { score: number };
      if (typeof json.score === "number") {
        setLiveScore(json.score);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 120_000); // 2 min
    return () => clearInterval(id);
  }, [load]);

  // Prioridad: liveScore (DB real) → scoreProp → heurística mock.
  const pts = liveScore ?? scoreProp ?? totalAccepted * 70;

  const tier = useMemo(() => getTier(pts), [pts]);
  const nextTier = useMemo(() => getNextTier(tier), [tier]);

  const onTimePercent = Math.round(acceptanceRate * 100);

  return (
    <section
      className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden"
      aria-label="Tu score de repartidor"
    >
      {/* ── Grid principal ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2">

        {/* ── HERO (izquierda en desktop, arriba en mobile) ─────────── */}
        <div className="p-6 lg:p-8 flex flex-col justify-between border-b-2 lg:border-b-0 lg:border-r-2 border-[var(--rule-base)]">
          {/* Tier badge grande */}
          <div>
            <div
              className={`inline-flex items-center gap-3 rounded-2xl bg-gradient-to-br ${tier.gradient} px-5 py-3 shadow-md`}
              aria-label={`Nivel actual: ${tier.name}`}
            >
              <Trophy
                className={`h-8 w-8 shrink-0 ${tier.textClass} opacity-90`}
                strokeWidth={2}
              />
              <span
                className={`text-2xl font-black tracking-tight ${tier.textClass}`}
                data-no-translate
              >
                {tier.name}
              </span>
            </div>

            {/* Score numérico */}
            <p className="mt-4 text-4xl font-extrabold text-[var(--text-primary)] tabular-nums">
              {formatPts(pts)}{" "}
              <span className="text-xl font-bold text-[var(--text-secondary)]">pts</span>
            </p>

            <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
              Tu puntuación acumulada
            </p>

            {/* Progress al siguiente tier */}
            {nextTier ? (
              <TierProgress score={pts} current={tier} next={nextTier} />
            ) : (
              <p className="mt-4 text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                Nivel maximo alcanzado
              </p>
            )}
          </div>

          {/* ── Stats footer (dentro del hero en desktop) ─────────────── */}
          <div className="mt-6 flex items-center gap-4 flex-wrap">
            <StatPill
              icon={<Star className="h-4 w-4 text-[var(--data-warning-500)]" strokeWidth={2} />}
              value={rating.toFixed(1)}
              label="promedio"
            />
            <div className="h-6 w-px bg-[var(--rule-base)]" aria-hidden />
            <StatPill
              icon={<Trophy className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} />}
              value={String(totalAccepted)}
              label="viajes este mes"
            />
            <div className="h-6 w-px bg-[var(--rule-base)]" aria-hidden />
            <StatPill
              icon={<Shield className="h-4 w-4 text-[var(--data-success-500)]" strokeWidth={2} />}
              value={`${onTimePercent}%`}
              label="on-time"
            />
          </div>
        </div>

        {/* ── BADGES (derecha en desktop, abajo en mobile) ──────────── */}
        <div className="p-6 lg:p-8">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-5">
            Tus logros
          </h3>

          <div
            className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-x-3 gap-y-5"
            role="list"
            aria-label="Badges del repartidor"
          >
            {MOCK_BADGES.map((badge) => (
              <div key={badge.id} role="listitem">
                <BadgeCircle badge={badge} />
              </div>
            ))}
          </div>

          {/* Leyenda de estados */}
          <div className="mt-6 flex items-center gap-4 flex-wrap border-t border-[var(--rule-base)] pt-4">
            <LegendItem dot="bg-[var(--data-success-500)]" label="Obtenido" />
            <LegendItem dot="bg-amber-400 animate-pulse" label="En progreso" />
            <LegendItem dot="bg-[var(--text-tertiary)] opacity-50" label="Bloqueado" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Micro-componentes internos ───────────────────────────────────────────────

function StatPill({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-base font-extrabold text-[var(--text-primary)] tabular-nums">
        {value}
      </span>
      <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}

function LegendItem({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden />
      <span className="text-xs font-semibold text-[var(--text-tertiary)]">{label}</span>
    </div>
  );
}
