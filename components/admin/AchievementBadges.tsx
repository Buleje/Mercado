"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Award, Lock, CheckCircle } from "@buleje/design-system/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BadgeId =
  | "vendedor-estrella"
  | "caja-perfecta"
  | "madrugador"
  | "cliente-feliz"
  | "meta-cumplida";

export interface BadgeDefinition {
  id: BadgeId;
  name: string;
  description: string;
  criterion: string;       // Texto corto del criterio
  progressLabel: string;   // Etiqueta del progreso (ej: "ventas hoy")
  maxProgress: number;
  iconSymbol: string;      // Caracter / letra representativa
  colorUnlocked: string;   // Clase de color cuando se desbloquea
  colorBg: string;         // Clase bg cuando se desbloquea
}

export interface BadgeProgress {
  badgeId: BadgeId;
  current: number;
  unlocked: boolean;
  unlockedAt?: string;
}

// ─── Definiciones de badges ───────────────────────────────────────────────────

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "vendedor-estrella",
    name: "Vendedor estrella",
    description: "Logras 50 ventas en un mismo dia.",
    criterion: "50+ ventas en un dia",
    progressLabel: "ventas hoy",
    maxProgress: 50,
    iconSymbol: "S",
    colorUnlocked: "text-yellow-600 dark:text-yellow-400",
    colorBg: "bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700",
  },
  {
    id: "caja-perfecta",
    name: "Caja perfecta",
    description: "Cierras caja sin diferencia durante 7 dias seguidos.",
    criterion: "0 diferencia al cerrar 7 dias seguidos",
    progressLabel: "dias sin diferencia",
    maxProgress: 7,
    iconSymbol: "C",
    colorUnlocked: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    colorBg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30",
  },
  {
    id: "madrugador",
    name: "Madrugador",
    description: "Realizas la primera venta del dia antes de las 7am.",
    criterion: "Primera venta antes de las 7am",
    progressLabel: "dias con primera venta temprana",
    maxProgress: 1,
    iconSymbol: "M",
    colorUnlocked: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    colorBg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30",
  },
  {
    id: "cliente-feliz",
    name: "Cliente feliz",
    description: "Un cliente te menciona en una resena de 5 estrellas.",
    criterion: "Resena 5 estrellas con mencion personal",
    progressLabel: "resenas con mencion",
    maxProgress: 1,
    iconSymbol: "R",
    colorUnlocked: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    colorBg: "bg-[var(--surface-sunken)] border-pink-300 dark:border-pink-700",
  },
  {
    id: "meta-cumplida",
    name: "Meta cumplida",
    description: "Alcanzas tu meta de ventas diaria 5 veces en la misma semana.",
    criterion: "Meta diaria cumplida 5 veces en la semana",
    progressLabel: "dias de meta cumplida esta semana",
    maxProgress: 5,
    iconSymbol: "G",
    colorUnlocked: "text-primary dark:text-[var(--data-success-500)]",
    colorBg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30",
  },
];

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = "buleje_badges_";

function getStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function loadProgress(userId: string): BadgeProgress[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return getDefaultProgress();
    const parsed = JSON.parse(raw) as BadgeProgress[];
    // Validar que tenga todos los badges definidos
    const existingIds = new Set(parsed.map((p) => p.badgeId));
    const missing = BADGE_DEFINITIONS.filter((d) => !existingIds.has(d.id)).map((d) => ({
      badgeId: d.id,
      current: 0,
      unlocked: false,
    }));
    return [...parsed, ...missing];
  } catch {
    return getDefaultProgress();
  }
}

function getDefaultProgress(): BadgeProgress[] {
  return BADGE_DEFINITIONS.map((d) => ({
    badgeId: d.id,
    current: 0,
    unlocked: false,
  }));
}

function saveProgress(userId: string, progress: BadgeProgress[]): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(progress));
  } catch {
    // localStorage no disponible: ignorar silenciosamente
  }
}

// ─── Subcomponente: Tarjeta de badge ─────────────────────────────────────────

