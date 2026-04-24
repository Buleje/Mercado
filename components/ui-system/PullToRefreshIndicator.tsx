"use client";

/**
 * PullToRefreshIndicator — Indicador visual para usePullToRefresh.
 *
 * Muestra un spinner que rota con el progreso (0→1) y cambia a spin
 * continuo durante el refresh.
 *
 * Uso:
 *   const { ref, progress, distance, isRefreshing } = usePullToRefresh({ onRefresh });
 *   <div ref={ref} className="h-full overflow-y-auto">
 *     <PullToRefreshIndicator progress={progress} distance={distance} isRefreshing={isRefreshing} />
 *     ...
 *   </div>
 */

import { Loader2, ArrowDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  progress: number; // 0..1
  distance: number; // px
  isRefreshing: boolean;
  /** Altura base del indicador cuando distance=0. Default 0 */
  idleHeight?: number;
}

export default function PullToRefreshIndicator({
  progress,
  distance,
  isRefreshing,
  idleHeight = 0,
}: Props) {
  const height = isRefreshing ? 60 : Math.max(idleHeight, distance);
  const ready = progress >= 1;

  return (
    <div
      aria-hidden
      className="pointer-events-none flex items-center justify-center overflow-hidden transition-[height] duration-150"
      style={{ height: `${height}px` }}
    >
      <div
        className={cn(
          "flex items-center gap-2 text-[var(--text-tertiary)]",
          ready && !isRefreshing ? "text-[var(--accent)]" : "",
        )}
      >
        {isRefreshing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            <span className="text-xs font-bold">Actualizando...</span>
          </>
        ) : (
          <>
            <ArrowDown
              className="h-4 w-4 transition-transform"
              strokeWidth={2}
              style={{
                transform: `rotate(${progress * 180}deg)`,
              }}
            />
            <span className="text-xs font-bold">
              {ready ? "Soltá para actualizar" : "Tirá para actualizar"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
