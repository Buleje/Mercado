"use client";

import { useEffect, useState } from "react";
import { Gift, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FrequencyRewardCardProps {
  productName: string;
  currentCount: number;
  targetCount: number;
}

// ── Step dot ──────────────────────────────────────────────────────────────────

function StepDot({
  filled,
  isLast,
  animate,
}: {
  filled: boolean;
  isLast: boolean;
  animate: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-[var(--dur-slow)]",
        filled
          ? "border-[var(--accent)] bg-[var(--accent)]"
          : "border-border bg-background dark:bg-background",
        animate && filled && "scale-110"
      )}
    >
      {filled ? (
        isLast ? (
          <Gift className="h-3.5 w-3.5 text-white" />
        ) : (
          <Check className="h-3.5 w-3.5 text-white" />
        )
      ) : isLast ? (
        <Gift className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-border" />
      )}
    </div>
  );
}

// ── Confetti ───────────────────────────────────────────────────────────────────

const CONFETTI_PIECES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * 360;
  const distance = 30 + (i * 3); // deterministic instead of random
  const color = [
    "bg-[var(--accent)]",
    "bg-[#f97316]",
    "bg-yellow-400",
    "bg-emerald-400",
    "bg-pink-400",
  ][i % 5];
  return { angle, distance, color };
});

function Confetti() {
  const pieces = CONFETTI_PIECES;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={cn(
            "absolute h-2 w-2 rounded-sm opacity-0 animate-ping",
            p.color
          )}
          style={{
            transform: `rotate(${p.angle}deg) translateY(-${p.distance}px)`,
            animationDuration: `${0.6 + (i * 0.03)}s`,
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FrequencyRewardCard({
  productName,
  currentCount,
  targetCount,
}: FrequencyRewardCardProps) {
  const [animated, setAnimated] = useState(false);
  const completed = currentCount >= targetCount;
  const remaining = Math.max(0, targetCount - currentCount);
  const filled = Math.min(currentCount, targetCount);

  // Trigger celebration animation when completed
  useEffect(() => {
    if (completed) {
      const t = setTimeout(() => setAnimated(true), 200);
      return () => clearTimeout(t);
    }
  }, [completed]);

  const steps = Array.from({ length: targetCount }, (_, i) => i + 1);

  const progressPct = Math.min((currentCount / targetCount) * 100, 100);

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card dark:bg-card p-4 space-y-3 overflow-hidden transition-all",
        completed
          ? "border-[var(--accent)] shadow-md shadow-[var(--accent)]/20"
          : "border-border"
      )}
    >
      {completed && animated && <Confetti />}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Programa de frecuencia
          </p>
          <p className="text-sm font-semibold text-foreground dark:text-foreground mt-0.5">
            {productName}
          </p>
        </div>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
            completed
              ? "bg-[var(--accent)] text-white"
              : "bg-muted dark:bg-muted/50 text-muted-foreground"
          )}
        >
          <Gift className="h-4 w-4" />
        </div>
      </div>

      {/* Message */}
      <p className="text-sm text-foreground dark:text-foreground leading-snug">
        {completed ? (
          <span className="font-semibold text-[var(--accent)]">
            Completaste las {targetCount} compras. Tu próxima compra de{" "}
            {productName} es GRATIS.
          </span>
        ) : (
          <>
            Compraste{" "}
            <span className="font-semibold">{productName}</span>{" "}
            <span className="font-bold text-[var(--accent)]">{currentCount}</span> de{" "}
            <span className="font-bold">{targetCount}</span> veces.{" "}
            <span className="font-semibold">
              {remaining} mas y la siguiente es GRATIS.
            </span>
          </>
        )}
      </p>

      {/* Step dots */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {steps.map((step) => (
          <StepDot
            key={step}
            filled={step <= filled}
            isLast={step === targetCount}
            animate={animated}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-muted dark:bg-muted/50 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-[var(--dur-slower)] ease-out",
            completed ? "bg-[var(--accent)]" : "bg-[var(--accent)]/70"
          )}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <p className="text-xs text-muted-foreground text-right tabular-nums">
        {filled}/{targetCount}
      </p>
    </div>
  );
}
