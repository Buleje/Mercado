"use client";

/**
 * ChartSkeleton
 *
 * Placeholder visual que se muestra mientras recharts carga de forma diferida.
 * Usa el mismo espacio (height + aspect-ratio) que los charts reales para evitar
 * CLS (Cumulative Layout Shift).
 *
 * Props:
 *   height  — altura fija en px. Por defecto 300, coincide con la mayoría de charts admin.
 *   label   — texto opcional para accesibilidad (aria-label).
 */

interface ChartSkeletonProps {
  height?: number;
  label?: string;
  className?: string;
}

export default function ChartSkeleton({
  height = 300,
  label = "Cargando gráfico...",
  className = "",
}: ChartSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`w-full animate-pulse rounded-xl bg-muted ${className}`}
      style={{ height }}
    >
      {/* Barras decorativas que simulan un bar chart */}
      <div className="flex h-full items-end justify-around px-6 pb-6 pt-4 gap-2">
        {[0.4, 0.7, 0.55, 0.9, 0.65, 0.8, 0.5, 0.75].map((ratio, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-md bg-muted-foreground/20"
            style={{ height: `${ratio * 100}%` }}
          />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
