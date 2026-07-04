"use client";

/**
 * SocioHistorial — Historial de ahorro mensual (rediseño 2026-07-04).
 *
 * Chart de ÁREA con gradiente accent (SVG puro, sin librerías) + línea + puntos
 * y etiquetas de valor, badge de tendencia (último vs. mes previo) y stats
 * (total · promedio · mejor mes). Coherente con el panel premium.
 */

import { ChartWrapper } from "@buleje/design-system";
import { TrendingUp, TrendingDown } from "@buleje/design-system/icons";
import { MOCK_MONTHLY_SAVINGS } from "@/lib/mocks/socio-buleje.mock";

const H = 150; // alto del área de plot
const PAD_TOP = 24; // espacio para las etiquetas de valor
const PAD_X = 24; // margen horizontal para no cortar puntos/labels del borde
const STEP = 96; // separación horizontal entre puntos

function fmt(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

export function SocioHistorial() {
  const data = MOCK_MONTHLY_SAVINGS;
  const max = Math.max(...data.map((d) => d.amount), 1);
  const total = data.reduce((a, b) => a + b.amount, 0);
  const avg = Math.round(total / data.length);
  const best = data.reduce((a, b) => (b.amount > a.amount ? b : a), data[0]);

  const last = data[data.length - 1]?.amount ?? 0;
  const prev = data[data.length - 2]?.amount ?? last;
  const deltaPct = prev > 0 ? Math.round(((last - prev) / prev) * 100) : 0;
  const up = deltaPct >= 0;

  const innerW = (data.length - 1) * STEP;
  const W = innerW + PAD_X * 2; // ancho total del viewBox (con márgenes)
  const pt = (i: number, amount: number) => ({
    x: PAD_X + i * STEP,
    y: PAD_TOP + (H - PAD_TOP) - (amount / max) * (H - PAD_TOP),
  });
  const points = data.map((d, i) => pt(i, d.amount));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const firstX = points[0].x;
  const lastX = points[points.length - 1].x;
  const area = `M${firstX},${H} L${points.map((p) => `${p.x},${p.y}`).join(" L")} L${lastX},${H} Z`;

  return (
    <ChartWrapper
      title="Historial de ahorro"
      description={`Total de ${fmt(total)} en los últimos ${data.length} meses`}
    >
      {/* Badge de tendencia */}
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-black ${
            up
              ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-600,var(--data-success-500))]"
              : "bg-[var(--data-error-500)]/12 text-[var(--data-error-600,var(--data-error-500))]"
          }`}
        >
          {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
          {up ? "+" : ""}{deltaPct}% vs. mes anterior
        </span>
        <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          {fmt(last)} este mes
        </span>
      </div>

      <div className="relative -mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <svg
          viewBox={`0 0 ${W} ${H + 26}`}
          className="w-full"
          style={{ maxWidth: W + 40, minWidth: "100%" }}
          role="img"
          aria-label="Gráfico de ahorro mensual"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="socio-savings-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {[0.25, 0.5, 0.75, 1].map((p) => (
            <line
              key={p}
              x1="0"
              x2={W}
              y1={PAD_TOP + (H - PAD_TOP) - p * (H - PAD_TOP)}
              y2={PAD_TOP + (H - PAD_TOP) - p * (H - PAD_TOP)}
              stroke="var(--rule-soft)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
          ))}

          {/* Área + línea */}
          <path d={area} fill="url(#socio-savings-fill)" />
          <polyline
            points={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Puntos + valores + meses */}
          {data.map((d, i) => {
            const p = points[i];
            const isLast = i === data.length - 1;
            return (
              <g key={d.month}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isLast ? 5 : 3.5}
                  fill={isLast ? "var(--accent)" : "var(--surface-raised)"}
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                />
                <text
                  x={p.x}
                  y={p.y - 12}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="800"
                  fill="var(--accent)"
                >
                  {d.amount}
                </text>
                <text
                  x={p.x}
                  y={H + 18}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--text-tertiary)"
                >
                  {d.month.split(" ")[0]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--rule-muted)] pt-4">
        {[
          { label: "Total", value: fmt(total) },
          { label: "Promedio/mes", value: fmt(avg) },
          { label: "Mejor mes", value: `${fmt(best.amount)} · ${best.month.split(" ")[0]}` },
        ].map((s) => (
          <div key={s.label}>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
              {s.label}
            </p>
            <p className="mt-0.5 text-[length:var(--ts-base)] font-extrabold tabular-nums text-[var(--text-primary)]">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </ChartWrapper>
  );
}
