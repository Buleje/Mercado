/**
 * lib/superadmin/setup-types.ts
 *
 * Tipos compartidos del módulo /superadmin/setup. Extraídos del page.tsx
 * original para permitir que los sub-componentes compartan las mismas
 * interfaces sin duplicación.
 */

export type Priority = "critical" | "high" | "medium" | "low";
export type Category = "github" | "vercel" | "sentry" | "doppler" | "stripe" | "dev" | "manual";
export type Status = "pending" | "done" | "blocked";

export interface SetupItem {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  estimatedMinutes: number;
  link?: { url: string; label: string };
  steps: string[];
  blockedReason?: string;
}

export interface ScoreSnapshot {
  label: string;
  total: number;
  applied: number;
  partial: number;
  missing: number;
  na: number;
  link?: { url: string; label: string };
}

/**
 * Calcula el score sólido (✅ + ⚠️×0.5) y perfecto (solo ✅)
 * excluyendo los items marcados como N/A.
 */
export function calcScore(s: ScoreSnapshot) {
  const denom = s.total - s.na;
  const solid = (s.applied + s.partial * 0.5) / denom;
  const perfect = s.applied / denom;
  return {
    solidPct: Math.round(solid * 1000) / 10,
    perfectPct: Math.round(perfect * 1000) / 10,
    solidBar: "█".repeat(Math.round(solid * 20)) + "░".repeat(20 - Math.round(solid * 20)),
    perfectBar: "█".repeat(Math.round(perfect * 20)) + "░".repeat(20 - Math.round(perfect * 20)),
  };
}

export const PRIORITY_CONFIG: Record<Priority, { label: string; cls: string }> = {
  critical: { label: "Crítico", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  high:     { label: "Alto",    cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  medium:   { label: "Medio",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  low:      { label: "Bajo",    cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

export const STORAGE_KEY = "superadmin-setup-status";

export function loadStatuses(): Record<string, Status> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Status>) : {};
  } catch {
    return {};
  }
}

export function saveStatuses(statuses: Record<string, Status>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(statuses));
  } catch {
    // localStorage full o bloqueado — ignorar silenciosamente
  }
}
