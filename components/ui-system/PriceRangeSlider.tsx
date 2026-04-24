"use client";

/**
 * PriceRangeSlider — Doble slider para filtro de precio min-max.
 *
 * Accesible: dos inputs range nativos superpuestos (keyboard OK, screen
 * readers OK) + track visual custom.
 *
 * Formatea con formatSoles. Onchange emite solo al soltar (no durante drag)
 * para no explotar la API de busqueda.
 *
 * Uso:
 *   <PriceRangeSlider
 *     min={0} max={200} step={5}
 *     value={[20, 80]}
 *     onChange={(r) => setFilters({ ...filters, priceRange: r })}
 *   />
 */

import { useId, useState, useEffect } from "react";
import { formatSoles } from "@/lib/chart-helpers";

interface Props {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (range: [number, number]) => void;
  /** Etiqueta accesible. Default "Rango de precio" */
  label?: string;
  /** Formatter custom. Default formatSoles */
  format?: (v: number) => string;
}

export default function PriceRangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  label = "Rango de precio",
  format = formatSoles,
}: Props) {
  const id = useId();
  const [[low, high], setLocal] = useState<[number, number]>(value);

  // Sync prop → local (ej. reset)
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = () => {
    onChange([low, high]);
  };

  const onLow = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.min(Number(e.target.value), high - step);
    setLocal([v, high]);
  };
  const onHigh = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(Number(e.target.value), low + step);
    setLocal([low, v]);
  };

  const range = max - min;
  const leftPct = ((low - min) / range) * 100;
  const rightPct = ((high - min) / range) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label
          htmlFor={`${id}-low`}
          className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"
        >
          {label}
        </label>
        <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
          {format(low)} — {format(high)}
        </span>
      </div>
      <div className="relative h-8 flex items-center">
        {/* Track base */}
        <div aria-hidden className="absolute inset-x-0 h-1.5 bg-[var(--surface-sunken)] rounded-full" />
        {/* Track active */}
        <div
          aria-hidden
          className="absolute h-1.5 bg-[var(--accent)] rounded-full"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }}
        />
        {/* Input low */}
        <input
          id={`${id}-low`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          onChange={onLow}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          aria-label={`${label} mínimo`}
          className="absolute inset-x-0 h-full bg-transparent appearance-none pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--surface-canvas)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent)] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
        />
        {/* Input high */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          onChange={onHigh}
          onMouseUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          aria-label={`${label} máximo`}
          className="absolute inset-x-0 h-full bg-transparent appearance-none pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--surface-canvas)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--accent)] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
        />
      </div>
      <div className="flex items-center justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
