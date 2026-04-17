"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

/**
 * StoreOpenIndicator — señal clara de "abierto ahora" / "cierra pronto" /
 * "cerrado, abre mañana a las X" basada en horarios reales.
 *
 * Soporta 2 modos:
 *
 *  1) **Modo string** (actual): recibe `hoursText` (por ejemplo "L-V 8am-6pm")
 *     y simplemente lo muestra con un reloj. Sin cálculo de estado.
 *
 *  2) **Modo estructurado** (futuro): recibe `weekly` con objetos por día de
 *     la semana. Calcula el estado real ("Abierto ahora", "Cierra en 15 min",
 *     "Cerrado, abre mañana 8:00") comparando contra `new Date()`.
 *
 * Cuando ambos modos coexisten, el estructurado gana. Si ninguno hay datos,
 * renderiza `null` (no muestra nada mejor que mostrar basura).
 *
 * Respeta `prefers-reduced-motion` en cualquier pulse.
 */

export interface WeeklySchedule {
  /** Formato 24h "HH:MM"; null = cerrado ese día. */
  mon?: { open: string; close: string } | null;
  tue?: { open: string; close: string } | null;
  wed?: { open: string; close: string } | null;
  thu?: { open: string; close: string } | null;
  fri?: { open: string; close: string } | null;
  sat?: { open: string; close: string } | null;
  sun?: { open: string; close: string } | null;
}

interface Props {
  /** String libre que viene del Settings.hours del tenant. Display only. */
  hoursText?: string | null;
  /** Schedule estructurado por día, formato 24h. Habilita estado "Abierto ahora". */
  weekly?: WeeklySchedule;
  /** Variante compacta para cards de grid (inline, sin caja). */
  compact?: boolean;
  className?: string;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

/** Convierte "HH:MM" a minutos desde medianoche. */
function parseHM(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function minutesToHM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const DAY_LABELS_ES: Record<DayKey, string> = {
  sun: "domingo",
  mon: "lunes",
  tue: "martes",
  wed: "miércoles",
  thu: "jueves",
  fri: "viernes",
  sat: "sábado",
};

interface Status {
  state: "open" | "closing-soon" | "closed-opens-today" | "closed-opens-tomorrow" | "closed";
  label: string;
}

function computeStatus(weekly: WeeklySchedule, now: Date): Status {
  const todayKey = DAY_KEYS[now.getDay()];
  const today = weekly[todayKey];
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Check if open now
  if (today) {
    const openM = parseHM(today.open);
    const closeM = parseHM(today.close);
    if (openM !== null && closeM !== null) {
      if (nowMins >= openM && nowMins < closeM) {
        const until = closeM - nowMins;
        if (until <= 30) {
          return { state: "closing-soon", label: `Cierra en ${until} min` };
        }
        return { state: "open", label: "Abierto ahora" };
      }
      if (nowMins < openM) {
        return {
          state: "closed-opens-today",
          label: `Abre a las ${minutesToHM(openM)}`,
        };
      }
    }
  }

  // Not open today anymore — find next open day (up to 7 days ahead)
  for (let i = 1; i <= 7; i++) {
    const idx = (now.getDay() + i) % 7;
    const dayKey = DAY_KEYS[idx];
    const next = weekly[dayKey];
    if (next) {
      const openM = parseHM(next.open);
      if (openM !== null) {
        const when = i === 1 ? "mañana" : DAY_LABELS_ES[dayKey];
        return {
          state: i === 1 ? "closed-opens-tomorrow" : "closed",
          label: `Abre ${when} ${minutesToHM(openM)}`,
        };
      }
    }
  }

  return { state: "closed", label: "Cerrado" };
}

const STATE_STYLES: Record<Status["state"], { dot: string; text: string; ring: string }> = {
  "open": {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    ring: "ring-emerald-200 dark:ring-emerald-900",
  },
  "closing-soon": {
    dot: "bg-amber-500 motion-safe:animate-pulse",
    text: "text-amber-700 dark:text-amber-400",
    ring: "ring-amber-200 dark:ring-amber-900",
  },
  "closed-opens-today": {
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
    ring: "ring-gray-200 dark:ring-gray-700",
  },
  "closed-opens-tomorrow": {
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
    ring: "ring-gray-200 dark:ring-gray-700",
  },
  "closed": {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    ring: "ring-red-200 dark:ring-red-900",
  },
};

export default function StoreOpenIndicator({ hoursText, weekly, compact, className }: Props) {
  // Tick cada minuto para actualizar el estado "cierra en X min" en vivo
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const iv = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  const status = useMemo(() => {
    if (!weekly || !now) return null;
    return computeStatus(weekly, now);
  }, [weekly, now]);

  // Sin weekly y sin hoursText → no renderizar nada
  if (!status && !hoursText) return null;

  if (status) {
    const s = STATE_STYLES[status.state];
    if (compact) {
      return (
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md ring-1",
            s.text,
            s.ring,
            className,
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden="true" />
          {status.label}
        </span>
      );
    }
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg ring-1",
          s.text,
          s.ring,
          className,
        )}
      >
        <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} aria-hidden="true" />
        <Clock className="h-4 w-4" aria-hidden="true" />
        {status.label}
      </div>
    );
  }

  // Fallback — mostrar el string libre
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400",
        className,
      )}
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {hoursText}
    </span>
  );
}
