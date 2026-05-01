"use client";

/**
 * RoiCalculator — calculadora interactiva de ROI para convencer al dueño
 * del negocio. El usuario ajusta sliders (pedidos/día, ticket promedio) y
 * ve en tiempo real cuánto podría facturar al mes con Buleje vs sin.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import NumberFlow from "@number-flow/react";
import { TrendingUp, ArrowUpRight, Sparkles } from "@buleje/design-system/icons";

const UPLIFT = 0.42; // 42% más ventas estimado por usar la plataforma

export default function RoiCalculator() {
  const [orders, setOrders] = useState(15); // pedidos/día actuales
  const [ticket, setTicket] = useState(35); // ticket promedio S/

  const monthly = useMemo(() => {
    const days = 30;
    const baseline = orders * ticket * days;
    const withBuleje = baseline * (1 + UPLIFT);
    const extra = withBuleje - baseline;
    return {
      baseline: Math.round(baseline),
      withBuleje: Math.round(withBuleje),
      extra: Math.round(extra),
      annualExtra: Math.round(extra * 12),
    };
  }, [orders, ticket]);

  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              <Sparkles className="h-4 w-4" strokeWidth={2.25} />
              Calculá tu ganancia
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              ¿Cuánto más podrías
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                vender en 30 días?
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            Mové los sliders con los datos de tu negocio. La proyección se
            actualiza en vivo.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[5fr_6fr] gap-8 lg:gap-12 items-center">
          {/* Inputs */}
          <div className="rounded-3xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-8">
            <SliderField
              label="Pedidos al día"
              value={orders}
              min={3}
              max={120}
              suffix=""
              onChange={setOrders}
            />
            <div className="my-6 h-px bg-[var(--rule-soft)]" />
            <SliderField
              label="Ticket promedio"
              value={ticket}
              min={10}
              max={200}
              suffix="S/"
              prefix
              onChange={setTicket}
            />

            <div className="mt-8 pt-6 border-t border-[var(--rule-soft)] flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Tu venta actual
                </p>
                <p className="text-2xl font-black tabular-nums tracking-tight text-[var(--text-primary)] mt-1">
                  S/ <NumberFlow value={monthly.baseline} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
                  <span className="text-sm font-bold text-[var(--text-tertiary)]"> /mes</span>
                </p>
              </div>
              <span className="hidden sm:inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] text-xl font-black">
                →
              </span>
            </div>
          </div>

          {/* Resultado dramático */}
          <div className="relative rounded-3xl bg-linear-to-br from-[var(--accent)] via-emerald-600 to-[var(--accent)] p-6 sm:p-10 text-white overflow-hidden">
            {/* Decorativos */}
            <div aria-hidden className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div aria-hidden className="absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
            <div aria-hidden className="absolute top-6 right-6 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="text-xs font-black uppercase tracking-wider">+42%</span>
            </div>

            <p className="relative text-xs font-black uppercase tracking-widest opacity-90">
              Con Buleje, podrías facturar
            </p>
            <p className="relative mt-2 text-[clamp(2.5rem,7vw,4.5rem)] font-black tabular-nums tracking-[-0.035em] leading-none">
              S/{" "}
              <NumberFlow
                value={monthly.withBuleje}
                format={{ maximumFractionDigits: 0 }}
                locales="es-PE"
              />
            </p>
            <p className="relative mt-1 text-base font-bold opacity-90">
              al mes — eso es{" "}
              <span className="bg-white text-[var(--accent)] rounded-md px-1.5 py-0.5 font-black">
                +S/ <NumberFlow value={monthly.extra} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
              </span>{" "}
              extra cada mes.
            </p>

            <div className="relative mt-6 grid grid-cols-2 gap-4 pt-6 border-t border-white/20">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">
                  Extra al año
                </p>
                <p className="text-2xl font-black tabular-nums tracking-tight mt-1">
                  S/ <NumberFlow value={monthly.annualExtra} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">
                  Inversión
                </p>
                <p className="text-2xl font-black tabular-nums tracking-tight mt-1">
                  S/ 0 <span className="text-xs font-bold opacity-80">/ 90 días</span>
                </p>
              </div>
            </div>

            <Link
              href="/marketplace/registrar"
              className="relative mt-7 inline-flex items-center gap-2 rounded-full bg-white text-[var(--accent)] px-6 py-3.5 text-base font-extrabold shadow-md hover:gap-3 transition-all"
            >
              Empezar gratis ahora
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            <p className="relative mt-3 text-xs opacity-80">
              * Estimación basada en uplift promedio de 42% al primer trimestre.
              Resultados reales pueden variar.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  suffix,
  prefix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  prefix?: boolean;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <label className="text-sm font-extrabold text-[var(--text-primary)]">
          {label}
        </label>
        <p className="text-2xl font-black tabular-nums tracking-tight text-[var(--accent)]">
          {prefix && <span className="text-base">{suffix} </span>}
          <NumberFlow value={value} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
          {!prefix && suffix && <span className="text-base ml-0.5">{suffix}</span>}
        </p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full h-3 rounded-full appearance-none cursor-pointer bg-[var(--surface-sunken)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--surface-sunken) ${pct}%, var(--surface-sunken) 100%)`,
        }}
      />
      <div className="mt-1.5 flex justify-between text-xs font-semibold text-[var(--text-tertiary)] tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
