"use client";

import { Star, ShieldCheck, Camera } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type BreakdownData = {
  count: number;
  average: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  verifiedCount: number;
  withPhotos: number;
};

interface RatingBreakdownProps {
  data: BreakdownData;
  onFilterClick?: (filter: "verified" | "with_photos") => void;
}

function Stars({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const cls =
    size === "lg" ? "h-6 w-6" : size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  // Half-star rendering: show floor stars as full, the partial as half via mask
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            cls,
            i <= Math.round(value)
              ? "text-[var(--data-warning-500)] fill-[var(--data-warning-500)]"
              : "text-gray-300 dark:text-gray-600",
          )}
        />
      ))}
    </div>
  );
}

function Bar({
  stars,
  count,
  total,
}: {
  stars: number;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-4 text-right font-medium text-gray-600 dark:text-gray-400">
        {stars}
      </span>
      <Star className="h-3 w-3 text-[var(--data-warning-500)] fill-[var(--data-warning-500)] shrink-0" />
      <div
        className="flex-1 h-2 rounded-sm bg-[var(--surface-sunken)] dark:bg-gray-800 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-[var(--data-warning-500)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
        {count}
      </span>
    </div>
  );
}

export default function RatingBreakdown({ data, onFilterClick }: RatingBreakdownProps) {
  const total = data.count;
  const avg = data.average;

  if (total === 0) {
    return (
      <div className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center">
        <Stars value={0} size="lg" />
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Aún no hay calificaciones.
        </p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Sé el primero en dejar tu opinión.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-6 items-start">
        {/* Promedio grande */}
        <div className="flex flex-col items-center sm:items-start gap-2 sm:border-r sm:border-[var(--rule-soft)] sm:pr-6">
          <div className="text-5xl font-semibold text-[var(--text-primary)] tabular-nums">
            {avg.toFixed(1)}
          </div>
          <Stars value={avg} size="md" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {total} {total === 1 ? "calificación" : "calificaciones"}
          </p>
        </div>

        {/* Distribución */}
        <div className="flex flex-col gap-1.5">
          {[5, 4, 3, 2, 1].map((s) => (
            <Bar
              key={s}
              stars={s}
              count={data.distribution[s as 1 | 2 | 3 | 4 | 5]}
              total={total}
            />
          ))}
        </div>
      </div>

      {/* Badges de filtros rapidos — bordes rectos, neutros */}
      {(data.verifiedCount > 0 || data.withPhotos > 0) && (
        <div className="mt-5 pt-4 border-t border-[var(--rule-soft)] flex flex-wrap gap-2">
          {data.verifiedCount > 0 && (
            <button
              onClick={() => onFilterClick?.("verified")}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--rule-base)] text-[var(--text-secondary)] px-3 py-1 text-xs font-medium hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--data-success-600)]" />
              {data.verifiedCount} compras verificadas
            </button>
          )}
          {data.withPhotos > 0 && (
            <button
              onClick={() => onFilterClick?.("with_photos")}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--rule-base)] text-[var(--text-secondary)] px-3 py-1 text-xs font-medium hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <Camera className="h-3.5 w-3.5" />
              {data.withPhotos} con fotos
            </button>
          )}
        </div>
      )}
    </div>
  );
}
