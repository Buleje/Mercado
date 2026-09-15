"use client";

import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { CHART_PALETTE } from "./palette";

/**
 * BulejeWaterfallChart — flujo positive/negative con acumulado.
 *
 * Patron clasico de reportes financieros: ingresos -> gastos -> utilidad.
 * Render en SVG nativo, sin librerias.
 *
 * ── Por que hay capa de hover ───────────────────────────────────────────────
 * Una cascada responde "como llegue a este numero", y la mitad de esa respuesta
 * es el ACUMULADO en cada paso — que no se puede etiquetar sobre la barra sin
 * tapar el valor del paso. Cada barra es foco de teclado y trae `<title>`, y el
 * detalle sincronizado debajo muestra el paso senalado con su acumulado.
 *
 * @example
 * <BulejeWaterfallChart
 *   steps={[
 *     { label: "Inicio", value: 0, type: "baseline" },
 *     { label: "Ventas", value: 12000, type: "positive" },
 *     { label: "Insumos", value: -4500, type: "negative" },
 *     { label: "Sueldos", value: -2800, type: "negative" },
 *     { label: "Utilidad", value: 4700, type: "total" },
 *   ]}
 *   currency="S/"
 * />
 */

export interface WaterfallStep {
  label: string;
  value: number;
  type: "baseline" | "positive" | "negative" | "total";
}

interface BulejeWaterfallChartProps {
  steps: WaterfallStep[];
  label?: string;
  sublabel?: string;
  currency?: string;
  /**
   * Formato propio del valor. Pisa a `currency` — necesario cuando la magnitud
   * no es plata: m³ con dos decimales, piezas, porcentajes. Recibe el valor con
   * su signo original.
   */
  formatValue?: (value: number) => string;
  /** Texto del detalle cuando no hay ningun paso senalado. */
  hint?: string;
  height?: number;
  className?: string;
}

