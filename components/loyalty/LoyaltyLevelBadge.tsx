/**
 * components/loyalty/LoyaltyLevelBadge.tsx
 *
 * Muestra el badge del nivel de fidelidad con icono, color dinámico
 * y tooltip con los beneficios de ese nivel.
 *
 * Es un componente puramente presentacional — no hace fetch.
 * Se puede usar en Server Components o Client Components.
 */

import type { LucideIcon } from "lucide-react";
import { Award, Medal, Trophy, Sparkles } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type LoyaltyLevel = "bronce" | "plata" | "oro" | "diamante";

export interface LoyaltyLevelBadgeProps {
  /** Nivel actual del cliente */
  level: LoyaltyLevel;
  /** Tamaño del badge: sm = compacto, md = normal, lg = destacado */
  size?: "sm" | "md" | "lg";
  /** Mostrar tooltip con beneficios al hacer hover */
  showTooltip?: boolean;
  /** Clases adicionales para el contenedor */
  className?: string;
}

// ── Metadatos de cada nivel ───────────────────────────────────────────────────

interface LevelMeta {
  /** Icono propio del DS — reemplaza el emoji genérico que se veía mal. */
  Icon: LucideIcon;
  label: string;
  /** Clase de color de texto */
  textColor: string;
  /** Clase de fondo */
  bgColor: string;
  /** Clase de borde */
  borderColor: string;
  /** Clase de ring para focus / selección */
  ringColor: string;
  /** Beneficios del nivel para el tooltip */
  benefits: string[];
  /** Puntos mínimos para este nivel */
  minPoints: number;
  /** Puntos máximos (undefined = sin techo) */
  maxPoints?: number;
}

export const LEVEL_META: Record<LoyaltyLevel, LevelMeta> = {
  bronce: {
    Icon: Award,
    label: "Bronce",
    textColor: "text-[var(--data-warning-700)] dark:text-amber-300",
    bgColor: "bg-amber-50 dark:bg-amber-900/25",
    borderColor: "border-amber-200 dark:border-[var(--data-warning-700)]",
    ringColor: "ring-amber-300 dark:ring-[var(--data-warning-600)]",
    benefits: [
      "1 punto por cada S/ 1 gastado",
      "Acceso a ofertas exclusivas de miembros",
    ],
    minPoints: 0,
    maxPoints: 99,
  },
  plata: {
    Icon: Medal,
    label: "Plata",
    textColor: "text-slate-600 dark:text-slate-300",
    bgColor: "bg-slate-50 dark:bg-slate-800/50",
    borderColor: "border-slate-200 dark:border-slate-600",
    ringColor: "ring-slate-300 dark:ring-slate-500",
    benefits: [
      "1 punto por cada S/ 1 gastado",
      "Prioridad en delivery en hora punta",
      "Descuento automático 2% en pedidos",
    ],
    minPoints: 100,
    maxPoints: 499,
  },
  oro: {
    Icon: Trophy,
    label: "Oro",
    textColor: "text-yellow-700 dark:text-yellow-300",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/25",
    borderColor: "border-yellow-200 dark:border-yellow-700",
    ringColor: "ring-yellow-300 dark:ring-yellow-600",
    benefits: [
      "1.5 puntos por cada S/ 1 gastado",
      "Descuento automático 4% en todos los pedidos",
      "Acceso anticipado a promociones",
      "Atención preferencial por WhatsApp",
    ],
    minPoints: 500,
    maxPoints: 1999,
  },
  diamante: {
    Icon: Sparkles,
    label: "Diamante",
    textColor: "text-sky-700 dark:text-sky-300",
    bgColor: "bg-sky-50 dark:bg-sky-900/25",
    borderColor: "border-sky-200 dark:border-sky-700",
    ringColor: "ring-sky-300 dark:ring-sky-600",
    benefits: [
      "2 puntos por cada S/ 1 gastado",
      "Descuento automático 6% en todos los pedidos",
      "Delivery gratis ilimitado",
      "Acceso VIP a nuevos productos",
      "Gestor personal de cuenta",
    ],
    minPoints: 2000,
  },
};

// ── Utilitario para determinar nivel desde puntos ─────────────────────────────

