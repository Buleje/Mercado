"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Award, Lock, CheckCircle } from "lucide-react";

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
    colorUnlocked: "text-emerald-600 dark:text-emerald-400",
    colorBg: "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700",
  },
  {
    id: "madrugador",
    name: "Madrugador",
    description: "Realizas la primera venta del dia antes de las 7am.",
    criterion: "Primera venta antes de las 7am",
    progressLabel: "dias con primera venta temprana",
    maxProgress: 1,
    iconSymbol: "M",
    colorUnlocked: "text-blue-600 dark:text-blue-400",
    colorBg: "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700",
  },
  {
    id: "cliente-feliz",
    name: "Cliente feliz",
    description: "Un cliente te menciona en una resena de 5 estrellas.",
    criterion: "Resena 5 estrellas con mencion personal",
    progressLabel: "resenas con mencion",
    maxProgress: 1,
    iconSymbol: "R",
    colorUnlocked: "text-pink-600 dark:text-pink-400",
    colorBg: "bg-pink-50 dark:bg-pink-900/30 border-pink-300 dark:border-pink-700",
  },
  {
    id: "meta-cumplida",
    name: "Meta cumplida",
    description: "Alcanzas tu meta de ventas diaria 5 veces en la misma semana.",
    criterion: "Meta diaria cumplida 5 veces en la semana",
    progressLabel: "dias de meta cumplida esta semana",
    maxProgress: 5,
    iconSymbol: "G",
    colorUnlocked: "text-[#2d6a4f] dark:text-green-400",
    colorBg: "bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700",
  },
];

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = "bsm_badges_";

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
        "relative rounded-2xl border-2 p-4 transition-all duration-300",
        unlocked
          ? definition.colorBg
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-70"
      )}
    >
      {/* Icono principal */}
      <div className="flex flex-col items-center mb-3">
        <div
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black border-4 transition-all duration-300",
            unlocked
              ? cn(definition.colorBg, definition.colorUnlocked, "border-current shadow-lg scale-105")
              : "border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500"
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
          unlocked ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"
        )}>
          {definition.name}
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
          {definition.description}
        </p>
      </div>

      {/* Barra de progreso */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400 dark:text-gray-500">{definition.progressLabel}</span>
          <span className={cn(
            "font-semibold",
            unlocked ? definition.colorUnlocked : "text-gray-400 dark:text-gray-500"
          )}>
            {current}/{definition.maxProgress}
          </span>
        </div>
        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              unlocked
                ? "bg-gradient-to-r from-[#2d6a4f] to-[#52b788]"
                : pct > 50
                ? "bg-gradient-to-r from-[#f4a261] to-[#e76f51]"
                : "bg-gray-300 dark:bg-gray-600"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Criterio */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center italic">
        {definition.criterion}
      </p>

      {/* Controles de modo edicion (admin/testing) */}
      {editMode && (
        <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => onAdjust(definition.id, -1)}
            disabled={current <= 0}
            className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
          >
            -
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[2rem] text-center">
            {current}
          </span>
          <button
            onClick={() => onAdjust(definition.id, 1)}
            disabled={current >= definition.maxProgress * 2}
            className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors"
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
          <div key={d.id} className="h-52 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-5 h-5 text-[#2d6a4f] dark:text-green-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Logros del empleado
            </h2>
            <p className="text-sm text-gray-400 dark:text-gray-500">
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
                ? "bg-[#2d6a4f] text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            )}
          >
            {editMode ? "Terminar edicion" : "Modo prueba"}
          </button>
        )}
      </div>

      {/* Progreso global */}
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-gray-500 dark:text-gray-400">Progreso total</span>
          <span className="font-semibold text-[#2d6a4f] dark:text-green-400">
            {Math.round((unlockedCount / BADGE_DEFINITIONS.length) * 100)}%
          </span>
        </div>
        <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#2d6a4f] to-[#52b788] rounded-full transition-all duration-700"
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
        <p className="text-xs text-center text-gray-400 dark:text-gray-600">
          Modo prueba activo: ajusta el progreso de cada logro manualmente. Se guarda en este dispositivo.
        </p>
      )}
    </div>
  );
}
