"use client";

/**
 * OfferCountdown — Countdown visual para ofertas flash.
 *
 * Muestra tiempo restante HH:MM:SS actualizado cada segundo. Variantes:
 *   - inline: chip compacto con iconChip Clock
 *   - hero: display XL para headers de ofertas
 *
 * Oculta automáticamente cuando expira (onExpired callback).
 *
 * Props:
 *   endsAt: ISO string del fin
 *   variant: "inline" | "hero"
 *   onExpired?: callback
 */

import { useEffect, useState } from "react";
import { Clock, Flame } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  endsAt: string;
  variant?: "inline" | "hero";
  onExpired?: () => void;
  className?: string;
}

function diff(endsAt: string): {
  expired: boolean;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
} {
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const ms = Math.max(0, end - now);
  return {
    expired: ms <= 0,
    hours: Math.floor(ms / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
    total: ms,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function OfferCountdown({
  endsAt,
  variant = "inline",
  onExpired,
  className,
}: Props) {
  const [time, setTime] = useState(() => diff(endsAt));

  useEffect(() => {
    const id = setInterval(() => {
      const next = diff(endsAt);
      setTime(next);
      if (next.expired) {
        clearInterval(id);
        onExpired?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt, onExpired]);

  if (time.expired) return null;

  const isUrgent = time.total < 3_600_000; // menos de 1 hora

  if (variant === "hero") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-3 rounded-2xl px-5 py-3 border",
          isUrgent
            ? "bg-[var(--data-error,_#e11d48)]/10 border-[var(--data-error,_#e11d48)]/30 text-[var(--data-error,_#e11d48)]"
            : "bg-primary/10 border-[var(--accent)]/30 text-[var(--accent)]",
          className,
        )}
        aria-live="polite"
      >
        <Flame className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">
            Termina en
          </p>
          <p className="text-2xl font-extrabold tabular-nums leading-none mt-0.5">
            {time.hours > 0 && `${pad(time.hours)}:`}
            {pad(time.minutes)}:{pad(time.seconds)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
        isUrgent
          ? "bg-[var(--data-error,_#e11d48)]/10 text-[var(--data-error,_#e11d48)]"
          : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
        className,
      )}
      aria-live="polite"
    >
      <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
      {time.hours > 0 && `${pad(time.hours)}h `}
      {pad(time.minutes)}m {pad(time.seconds)}s
    </span>
  );
}
