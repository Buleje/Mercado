"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * BulejeHeatmap — grid de intensidad para ventas hora/dia.
 *
 * Escala monocromatica que respeta el tema editorial. 7 dias × 24 horas default.
 *
 * @example
 * <BulejeHeatmap
 *   data={heatmapData} // [{ day: 0-6, hour: 0-23, value: number }]
 *   label="Ventas por hora"
 *   sublabel="Ultimos 30 dias"
 * />
 */

export interface HeatmapCell {
  day: number;   // 0 = Lunes, 6 = Domingo
  hour: number;  // 0-23
  value: number;
}

interface BulejeHeatmapProps {
  data: HeatmapCell[];
  label?: string;
  sublabel?: string;
  className?: string;
  /** Formato del valor en tooltip — ej "S/ {v}" o "{v} pedidos" */
  valueFormat?: (value: number) => string;
  /** Dias labels — default ["L","M","X","J","V","S","D"] */
  dayLabels?: string[];
  /** Mostrar horas cada N (default 3 → 00, 03, 06, 09...) */
  hourStep?: number;
}

const DEFAULT_DAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function BulejeHeatmap({
  data,
  label,
  sublabel,
  className,
  valueFormat = (v) => v.toLocaleString("es-PE"),
  dayLabels = DEFAULT_DAYS,
  hourStep = 3,
}: BulejeHeatmapProps) {
  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);

  // Build grid matrix [day][hour] → value (0 if not found)
  const grid = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const cell of data) {
      if (cell.day >= 0 && cell.day <= 6 && cell.hour >= 0 && cell.hour <= 23) {
        g[cell.day][cell.hour] = cell.value;
      }
    }
    return g;
  }, [data]);

  const intensity = (v: number) => {
    if (v === 0) return 0;
    return Math.max(0.08, v / maxValue);
  };

  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5", className)}>
      {(label || sublabel) && (
        <div className="mb-5">
          {label && (
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              {label}
            </p>
          )}
          {sublabel && (
            <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              {sublabel}
            </h3>
          )}
        </div>
      )}

      {/* Mobile: scroll horizontal con celdas legibles (24h no entran en
          390px → quedaban diminutas). min-w fija ~460px en móvil; en desktop
          (sm+) fit natural. Brandon 2026-05-27. */}
      <div className="overflow-x-auto -mx-1 px-1 [scrollbar-width:thin]">
      <div className="flex flex-col gap-1 min-w-[460px] sm:min-w-0">
        {/* Grid rows: 7 days */}
        {grid.map((row, dayIdx) => (
          <div key={dayIdx} className="flex items-center gap-1">
            <span className="w-5 shrink-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] text-right">
              {dayLabels[dayIdx]}
            </span>
            <div className="flex-1 grid grid-cols-24 gap-px">
              {row.map((value, hourIdx) => {
                const i = intensity(value);
                return (
                  <div
                    key={hourIdx}
                    className="aspect-square rounded-[2px] transition-all"
                    style={{
                      background:
                        i === 0
                          ? "var(--rule-soft)"
                          : `color-mix(in oklab, var(--accent) ${i * 100}%, var(--surface-raised))`,
                    }}
                    title={value > 0 ? `${dayLabels[dayIdx]} ${hourIdx}:00 — ${valueFormat(value)}` : undefined}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Hour axis */}
        <div className="flex items-center gap-1 mt-1">
          <span className="w-5 shrink-0" />
          <div className="flex-1 grid grid-cols-24 gap-px">
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} className="text-[length:var(--ts-2xs)] text-center text-[var(--text-tertiary)] font-mono tabular-nums">
                {h % hourStep === 0 ? String(h).padStart(2, "0") : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* Legend */}
      <div className="mt-5 flex items-center gap-3">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Menos</span>
        <div className="flex gap-px">
          {[0, 0.15, 0.3, 0.5, 0.7, 0.9, 1].map((i) => (
            <div
              key={i}
              className="h-3 w-3 rounded-[2px]"
              style={{
                background:
                  i === 0
                    ? "var(--rule-soft)"
                    : `color-mix(in oklab, var(--accent) ${i * 100}%, var(--surface-raised))`,
              }}
            />
          ))}
        </div>
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Más</span>
      </div>
    </div>
  );
}