export function getLevelFromPoints(points: number): LoyaltyLevel {
  if (points >= 2000) return "diamante";
  if (points >= 500) return "oro";
  if (points >= 100) return "plata";
  return "bronce";
}

/** Devuelve el siguiente nivel (null si ya es diamante) */
export function getNextLevel(level: LoyaltyLevel): LoyaltyLevel | null {
  const order: LoyaltyLevel[] = ["bronce", "plata", "oro", "diamante"];
  const idx = order.indexOf(level);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

/** Calcula el porcentaje de progreso al siguiente nivel (0-100) */
export function getLevelProgress(points: number): number {
  const level = getLevelFromPoints(points);
  const meta = LEVEL_META[level];

  // Diamante: nivel máximo, barra llena
  if (!meta.maxPoints) return 100;

  const rangeMin = meta.minPoints;
  const rangeMax = meta.maxPoints + 1; // +1 para que el último punto del rango sea 99.x%
  return Math.min(100, ((points - rangeMin) / (rangeMax - rangeMin)) * 100);
}

/** Cuántos puntos faltan para subir de nivel (0 si ya es diamante) */
export function getPointsToNextLevel(points: number): number {
  const nextLevel = getNextLevel(getLevelFromPoints(points));
  if (!nextLevel) return 0;
  return Math.max(0, LEVEL_META[nextLevel].minPoints - points);
}

// ── Tamaños ───────────────────────────────────────────────────────────────────

const SIZE_CLASSES = {
  sm: {
    container: "px-2 py-0.5 gap-1 text-xs rounded-lg",
    icon: "h-3.5 w-3.5",
    label: "text-xs font-semibold",
  },
  md: {
    container: "px-3 py-1 gap-1.5 text-sm rounded-xl",
    icon: "h-4 w-4",
    label: "text-sm font-bold",
  },
  lg: {
    container: "px-4 py-2 gap-2 text-base rounded-2xl",
    icon: "h-5 w-5",
    label: "text-base font-extrabold",
  },
} as const;

// ── Componente ────────────────────────────────────────────────────────────────

export default function LoyaltyLevelBadge({
  level,
  size = "md",
  showTooltip = true,
  className,
}: LoyaltyLevelBadgeProps) {
  const meta = LEVEL_META[level];
  const sizes = SIZE_CLASSES[size];
  const Icon = meta.Icon;

  return (
    <div className={cn("relative group inline-flex", className)}>
      {/* Badge principal */}
      <span
        className={cn(
          "inline-flex items-center border font-medium transition-all duration-200",
          meta.textColor,
          meta.bgColor,
          meta.borderColor,
          sizes.container,
        )}
        aria-label={`Nivel ${meta.label}`}
      >
        <Icon className={sizes.icon} strokeWidth={2.25} aria-hidden="true" />
        <span className={sizes.label}>{meta.label}</span>
      </span>

      {/* Tooltip con beneficios */}
      {showTooltip && (
        <div
          role="tooltip"
          className={cn(
            // Posicionamiento y tamaño
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 z-50",
            // Visibilidad controlada por hover/focus del grupo
            "opacity-0 scale-95 pointer-events-none",
            "group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto",
            "transition-all duration-200 ease-out",
            // Estilo
            "bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700",
            "shadow-lg shadow-black/10 dark:shadow-black/30 p-3",
          )}
        >
          {/* Cabecera del tooltip */}
          <div className="flex items-center gap-2 mb-2">
            <Icon className={cn("h-5 w-5", meta.textColor)} strokeWidth={2.25} aria-hidden="true" />
            <div>
              <p className={cn("text-xs font-bold", meta.textColor)}>
                Nivel {meta.label}
              </p>
              <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-gray-500">
                {meta.maxPoints !== undefined
                  ? `${meta.minPoints} – ${meta.maxPoints} pts`
                  : `${meta.minPoints}+ pts`}
              </p>
            </div>
          </div>

          {/* Lista de beneficios */}
          <ul className="space-y-1">
            {meta.benefits.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-1.5 text-[length:var(--ts-2xs)] text-gray-600 dark:text-gray-300"
              >
                <span
                  className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60"
                  aria-hidden="true"
                />
                {benefit}
              </li>
            ))}
          </ul>

          {/* Flecha del tooltip */}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-white dark:border-t-gray-900"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
