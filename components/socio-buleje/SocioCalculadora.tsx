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
  CardTitle,
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
            className="mt-2 text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)]"
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
              className="w-full h-2 rounded-full bg-[var(--surface-sunken)] appearance-none cursor-pointer accent-[var(--text-primary)]"
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

          {/* Payback summary */}
          <div className="mt-6 rounded-xl border border-[var(--rule-muted)] bg-[var(--surface-sunken)]/60 p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-[length:var(--ts-base)]">
                  {net > 0
                    ? `Ahorrás ${fmt(net)} netos al año`
                    : "Tu ahorro cubre el costo del plan"}
                </CardTitle>
                <BodyText className="mt-1 text-[var(--text-secondary)]">
                  Costo anual del plan: {fmt(yearlyCost)}. La suscripción se
                  paga sola en {paybackDays} {paybackDays === 1 ? "día" : "días"}.
                </BodyText>
              </div>
              <div className="text-right shrink-0">
                <Caption className="text-[var(--text-tertiary)]">Payback</Caption>
                <p className="text-[length:var(--ts-2xl)] font-extrabold tabular-nums text-[var(--text-primary)]">
                  {paybackDays}d
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
