"use client";

/**
 * SocioCalculadora — Slider interactivo de "cuánto ahorrás".
 *
 * Input: compras al mes (S/ 50-500).
 * Output: ahorro delivery + cashback = total anual + payback.
 */

import { useMemo, useState } from "react";
import {
  SectionTitle,
  BodyText,
  Caption,
  Kicker,
  StatCard,
} from "@buleje/design-system";
import { Calculator } from "@buleje/design-system/icons";
import { PLAN_PRICES } from "@/lib/validators/socio-buleje";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";

const MIN = 50;
const MAX = 500;
const STEP = 10;
const DEFAULT = 200;

function fmt(v: number): string {
  return `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

export function SocioCalculadora() {
  const [spend, setSpend] = useState(DEFAULT);
  const { computeSavings } = useSocioBuleje();
  const savings = useMemo(() => computeSavings(spend), [spend, computeSavings]);

  const yearlyCost = PLAN_PRICES.yearly;
  const net = savings.total - yearlyCost;
  const paybackDays = savings.total > 0
    ? Math.max(1, Math.round((yearlyCost / savings.total) * 365))
    : 365;

  return (
    <section
      className="border-y border-[var(--rule-muted)] bg-[var(--surface-sunken)]/60"
      aria-labelledby="calculadora-heading"
    >
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <header className="text-center max-w-xl mx-auto mb-10">
          <Kicker className="inline-flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5" aria-hidden />
            Calculadora
          </Kicker>
          <SectionTitle
            id="calculadora-heading"
            as="h2"
            className="font-display mt-2 text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)]"
          >
            ¿Cuánto ahorrás siendo Socio?
          </SectionTitle>
          <BodyText className="mt-3 text-[var(--text-secondary)]">
            Moviendo el deslizador calculás el ahorro anual estimado según tus
            compras mensuales.
          </BodyText>
        </header>

        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-8">
          {/* Slider */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <Caption className="font-semibold text-[var(--text-secondary)]">
                Compras al mes
              </Caption>
              <span className="text-[length:var(--ts-xl)] font-extrabold tabular-nums text-[var(--text-primary)]">
                {fmt(spend)}
              </span>
            </div>

            <input
              type="range"
              min={MIN}
              max={MAX}
              step={STEP}
              value={spend}
              onChange={(e) => setSpend(Number(e.target.value))}
              aria-label="Compras mensuales estimadas"
              className="w-full h-2 rounded-full bg-[var(--surface-sunken)] appearance-none cursor-pointer accent-[var(--accent)]"
            />

            <div className="mt-2 flex justify-between">
              <Caption className="text-[var(--text-tertiary)]">{fmt(MIN)}</Caption>
              <Caption className="text-[var(--text-tertiary)]">{fmt(MAX)}</Caption>
            </div>
          </div>

          {/* Output */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Ahorro en delivery"
              value={fmt(savings.deliverySavings)}
              subValue="al año"
            />
            <StatCard
              label="Cashback acumulado"
              value={fmt(savings.cashbackSavings)}
              subValue="al año"
            />
            <StatCard
              label="Ahorro total"
              value={fmt(savings.total)}
              subValue="al año"
              emphasis="success"
            />
          </div>

          {/* Payback summary — card gradiente accent (punch premium) */}
          <div
            className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl p-5 text-white"
            style={{
              backgroundImage:
                "linear-gradient(120deg, var(--accent) 0%, var(--accent-dark) 100%)",
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-black leading-tight sm:text-xl">
                {net > 0
                  ? `Ahorrás ${fmt(net)} netos al año`
                  : "Tu ahorro cubre el costo del plan"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/85">
                Costo anual del plan: {fmt(yearlyCost)}. La suscripción se paga
                sola en {paybackDays} {paybackDays === 1 ? "día" : "días"}.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/70">
                Payback
              </p>
              <p className="text-[length:var(--ts-2xl)] font-black tabular-nums">
                {paybackDays}d
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
