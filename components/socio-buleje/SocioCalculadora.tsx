"use client";

/**
 * SocioCalculadora — "¿Cuánto ahorrás?" (rediseño 2026-07-04, v2).
 *
 * Layout de 2 columnas: a la izquierda el slider + desglose (delivery/cashback);
 * a la derecha un MEDIDOR SEMICIRCULAR (gauge SVG) que se llena con el ahorro
 * anual + el payback. Elemento único e interactivo.
 */

import { useMemo, useState } from "react";
import { SectionTitle, BodyText, Caption, Kicker } from "@buleje/design-system";
import { Calculator, Truck, Coins } from "@buleje/design-system/icons";
import { PLAN_PRICES } from "@/lib/validators/socio-buleje";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";

const MIN = 50;
const MAX = 500;
const STEP = 10;
const DEFAULT = 200;

function fmt(v: number): string {
  return `S/ ${v.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}

// ── Gauge helpers (semicírculo 180°) ──────────────────────────────────────────
const CX = 120;
const CY = 118;
const R = 96;
function polar(frac: number) {
  const a = ((180 - 180 * Math.min(1, Math.max(0, frac))) * Math.PI) / 180;
  return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) };
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function arc(f0: number, f1: number) {
  const s = polar(f0);
  const e = polar(f1);
  return `M ${round2(s.x)} ${round2(s.y)} A ${R} ${R} 0 0 1 ${round2(e.x)} ${round2(e.y)}`;
}

export function SocioCalculadora() {
  const [spend, setSpend] = useState(DEFAULT);
  const { computeSavings } = useSocioBuleje();
  const savings = useMemo(() => computeSavings(spend), [spend, computeSavings]);
  const maxTotal = useMemo(() => computeSavings(MAX).total, [computeSavings]);

  const yearlyCost = PLAN_PRICES.yearly;
  const net = savings.total - yearlyCost;
  const paybackDays = savings.total > 0 ? Math.max(1, Math.round((yearlyCost / savings.total) * 365)) : 365;
  const frac = maxTotal > 0 ? Math.min(1, savings.total / maxTotal) : 0;
  const end = polar(frac);

  return (
    <section
      className="border-y border-[var(--rule-muted)] bg-[var(--surface-sunken)]/60"
      aria-labelledby="calculadora-heading"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
        <header className="mx-auto mb-10 max-w-xl text-center">
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
            Moviendo el deslizador calculás el ahorro anual estimado según tus compras mensuales.
          </BodyText>
        </header>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-8 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          {/* Columna izquierda: slider + desglose */}
          <div>
            <div className="mb-3 flex items-baseline justify-between">
              <Caption className="font-semibold text-[var(--text-secondary)]">Compras al mes</Caption>
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
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--surface-sunken)] accent-[var(--accent)]"
            />
            <div className="mt-2 flex justify-between">
              <Caption className="text-[var(--text-tertiary)]">{fmt(MIN)}</Caption>
              <Caption className="text-[var(--text-tertiary)]">{fmt(MAX)}</Caption>
            </div>

            {/* Desglose */}
            <div className="mt-6 space-y-2.5">
              {[
                { Icon: Truck, label: "Ahorro en delivery", value: savings.deliverySavings },
                { Icon: Coins, label: "Cashback acumulado", value: savings.cashbackSavings },
              ].map(({ Icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40 px-4 py-3"
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                      <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </span>
                    {label}
                  </span>
                  <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                    {fmt(value)}<span className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]"> /año</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Columna derecha: gauge */}
          <div className="flex flex-col items-center">
            <div className="relative w-full max-w-[260px]">
              <svg viewBox="0 0 240 138" className="w-full" role="img" aria-label={`Ahorro total: ${fmt(savings.total)} al año`}>
                <defs>
                  <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="var(--accent)" />
                  </linearGradient>
                </defs>
                {/* Track */}
                <path d={arc(0, 1)} fill="none" stroke="var(--surface-sunken)" strokeWidth="16" strokeLinecap="round" />
                {/* Fill */}
                <path
                  d={arc(0, Math.max(0.001, frac))}
                  fill="none"
                  stroke="url(#gauge-fill)"
                  strokeWidth="16"
                  strokeLinecap="round"
                  style={{ transition: "all 300ms cubic-bezier(0.22,1,0.36,1)" }}
                />
                {/* Punta */}
                <circle cx={end.x} cy={end.y} r="7" fill="var(--surface-raised)" stroke="var(--accent)" strokeWidth="3" style={{ transition: "all 300ms cubic-bezier(0.22,1,0.36,1)" }} />
                {/* Valor central */}
                <text x={CX} y={CY - 30} textAnchor="middle" className="fill-[var(--text-tertiary)]" fontSize="11" fontWeight="700" letterSpacing="1">AHORRO TOTAL</text>
                <text x={CX} y={CY - 2} textAnchor="middle" className="fill-[var(--accent)]" fontSize="30" fontWeight="900">{fmt(savings.total)}</text>
                <text x={CX} y={CY + 18} textAnchor="middle" className="fill-[var(--text-tertiary)]" fontSize="11">al año</text>
              </svg>
            </div>

            {/* Payback */}
            <div className="mt-2 w-full rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/6 p-4 text-center">
              <p className="text-sm font-black text-[var(--text-primary)]">
                {net > 0 ? `Ahorrás ${fmt(net)} netos al año` : "Tu ahorro cubre el costo del plan"}
              </p>
              <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                Plan {fmt(yearlyCost)}/año · se paga solo en{" "}
                <span className="font-bold text-[var(--accent)]">{paybackDays} {paybackDays === 1 ? "día" : "días"}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
