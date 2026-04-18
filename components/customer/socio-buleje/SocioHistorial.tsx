"use client";

/**
 * SocioHistorial — Chart inline SVG de ahorro mensual (últimos 6 meses).
 *
 * Usa ChartWrapper del DS + bar chart SVG puro (sin Recharts).
 */

import {
  ChartWrapper,
  BodyText,
  Caption,
} from "@buleje/design-system";
import { MOCK_MONTHLY_SAVINGS } from "@/lib/mocks/socio-buleje.mock";

const CHART_HEIGHT = 160;
const BAR_WIDTH = 28;
const GAP = 18;

export function SocioHistorial() {
  const data = MOCK_MONTHLY_SAVINGS;
  const max = Math.max(...data.map((d) => d.amount), 1);
  const total = data.reduce((a, b) => a + b.amount, 0);
  const avg = Math.round(total / data.length);
  const chartWidth = data.length * (BAR_WIDTH + GAP);

  return (
    <ChartWrapper
      title="Historial de ahorro"
      description={`Total de S/ ${total} en los últimos ${data.length} meses (promedio S/ ${avg}/mes)`}
    >
      <div className="relative -mx-1 overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT + 30}`}
          className="w-full"
          style={{ maxWidth: chartWidth, minWidth: "100%" }}
          aria-label="Gráfico de ahorro mensual"
          role="img"
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((pct) => (
            <line
              key={pct}
              x1="0"
              x2={chartWidth}
              y1={CHART_HEIGHT - pct * CHART_HEIGHT}
              y2={CHART_HEIGHT - pct * CHART_HEIGHT}
              stroke="var(--rule-soft)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          ))}

          {data.map((d, i) => {
            const barHeight = (d.amount / max) * CHART_HEIGHT;
            const x = i * (BAR_WIDTH + GAP) + GAP / 2;
            const y = CHART_HEIGHT - barHeight;
            return (
              <g key={d.month}>
                <rect
                  x={x}
                  y={y}
                  width={BAR_WIDTH}
                  height={barHeight}
                  rx="4"
                  fill="var(--text-primary)"
                  opacity="0.85"
                />
                <text
                  x={x + BAR_WIDTH / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill="var(--text-primary)"
                >
                  {d.amount}
                </text>
                <text
                  x={x + BAR_WIDTH / 2}
                  y={CHART_HEIGHT + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--text-tertiary)"
                >
                  {d.month.split(" ")[0]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-[var(--rule-muted)] pt-3">
        <BodyText className="text-[var(--text-secondary)]">
          Total acumulado este período
        </BodyText>
        <p className="text-[length:var(--ts-xl)] font-extrabold tabular-nums text-[var(--text-primary)]">
          S/ {total}
        </p>
      </div>
      <Caption className="mt-1 text-[var(--text-tertiary)]">
        Incluye delivery gratis + cashback generado.
      </Caption>
    </ChartWrapper>
  );
}
