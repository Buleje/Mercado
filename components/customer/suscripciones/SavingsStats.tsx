"use client";

/**
 * SavingsStats — Bloque "Lo que ahorras este ano".
 *
 * Visualiza mes-por-mes el ahorro acumulado proyectado para suscripciones
 * activas. Es un preview — el backend NO calcula nada, es todo frontend.
 */

import { useMemo } from "react";
import {
  ChartWrapper,
  StatCard,
} from "@buleje/design-system";
import {
  CalendarDays,
  BadgePercent,
  TrendingUp,
} from "@buleje/design-system/icons";
import {
  FREQUENCY_PER_YEAR,
  useSubscriptions,
} from "@/contexts/subscription-context";

const fmtMoney = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Oct",
  "Nov",
  "Dic",
];

export default function SavingsStats() {
  const { subscriptions, projectedYearlySavings } = useSubscriptions();

  const { monthly, savingsPerDelivery, deliveriesPerYear } = useMemo(() => {
    const active = subscriptions.filter((s) => s.status === "active");
    const savingsPerDel = active.reduce(
      (acc, s) => acc + s.unitPrice * s.quantity * s.discount,
      0,
    );
    const delYear = active.reduce(
      (acc, s) => acc + FREQUENCY_PER_YEAR[s.frequency],
      0,
    );
    const perMonth = projectedYearlySavings / 12;
    // Serie acumulada mensual para sparkline
    const mon: number[] = [];
    let cum = 0;
    for (let i = 0; i < 12; i += 1) {
      cum += perMonth;
      mon.push(Math.round(cum));
    }
    return {
      monthly: mon,
      savingsPerDelivery: savingsPerDel,
      deliveriesPerYear: delYear,
    };
  }, [subscriptions, projectedYearlySavings]);

  if (projectedYearlySavings <= 0) return null;

  const currentMonth = new Date().getMonth();

  return (
    <ChartWrapper
      title="Tu ahorro este ano"
      description="Estimado si mantenes tus suscripciones activas los 12 meses."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard
          label="Ahorro anual"
          value={fmtMoney(projectedYearlySavings)}
          icon={BadgePercent}
          emphasis="success"
          density="compact"
        />
        <StatCard
          label="Por entrega"
          value={fmtMoney(savingsPerDelivery)}
          icon={TrendingUp}
          density="compact"
        />
        <StatCard
          label="Entregas/ano"
          value={deliveriesPerYear}
          icon={CalendarDays}
          density="compact"
        />
      </div>

      {/* Monthly bar chart — pure SVG, no deps */}
      <div className="relative">
        <div className="flex items-end gap-1.5 h-24">
          {monthly.map((value, i) => {
            const max = monthly[monthly.length - 1] || 1;
            const height = Math.max(4, (value / max) * 100);
            const isPast = i <= currentMonth;
            return (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-1"
                title={`${MESES[i]}: ${fmtMoney(value)}`}
              >
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${height}%`,
                    backgroundColor: isPast
                      ? "var(--data-success)"
                      : "color-mix(in oklch, var(--data-success) 28%, var(--surface-sunken))",
                  }}
                  aria-hidden
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {MESES.map((m, i) => (
            <div
              key={m}
              className="flex-1 text-center text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] tabular-nums"
            >
              {i === currentMonth ? (
                <strong className="text-[var(--text-primary)]">{m}</strong>
              ) : (
                m
              )}
            </div>
          ))}
        </div>
      </div>
    </ChartWrapper>
  );
}
