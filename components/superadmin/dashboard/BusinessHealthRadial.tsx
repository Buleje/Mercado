"use client";

/**
 * BusinessHealthRadial — radial bar chart con 3 métricas de salud:
 * conversión de trial, retención (1 - churn), share activos sin riesgo.
 * Incluye score combinado y recomendación accionable.
 */

import { useMemo } from "react";
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";
import { ChartWrapper } from "@buleje/design-system";
import { CheckCircle, AlertTriangle } from "@buleje/design-system/icons";

interface Props {
  trialConversionRate: number; // %
  churnRate: number; // %
  activeTenants: number;
  totalTenants: number;
  atRiskCount: number;
}

interface Metric {
  key: string;
  label: string;
  value: number; // 0-100
  raw: string;
  color: string;
}

export function BusinessHealthRadial({
  trialConversionRate,
  churnRate,
  activeTenants,
  totalTenants,
  atRiskCount,
}: Props) {
  const metrics = useMemo<Metric[]>(() => {
    const retention = Math.max(0, 100 - churnRate);
    const activeShare = totalTenants > 0 ? (activeTenants / totalTenants) * 100 : 0;
    const conv = Math.max(0, Math.min(100, trialConversionRate));
    return [
      {
        key: "conversion",
        label: "Conversión trial",
        value: conv,
        raw: `${conv.toFixed(0)}%`,
        color: "var(--data-success, #10b981)",
      },
      {
        key: "retention",
        label: "Retención",
        value: retention,
        raw: `${retention.toFixed(0)}%`,
        color: "var(--accent, #6366f1)",
      },
      {
        key: "active",
        label: "Activos",
        value: activeShare,
        raw: `${activeShare.toFixed(0)}%`,
        color: "var(--data-info, #3b82f6)",
      },
    ];
  }, [trialConversionRate, churnRate, activeTenants, totalTenants]);

  const score = Math.round(
    metrics.reduce((s, m) => s + m.value, 0) / metrics.length,
  );
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";
  const isHealthy = score >= 70;

  return (
    <ChartWrapper
      title="Salud del negocio"
      description="Conversión, retención y actividad"
    >
      <div className="flex flex-col gap-4">
        {/* Score + radial */}
        <div className="relative" style={{ width: "100%", height: 200, minHeight: 160 }}>
          <ResponsiveContainer width="99%" height="99%" debounce={50}>
            <RadialBarChart
              data={metrics}
              innerRadius="40%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              barSize={10}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar
                dataKey="value"
                cornerRadius={6}
                background={{ fill: "var(--surface-sunken)" }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          {/* Center score */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Score
            </span>
            <span
              className="text-[length:var(--ts-3xl)] font-extrabold tabular-nums leading-none"
              style={{
                color: isHealthy ? "var(--data-success, #10b981)" : "#0d9488",
              }}
            >
              {score}
            </span>
            <span className="mt-0.5 text-[length:var(--ts-xs)] font-bold tabular-nums text-[var(--text-secondary)]">
              Grado {grade}
            </span>
          </div>
        </div>

        {/* Metric rows */}
        <ul className="space-y-2">
          {metrics.map((m) => (
            <li key={m.key} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: m.color }}
                aria-hidden
              />
              <span className="text-[length:var(--ts-sm)] font-bold text-[var(--text-primary)] flex-1">
                {m.label}
              </span>
              <span className="text-[length:var(--ts-sm)] font-extrabold tabular-nums text-[var(--text-primary)]">
                {m.raw}
              </span>
            </li>
          ))}
        </ul>

        {/* Status callout */}
        <div
          className={
            "flex items-start gap-2 rounded-lg border p-2.5 " +
            (isHealthy
              ? "border-[var(--data-success,#10b981)]/30 bg-[var(--data-success,#10b981)]/5"
              : "border-[#0d9488]/30 bg-[#0d9488]/5")
          }
        >
          {isHealthy ? (
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-[var(--data-success,#10b981)]" />
          ) : (
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[#0d9488]" />
          )}
          <p className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] leading-snug">
            {isHealthy ? (
              <>
                Salud sólida.{" "}
                {atRiskCount > 0 ? (
                  <>
                    <strong className="text-[var(--text-primary)]">{atRiskCount}</strong>{" "}
                    {atRiskCount === 1 ? "tienda" : "tiendas"} en riesgo a vigilar.
                  </>
                ) : (
                  "Sin tiendas en riesgo."
                )}
              </>
            ) : (
              <>
                Atención: revisar{" "}
                {churnRate > 5 ? "churn elevado" : "conversión baja"}.{" "}
                {atRiskCount > 0 && (
                  <>
                    <strong className="text-[var(--text-primary)]">{atRiskCount}</strong> en riesgo.
                  </>
                )}
              </>
            )}
          </p>
        </div>
      </div>
    </ChartWrapper>
  );
}
