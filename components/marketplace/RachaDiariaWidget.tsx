"use client";

/**
 * RachaDiariaWidget — racha de visitas diarias (loop de hábito tipo Duolingo).
 *
 * Cuenta días CONSECUTIVOS que el usuario abre el marketplace (localStorage,
 * per-browser, funciona anónimo). Al 5º día desbloquea un cupón REAL
 * (BIENVENIDO10, 10% off 1ª compra). Cada nuevo check-in dispara una
 * micro-celebración (confetti suave; grande en el hito).
 *
 * No-fake: la racha refleja visitas reales del usuario; el cupón ya existe.
 */
import { useEffect, useState, useCallback } from "react";
import { Flame, Gift, Check, Copy } from "@buleje/design-system/icons";
import { celebrate } from "@/lib/celebrate";
import { cn } from "@/lib/utils";

const LAST_KEY = "buleje:racha:last";
const COUNT_KEY = "buleje:racha:count";
const MILESTONE = 5;
const COUPON = "BIENVENIDO10";

/** Fecha local YYYY-MM-DD (no UTC — la racha es por día del usuario). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function RachaDiariaWidget({ className }: { className?: string }) {
  const [streak, setStreak] = useState<number | null>(null);
  const [justGrew, setJustGrew] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const today = new Date();
      const todayKey = ymd(today);
      const yest = new Date(today);
      yest.setDate(today.getDate() - 1);
      const yesterdayKey = ymd(yest);

      const last = localStorage.getItem(LAST_KEY);
      const prev = parseInt(localStorage.getItem(COUNT_KEY) || "0", 10) || 0;

      let next: number;
      let grew = false;
      if (last === todayKey) {
        next = prev > 0 ? prev : 1; // ya contó hoy (reload) → sin cambios
      } else if (last === yesterdayKey) {
        next = prev + 1; // racha continúa
        grew = true;
      } else {
        next = 1; // arranca o reinicia tras un hueco
        grew = last != null; // no "celebra" la primerísima visita de la vida
      }

      localStorage.setItem(LAST_KEY, todayKey);
      localStorage.setItem(COUNT_KEY, String(next));
      setStreak(next);

      if (grew) {
        setJustGrew(true);
        // pequeño delay para que el confetti acompañe el render
        window.setTimeout(
          () => celebrate({ intensity: next >= MILESTONE ? "lg" : "sm" }),
          400,
        );
      }
    } catch {
      setStreak(null);
    }
  }, []);

  const copyCoupon = useCallback(() => {
    try {
      navigator.clipboard?.writeText(COUPON);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin clipboard → el código igual está visible */
    }
  }, []);

  if (streak == null) return null;

  const reached = streak >= MILESTONE;
  const pct = Math.min(100, Math.round((streak / MILESTONE) * 100));
  const faltan = Math.max(0, MILESTONE - streak);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-gradient-to-r from-[var(--accent-soft)] to-[var(--surface-raised)] px-3.5 py-2.5",
        className,
      )}
      aria-label={`Racha de ${streak} ${streak === 1 ? "día" : "días"} seguidos`}
    >
      {/* Llama + contador */}
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-sm",
          justGrew && "animate-bounce",
        )}
      >
        <Flame className="h-5 w-5" strokeWidth={2.25} fill="currentColor" />
        <span className="absolute -bottom-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--text-primary)] px-1 text-[length:var(--ts-2xs,0.6875rem)] font-black tabular-nums text-[var(--surface-canvas)] ring-2 ring-[var(--surface-raised)]">
          {streak}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold leading-tight text-[var(--text-primary)]">
          {streak === 1
            ? "¡Empezaste tu racha!"
            : `${streak} días seguidos`}
        </p>

        {reached ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
            <Gift className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            ¡Premio desbloqueado!
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-xs font-medium text-[var(--text-secondary)]">
              {faltan} {faltan === 1 ? "día" : "días"} para tu cupón de regalo
            </p>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Recompensa: cupón real al alcanzar el hito */}
      {reached && (
        <button
          type="button"
          onClick={copyCoupon}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-extrabold text-white transition-transform hover:scale-[1.03] active:scale-95"
          aria-label={`Copiar cupón ${COUPON}`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
              ¡Copiado!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              {COUPON}
            </>
          )}
        </button>
      )}
    </div>
  );
}
