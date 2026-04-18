"use client";

import {
  LineChart,
  Line,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartWrapper, useChartTokens, Caption, Kicker } from "@buleje/design-system";
import { fmtSoles, type ARPUPoint } from "@/lib/mocks/superadmin-dashboard.mock";

interface Props {
  data: ARPUPoint[];
  currentARPU: number;
}

function ARPUTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1.5 shadow-[var(--shadow-sm)]">
      <div className="text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-semibold">
        {label}
      </div>
      <div className="text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
        {fmtSoles(value)}
      </div>
    </div>
  );
}

/**
 * Mini chart de ARPU histórico con current value prominente.
 *
 * MOCK: buildARPUSeries. Reemplazar con /api/superadmin/dashboard/arpu-series.
 */
export function ARPUMiniChart({ data, currentARPU }: Props) {
  const tokens = useChartTokens();
  const first = data[0]?.arpu ?? currentARPU;
  const last = data[data.length - 1]?.arpu ?? currentARPU;
  const deltaPct = first > 0 ? ((last - first) / first) * 100 : 0;

  return (
    <ChartWrapper title="ARPU" description="Promedio por tenant pagante">
      <div className="mb-4">
        <Kicker>Valor actual</Kicker>
        <div className="mt-1 text-[length:var(--ts-2xl)] font-extrabold tabular-nums leading-[var(--lh-tight)] text-[var(--text-primary)]">
          {fmtSoles(currentARPU)}
        </div>
        <Caption
          className="mt-1 tabular-nums"
          style={{
            color:
              deltaPct > 0
                ? "var(--data-success)"
                : deltaPct < 0
                  ? "var(--data-error)"
                  : "var(--text-tertiary)",
          }}
        >
          {deltaPct > 0 ? "+" : ""}
          {deltaPct.toFixed(1)}% vs 6 meses atrás
        </Caption>
      </div>
      <div style={{ height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="month"
              stroke={tokens.axis}
              tick={{ fontSize: 10, fill: tokens.axis }}
              tickLine={false}
              axisLine={false}
              height={18}
            />
            <Tooltip
              content={<ARPUTooltip />}
              cursor={{ stroke: tokens.grid, strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="arpu"
              stroke={tokens.stroke}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: tokens.stroke, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}
