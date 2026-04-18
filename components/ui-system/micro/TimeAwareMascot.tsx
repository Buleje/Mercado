"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * TimeAwareMascot — salamandra (mascot Pucallpa) que cambia comportamiento según hora.
 *
 * Mañana (5-11): bebiendo mate — "Buenos días"
 * Tarde (12-18): alerta, ojos abiertos — "Trabajando"
 * Noche (19-4): durmiendo — "Zzz"
 *
 * Research: illustration.app — "living brand" signals. Mascots estáticos
 * son IA-generic. Mascots que reaccionan al contexto son memorables.
 */

interface Props {
  size?: number;
  className?: string;
}

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}

export function TimeAwareMascot({ size = 80, className }: Props) {
  const [time, setTime] = useState<TimeOfDay>("afternoon");

  useEffect(() => {
    setTime(getTimeOfDay());
    const interval = setInterval(() => setTime(getTimeOfDay()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const baseProps = {
    viewBox: "0 0 120 80",
    width: size,
    height: (size * 80) / 120,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  const MORNING = (
    <svg {...baseProps} className={cn("inline-block", className)}>
      {/* Cuerpo salamandra */}
      <path d="M25 45q5 -12 20 -10q25 2 40 6q12 3 20 -5" />
      <ellipse cx="25" cy="45" rx="8" ry="5" />
      <circle cx="22" cy="43" r="0.6" fill="currentColor" />
      {/* Sonrisa */}
      <path d="M18 47q4 1 7 0" />
      {/* Patitas */}
      <path d="M42 50l-1 5M50 50l-1 5M70 50l-1 5M78 50l-1 5" />
      {/* Taza de mate en la boca */}
      <path d="M6 40q-4 0 -4 -4l5 -1q4 0 3 4z" fill="currentColor" opacity="0.15" />
      <path d="M6 40q-4 0 -4 -4l5 -1q4 0 3 4z" />
      <path d="M8 35l4 -8" strokeDasharray="1 2" opacity="0.55" />
      {/* Humo */}
      <path d="M10 25q-2 -4 1 -7q-2 -4 1 -7" opacity="0.4" strokeWidth={1} />
      <path d="M14 20q-2 -4 1 -6" opacity="0.4" strokeWidth={1} />
    </svg>
  );

  const AFTERNOON = (
    <svg {...baseProps} className={cn("inline-block", className)}>
      {/* Cuerpo activo */}
      <path d="M25 45q5 -12 20 -10q25 2 40 6q12 3 22 -3" />
      <ellipse cx="25" cy="45" rx="8" ry="5" />
      <circle cx="22" cy="42" r="0.9" fill="currentColor" />
      <circle cx="22" cy="42" r="0.3" fill="white" />
      {/* Boca enfocada */}
      <path d="M18 47q3 0 6 0" />
      {/* Patitas (postura firme) */}
      <path d="M40 50l-1 6M48 50l-1 6M68 50l-1 6M76 50l-1 6" />
      {/* Cola elevada (alerta) */}
      <path d="M95 42q10 -2 18 -12q3 -3 -1 -6" strokeWidth={1.75} />
      {/* Cuaderno en patitas delanteras */}
      <rect x="38" y="40" width="12" height="8" rx="0.5" opacity="0.5" />
      <path d="M40 43h8M40 46h6" opacity="0.5" strokeWidth={1} />
      {/* Sol arriba (activa) */}
      <circle cx="105" cy="10" r="4" opacity="0.55" />
      <path d="M105 3v3M105 17v-3M98 10h3M112 10h-3" opacity="0.45" strokeWidth={1} />
    </svg>
  );

  const EVENING = (
    <svg {...baseProps} className={cn("inline-block", className)}>
      {/* Cuerpo relajado */}
      <path d="M25 48q5 -10 20 -8q25 2 40 4q12 2 22 2" />
      <ellipse cx="25" cy="48" rx="8" ry="4.5" />
      <path d="M19 47q2 -1 3 0" />
      <path d="M25 47q2 -1 3 0" />
      {/* Boca tranquila */}
      <path d="M18 50q3 1 6 0" />
      {/* Patitas cansadas */}
      <path d="M42 52l-2 4M50 52l-2 4M70 52l-2 4M78 52l-2 4" opacity="0.7" />
      {/* Cola baja */}
      <path d="M95 48q15 0 20 2" strokeWidth={1.5} />
      {/* Luna creciente arriba */}
      <path d="M100 12a5 5 0 1 0 0 -8a3 3 0 0 1 0 8z" fill="currentColor" opacity="0.55" />
    </svg>
  );

  const NIGHT = (
    <svg {...baseProps} className={cn("inline-block", className)}>
      {/* Cuerpo durmiendo (enroscado) */}
      <path d="M25 50q5 -6 20 -4q25 0 40 0q12 0 20 -2q8 0 10 3q0 6 -10 6q-12 -1 -25 0q-15 0 -35 -2q-15 0 -20 -1z" fill="currentColor" opacity="0.08" />
      <path d="M25 50q5 -6 20 -4q25 0 40 0q12 0 20 -2q8 0 10 3q0 6 -10 6q-12 -1 -25 0q-15 0 -35 -2q-15 0 -20 -1z" />
      <ellipse cx="25" cy="50" rx="8" ry="4" />
      {/* Ojos cerrados */}
      <path d="M20 48q2 -1 4 0M24 48q2 -1 4 0" />
      {/* Zzz */}
      <text x="4" y="25" fontFamily="serif" fontSize="10" fill="currentColor" opacity="0.7" fontStyle="italic">z</text>
      <text x="10" y="20" fontFamily="serif" fontSize="12" fill="currentColor" opacity="0.5" fontStyle="italic">Z</text>
      <text x="18" y="14" fontFamily="serif" fontSize="14" fill="currentColor" opacity="0.35" fontStyle="italic">Z</text>
      {/* Estrellas */}
      <path d="M90 8l1 2l2 1l-2 1l-1 2l-1 -2l-2 -1l2 -1z" opacity="0.55" />
      <path d="M105 15l0.8 1.5l1.5 0.8l-1.5 0.8l-0.8 1.5l-0.8 -1.5l-1.5 -0.8l1.5 -0.8z" opacity="0.45" />
    </svg>
  );

  const SCENE = {
    morning: MORNING,
    afternoon: AFTERNOON,
    evening: EVENING,
    night: NIGHT,
  }[time];

  const LABELS = {
    morning: "Buenos días",
    afternoon: "Trabajando",
    evening: "Casi cerramos",
    night: "Descansando",
  };

  return (
    <div className="inline-flex flex-col items-center" title={LABELS[time]}>
      {SCENE}
    </div>
  );
}
