"use client";
import { cn } from "@/lib/utils";
import { RefreshCw, Pause, Play } from "@buleje/design-system/icons";

interface AutoRefreshControlProps {
  secondsLeft: number;
  paused: boolean;
  isActive: boolean;
  onTogglePause: () => void;
  onRefreshNow: () => void;
  className?: string;
}

export default function AutoRefreshControl({
  secondsLeft,
  paused,
  isActive,
  onTogglePause,
  onRefreshNow,
  className,
}: AutoRefreshControlProps) {
  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]", className)}>
      {isActive && (
        <span className="tabular-nums">
          Actualiza en {secondsLeft}s
        </span>
      )}
      {paused && (
        <span className="text-[var(--data-warning)] font-medium">Pausado</span>
      )}
      <button
        onClick={onTogglePause}
        className="p-1 rounded hover:bg-gray-100 transition-colors"
        title={paused ? "Reanudar auto-refresh" : "Pausar auto-refresh"}
      >
        {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
      </button>
      <button
        onClick={onRefreshNow}
        className="p-1 rounded hover:bg-gray-100 transition-colors"
        title="Actualizar ahora"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  );
}