function BadgeCard({
  definition,
  progress,
  onAdjust,
  editMode,
}: {
  definition: BadgeDefinition;
  progress: BadgeProgress;
  onAdjust: (badgeId: BadgeId, delta: number) => void;
  editMode: boolean;
}) {
  const { unlocked, current } = progress;
  const pct = Math.min(100, (current / definition.maxProgress) * 100);

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 p-4 transition-all duration-[var(--dur-base)]",
        unlocked
          ? definition.colorBg
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] opacity-70"
      )}
    >
      {/* Icono principal */}
      <div className="flex flex-col items-center mb-3">
        <div
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-extrabold border-4 transition-all duration-[var(--dur-base)]",
            unlocked
              ? cn(definition.colorBg, definition.colorUnlocked, "border-current scale-105")
              : "border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          )}
        >
          {unlocked ? (
            <span className="text-3xl">{definition.iconSymbol}</span>
          ) : (
            <Lock className="w-7 h-7" />
          )}
        </div>

        {/* Estado desbloqueado */}
        {unlocked && (
          <div className="flex items-center gap-1 mt-2">
            <CheckCircle className={cn("w-3.5 h-3.5", definition.colorUnlocked)} />
            <span className={cn("text-xs font-semibold", definition.colorUnlocked)}>
              Desbloqueado
            </span>
          </div>
        )}
      </div>

      {/* Nombre y descripcion */}
      <div className="text-center mb-3">
        <h3 className={cn(
          "font-bold text-sm mb-1",
          unlocked ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
        )}>
          {definition.name}
        </h3>
        <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
          {definition.description}
        </p>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-[var(--text-tertiary)]">{definition.progressLabel}</span>
          <span className={cn(
            "font-semibold",
            unlocked ? definition.colorUnlocked : "text-[var(--text-tertiary)]"
          )}>
            {current}/{definition.maxProgress}
          </span>
        </div>
        <div className="h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-[var(--dur-slow)]",
              unlocked
                ? "bg-[var(--data-success-500)]"
                : pct > 50
                ? "bg-[var(--data-warning-500)]"
                : "bg-[var(--rule-base)]"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Criterio */}
      <p className="text-xs text-[var(--text-tertiary)] mt-2 text-center italic">
        {definition.criterion}
      </p>

      {/* Controles de modo edicion (admin/testing) */}
      {editMode && (
        <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-[var(--rule-base)]">
          <button
            onClick={() => onAdjust(definition.id, -1)}
            disabled={current <= 0}
            className="w-7 h-7 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center text-sm font-bold hover:bg-[var(--rule-soft)] dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
          >
            -
          </button>
          <span className="text-xs text-[var(--text-tertiary)] min-w-[2rem] text-center">
            {current}
          </span>
          <button
            onClick={() => onAdjust(definition.id, 1)}
            disabled={current >= definition.maxProgress * 2}
            className="w-7 h-7 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center text-sm font-bold hover:bg-[var(--rule-soft)] dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface AchievementBadgesProps {
  userId?: string;   // ID del empleado — por defecto "demo-user"
  readOnly?: boolean; // Solo vista, sin edicion
}

export default function AchievementBadges({
  userId = "demo-user",
  readOnly = false,
}: AchievementBadgesProps) {
  const [progress, setProgress] = useState<BadgeProgress[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Cargar desde localStorage solo en cliente
  useEffect(() => {
    setProgress(loadProgress(userId));
    setMounted(true);
  }, [userId]);

  // Ajustar progreso de un badge
  const handleAdjust = useCallback((badgeId: BadgeId, delta: number) => {
    setProgress((prev) => {
      const updated = prev.map((p) => {
        if (p.badgeId !== badgeId) return p;
        const def = BADGE_DEFINITIONS.find((d) => d.id === badgeId)!;
        const newCurrent = Math.max(0, p.current + delta);
        const wasUnlocked = p.unlocked;
        const nowUnlocked = newCurrent >= def.maxProgress;
        return {
          ...p,
          current: newCurrent,
          unlocked: nowUnlocked,
          unlockedAt:
            nowUnlocked && !wasUnlocked ? new Date().toISOString() : p.unlockedAt,
        };
      });
      saveProgress(userId, updated);
      return updated;
    });
  }, [userId]);

  const unlockedCount = progress.filter((p) => p.unlocked).length;

  if (!mounted) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {BADGE_DEFINITIONS.map((d) => (
          <div key={d.id} className="h-52 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-5 h-5 text-primary dark:text-[var(--data-success-500)]" />
          <div>
            <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
              Logros del empleado
            </SectionTitle>
            <p className="text-sm text-[var(--text-tertiary)]">
              {unlockedCount} de {BADGE_DEFINITIONS.length} desbloqueados
            </p>
          </div>
        </div>

        {!readOnly && (
          <button
            onClick={() => setEditMode((e) => !e)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              editMode
                ? "bg-primary text-white"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] dark:hover:bg-gray-600"
            )}
          >
            {editMode ? "Terminar edicion" : "Modo prueba"}
          </button>
        )}
      </div>

      {/* Progreso global */}
      <div className="rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] p-3">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-[var(--text-tertiary)]">Progreso total</span>
          <span className="font-semibold text-primary dark:text-[var(--data-success-500)]">
            {Math.round((unlockedCount / BADGE_DEFINITIONS.length) * 100)}%
          </span>
        </div>
        <div className="h-2.5 bg-[var(--rule-soft)] dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--data-success-500)] rounded-full transition-all duration-[var(--dur-slower)]"
            style={{ width: `${(unlockedCount / BADGE_DEFINITIONS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Grid de badges */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {BADGE_DEFINITIONS.map((def) => {
          const prog = progress.find((p) => p.badgeId === def.id) ?? {
            badgeId: def.id,
            current: 0,
            unlocked: false,
          };
          return (
            <BadgeCard
              key={def.id}
              definition={def}
              progress={prog}
              onAdjust={handleAdjust}
              editMode={editMode && !readOnly}
            />
          );
        })}
      </div>

      {editMode && (
        <p className="text-xs text-center text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
          Modo prueba activo: ajusta el progreso de cada logro manualmente. Se guarda en este dispositivo.
        </p>
      )}
    </div>
  );
}
