"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Gift } from "lucide-react";

interface LoyaltyBannerProps {
  points: number;
  nextReward: number;
  rewardValue: string;
  className?: string;
}

export function LoyaltyBanner({
  points,
  nextReward,
  rewardValue,
  className,
}: LoyaltyBannerProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const pct = Math.min(100, nextReward > 0 ? Math.round((points / nextReward) * 100) : 100);
  const remaining = Math.max(0, nextReward - points);
  const completed = pct >= 100;

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    // Animar desde 0 al porcentaje real
    el.style.width = "0%";
    const raf = requestAnimationFrame(() => {
      el.style.transition = "width 1s cubic-bezier(0.4, 0, 0.2, 1)";
      el.style.width = `${pct}%`;
    });
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-4",
        "bg-[#00B4A6] dark:bg-[#1a3d2e]",
        "text-white",
        className
      )}
      role="region"
      aria-label="Programa de puntos de fidelidad"
    >
      {/* Patron decorativo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 50%, #f97316 0%, transparent 60%)",
        }}
      />

      <div className="relative flex items-start gap-3">
        {/* Icono */}
        <div className="flex-shrink-0 rounded-full bg-white/20 p-2">
          <Gift className="h-5 w-5 text-white" aria-hidden="true" />
        </div>

        {/* Contenido */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold leading-tight text-white">
              {completed
                ? "Tienes un premio disponible"
                : `Te faltan ${remaining} puntos para ${rewardValue} de descuento`}
            </p>
            <span className="flex-shrink-0 rounded-full bg-[#f97316] px-2 py-0.5 text-xs font-bold text-white">
              {points} pts
            </span>
          </div>

          {/* Texto descriptivo */}
          <p className="mb-2 text-xs text-white/80">
            Llevas{" "}
            <span className="font-semibold text-white">
              {points}/{nextReward} puntos
            </span>{" "}
            — Premio: {rewardValue}
          </p>

          {/* Barra de progreso */}
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-white/20"
            role="progressbar"
            aria-valuenow={points}
            aria-valuemin={0}
            aria-valuemax={nextReward}
            aria-label={`${points} de ${nextReward} puntos`}
          >
            <div
              ref={barRef}
              className={cn(
                "h-full rounded-full",
                completed
                  ? "bg-[#f97316]"
                  : "bg-white"
              )}
              style={{ width: "0%" }}
            />
          </div>

          {/* Porcentaje */}
          <p className="mt-1 text-right text-xs text-white/70">
            {pct}% completado
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoyaltyBanner;
