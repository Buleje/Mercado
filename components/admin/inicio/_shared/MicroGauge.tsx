"use client";

/**
 * MicroGauge — SVG circular progress ring para fila 4.
 *
 * Renderiza un anillo de progreso (donut SVG) con el valor central.
 * Sin dependencias de Recharts (es un SVG inline puro).
 *
 * Uso:
 *   <MicroGauge
 *     value={72}
 *     max={100}
 *     centerLabel="72%"
 *     centerSubLabel="Meta del mes"
 *   />
 */

import { cn } from "@/lib/utils";

interface MicroGaugeProps {
  /** Valor actual. */
  value: number;
  /** Valor maximo (denominador). Default 100. */
  max?: number;
  /** Texto principal en el centro. */
  centerLabel: string;
  /** Texto secundario debajo. */
  centerSubLabel?: string;
  /** Texto secundario arriba (sobre centerLabel). */
  centerOverLabel?: string;
  /** Tamaño del SVG en px. Default 180. */
  size?: number;
  /** Grosor del ring. Default 12. */
  strokeWidth?: number;
  /** Color del progreso. Si no se pasa, se calcula segun el % (>=80 success, >=50 warning, <50 error). */
  color?: string;
  /** Color del track. Default --surface-sunken. */
  trackColor?: string;
  /** Mostrar texto adicional debajo (ej. "S/ 1.2k de S/ 2k"). */
  footerText?: string;
}

export function MicroGauge({
  value,
  max = 100,
  centerLabel,
  centerSubLabel,
  centerOverLabel,
  size = 180,
  strokeWidth = 12,
  color,
  trackColor = "var(--surface-sunken)",
  footerText,
}: MicroGaugeProps) {
  const pct = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  // Color automatico si no se especifica
  const stroke =
    color ?? (pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444");

  return (
    <div className="flex flex-col items-center w-full">
      <div className="relative" style={{ width: `${size}px`, height: `${size}px` }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset var(--dur-slower) ease-out",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centerOverLabel && (
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted leading-none">
              {centerOverLabel}
            </span>
          )}
          <span
            className={cn(
              "text-2xl font-extrabold tabular-nums leading-tight",
              "text-[var(--text-primary)] dark:text-foreground",
            )}
          >
            {centerLabel}
          </span>
          {centerSubLabel && (
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted text-center px-2 leading-tight mt-0.5 max-w-[120px]">
              {centerSubLabel}
            </span>
          )}
        </div>
      </div>
      {footerText && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted mt-2 text-center">
          {footerText}
        </p>
      )}
    </div>
  );
}