export const BulejeWaterfallChart = memo(function BulejeWaterfallChart({
  steps,
  label,
  sublabel,
  currency = "S/",
  formatValue,
  hint,
  height = 260,
  className,
}: BulejeWaterfallChartProps) {
  const [activo, setActivo] = useState<number | null>(null);

  // Compute cumulative values for each step
  let cumulative = 0;
  const bars = steps.map((step) => {
    if (step.type === "baseline") {
      cumulative = step.value;
      return { ...step, start: 0, end: step.value, cumulative };
    }
    if (step.type === "total") {
      return { ...step, start: 0, end: step.value, cumulative: step.value };
    }
    const start = cumulative;
    cumulative += step.value;
    return { ...step, start, end: cumulative, cumulative };
  });

  const allValues = bars.flatMap((b) => [b.start, b.end]);
  const maxVal = Math.max(...allValues);
  const minVal = Math.min(0, Math.min(...allValues));
  const range = maxVal - minVal || 1;

  /**
   * Alto util: 40 abajo para las etiquetas y 16 arriba para el valor. Sin ese
   * respiro superior, la barra mas alta llegaba al techo del lienzo y su cifra
   * —dibujada 6 unidades por encima— quedaba fuera del viewBox: justo el paso
   * mas importante era el unico sin numero.
   */
  const TOP_PAD = 16;
  const chartH = height - 40;
  const alto = chartH - TOP_PAD;

  /**
   * El viewBox se dimensiona en unidades cercanas al pixel real, no al numero
   * de barras: con `100 / bars.length` una cascada de cuatro pasos daba un
   * lienzo de 128 unidades estirado a ~330px, y el texto de 10 se dibujaba a
   * 26 — las etiquetas de abajo se montaban unas sobre otras. Con un ancho
   * base fijo la escala queda cerca de 1 y la tipografia mide lo que dice.
   */
  const W = Math.max(320, bars.length * 72);
  const slot = W / bars.length;
  const barWidth = Math.min(56, slot * 0.62);
  const xDe = (i: number) => i * slot + (slot - barWidth) / 2;
  /** Cuantos caracteres entran bajo una barra sin pisar a la vecina. */
  const maxChars = Math.max(6, Math.floor(slot / 6));

  const colorFor = (type: WaterfallStep["type"]) => {
    switch (type) {
      case "positive":
        return CHART_PALETTE.accent;
      case "negative":
        return CHART_PALETTE.error;
      case "baseline":
      case "total":
      default:
        return CHART_PALETTE.primary;
    }
  };

  // El signo se conserva: una cascada sin el "−" obliga a deducir la direccion
  // por el color, que es justo lo que un daltonico no puede hacer.
  const fmt = (v: number) => {
    if (formatValue) return formatValue(v);
    const abs = `${currency}${Math.abs(v).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
    return v < 0 ? `−${abs}` : abs;
  };

  const detalle = activo != null ? bars[activo] : null;

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

      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="xMidYMax meet"
          className="w-full h-full"
          role="group"
          aria-label={sublabel ?? label ?? "Cascada de valores"}
        >
          {/* Zero line */}
          <line
            x1={0}
            y1={chartH - ((0 - minVal) / range) * alto}
            x2={W}
            y2={chartH - ((0 - minVal) / range) * alto}
            stroke="var(--rule-base, #e5e5e5)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          {bars.map((b, i) => {
            const x = xDe(i);
            const y1 = chartH - ((Math.max(b.start, b.end) - minVal) / range) * alto;
            const y2 = chartH - ((Math.min(b.start, b.end) - minVal) / range) * alto;
            const h = Math.abs(y2 - y1);
            const señalado = activo === i;
            return (
              <g
                key={`${b.label}-${i}`}
                tabIndex={0}
                role="listitem"
                aria-label={`${b.label}: ${fmt(b.value)}. Acumulado ${fmt(b.cumulative)}.`}
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo((prev) => (prev === i ? null : prev))}
                onFocus={() => setActivo(i)}
                onBlur={() => setActivo((prev) => (prev === i ? null : prev))}
                className="outline-none [&:focus-visible>rect]:stroke-[var(--text-primary)]"
                style={{ cursor: "default" }}
              >
                <title>{`${b.label}: ${fmt(b.value)} · acumulado ${fmt(b.cumulative)}`}</title>
                {/* Zona de hover del alto completo: apuntar una barra de 3px de
                    alto (un paso chico) es imposible; el area la agranda. */}
                <rect x={x} y={0} width={barWidth} height={chartH} fill="transparent" />
                <rect
                  x={x}
                  y={y1}
                  width={barWidth}
                  height={h}
                  rx={2}
                  fill={colorFor(b.type)}
                  strokeWidth={2}
                  opacity={activo == null || señalado ? 1 : 0.45}
                  style={{
                    transition: "all 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDelay: `${i * 0.08}s`,
                  }}
                />
                {/* Connector line from prev bar to this bar (except first) */}
                {i > 0 && b.type !== "total" && (
                  <line
                    x1={xDe(i - 1) + barWidth}
                    y1={chartH - ((bars[i - 1].end - minVal) / range) * alto}
                    x2={x}
                    y2={chartH - ((b.start - minVal) / range) * alto}
                    stroke="var(--rule-base, #e5e5e5)"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                )}
                {/* Value label on top */}
                <text
                  x={x + barWidth / 2}
                  y={y1 - 6}
                  textAnchor="middle"
                  className="fill-[var(--text-primary)]"
                  style={{ fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                >
                  {fmt(b.value)}
                </text>
                {/* Bottom label */}
                <text
                  x={x + barWidth / 2}
                  y={chartH + 20}
                  textAnchor="middle"
                  className="fill-[var(--text-tertiary)]"
                  style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}
                >
                  {b.label.length > maxChars ? b.label.slice(0, maxChars - 1) + "…" : b.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Detalle sincronizado: el acumulado no cabe sobre la barra. Reserva su
          alto siempre, para que senalar un paso no mueva el grafico. */}
      <p className="mt-2 min-h-[1.25rem] text-xs text-[var(--text-secondary)]" aria-live="polite">
        {detalle ? (
          <>
            <span className="font-bold text-[var(--text-primary)]">{detalle.label}</span>{" "}
            <span className="tabular-nums">{fmt(detalle.value)}</span>
            {detalle.type !== "total" && detalle.type !== "baseline" && (
              <span className="text-[var(--text-tertiary)]">
                {" "}
                · acumulado <span className="tabular-nums">{fmt(detalle.cumulative)}</span>
              </span>
            )}
          </>
        ) : (
          <span className="text-[var(--text-tertiary)]">{hint ?? "Señalá una barra para ver el acumulado."}</span>
        )}
      </p>
    </div>
  );
});
