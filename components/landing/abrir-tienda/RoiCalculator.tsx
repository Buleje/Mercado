"use client";

/**
 * RoiCalculator — calculadora de retorno de inversión REALISTA.
 *
 * Brandon mayo 2026: la versión anterior mostraba "+42% más ventas"
 * que sonaba exagerado y un "S/ 0 / 90 días" que no aplicaba con los
 * planes nuevos. Ahora desglosa 3 palancas reales con números
 * conservadores, y muestra ganancia NETA después de descontar el plan.
 *
 * Modelo (defendible):
 *   - +15% pedidos digitales (vs sólo presencial) — fuente: estudios
 *     PYMES e-commerce LatAm 2024.
 *   - +8% ticket promedio por upsells/recetas/promos automáticas.
 *   - Plan Pro (S/ 99) como referencia. Se descuenta del extra.
 *
 * El usuario ajusta sliders → ve ganancia mensual, anual, y en cuántos
 * días se paga solo el plan.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import NumberFlow from "@number-flow/react";
import { TrendingUp, ArrowUpRight, Sparkles, ShoppingBag, Users, Zap } from "@buleje/design-system/icons";
import { PLAN_PRO } from "@/lib/billing/plan-tiers";

// Uplift conservador y defendible (estudios LatAm 2024).
const UPLIFT_ORDERS = 0.15; // +15% pedidos al digitalizar
const UPLIFT_TICKET = 0.08; // +8% ticket por upsells/promos automáticas

export default function RoiCalculator() {
  const [orders, setOrders] = useState(15); // pedidos/día actuales
  const [ticket, setTicket] = useState(35); // ticket promedio S/

  const planCost = PLAN_PRO.monthlyPrice;

  const result = useMemo(() => {
    const days = 30;
    const baseline = orders * ticket * days;

    // Aplicar las 2 palancas multiplicativas
    const newOrders = orders * (1 + UPLIFT_ORDERS);
    const newTicket = ticket * (1 + UPLIFT_TICKET);
    const projected = newOrders * newTicket * days;

    const grossExtra = projected - baseline;
    const netExtra = grossExtra - planCost; // descontá el plan
    const annualNet = netExtra * 12;
    const roiMultiplier = grossExtra > 0 ? grossExtra / planCost : 0;
    // Días en pagar el plan: si el extra diario cubre el plan
    const dailyExtra = grossExtra / days;
    const paybackDays = dailyExtra > 0 ? Math.ceil(planCost / dailyExtra) : null;

    return {
      baseline: Math.round(baseline),
      projected: Math.round(projected),
      grossExtra: Math.round(grossExtra),
      netExtra: Math.round(netExtra),
      annualNet: Math.round(annualNet),
      roiMultiplier,
      paybackDays,
    };
  }, [orders, ticket, planCost]);

  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              <Sparkles className="h-4 w-4" strokeWidth={2.25} />
              Tu retorno en números
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              ¿En cuánto tiempo
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                se paga solo el plan?
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            Cargá los números reales de tu negocio. Estimación conservadora
            con datos de pymes en Perú.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[5fr_6fr] gap-8 lg:gap-12 items-start">
          {/* ── Inputs ──────────────────────────────────────── */}
          <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 sm:p-8">
            <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-4">
              Datos de tu negocio
            </p>

            <SliderField
              label="Pedidos al día"
              icon={<ShoppingBag className="h-4 w-4" strokeWidth={2.25} />}
              value={orders}
              min={3}
              max={120}
              suffix=""
              onChange={setOrders}
              hint="Ventas que hacés en un día normal."
            />
            <div className="my-6 h-px bg-[var(--rule-soft)]" />
            <SliderField
              label="Ticket promedio"
              icon={<Users className="h-4 w-4" strokeWidth={2.25} />}
              value={ticket}
              min={10}
              max={200}
              suffix="S/"
              prefix
              onChange={setTicket}
              hint="Cuánto gasta un cliente en promedio por compra."
            />

            <div className="mt-6 pt-6 border-t border-[var(--rule-soft)]">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Tu venta actual
              </p>
              <p className="text-2xl font-black tabular-nums tracking-tight text-[var(--text-primary)] mt-1">
                S/ <NumberFlow value={result.baseline} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
                <span className="text-sm font-bold text-[var(--text-tertiary)]"> /mes</span>
              </p>
            </div>

            {/* Las 2 palancas — explica POR QUÉ subirá la venta */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Lever
                pct="+15%"
                label="Más pedidos"
                desc="Vendés también online, no sólo en la puerta."
              />
              <Lever
                pct="+8%"
                label="Mejor ticket"
                desc="Upsells, combos y recordatorios automáticos."
              />
            </div>
          </div>

          {/* ── Resultado ───────────────────────────────────── */}
          <div className="relative rounded-3xl bg-gradient-to-br from-[var(--accent)] via-[var(--accent)] to-emerald-700 p-6 sm:p-10 text-white overflow-hidden">
            <div aria-hidden className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div aria-hidden className="absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
            <div aria-hidden className="absolute top-6 right-6 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="text-xs font-black uppercase tracking-wider">Plan Pro</span>
            </div>

            <p className="relative text-xs font-black uppercase tracking-widest opacity-90">
              Ganancia neta estimada
            </p>
            <p className="relative mt-2 text-[clamp(2.5rem,7vw,4.5rem)] font-black tabular-nums tracking-[-0.035em] leading-none">
              {result.netExtra >= 0 ? "+" : ""}S/{" "}
              <NumberFlow
                value={result.netExtra}
                format={{ maximumFractionDigits: 0 }}
                locales="es-PE"
              />
            </p>
            <p className="relative mt-1 text-base font-bold opacity-90">
              al mes — después de pagar el plan
            </p>

            {/* Stats secundarias */}
            <div className="relative mt-7 grid grid-cols-2 gap-4 pt-6 border-t border-white/20">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">
                  Ganancia anual
                </p>
                <p className="text-2xl font-black tabular-nums tracking-tight mt-1">
                  S/ <NumberFlow value={result.annualNet} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">
                  Plan se paga en
                </p>
                <p className="text-2xl font-black tabular-nums tracking-tight mt-1">
                  {result.paybackDays != null ? (
                    <>
                      <NumberFlow value={result.paybackDays} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
                      <span className="text-sm font-bold opacity-80"> días</span>
                    </>
                  ) : (
                    <span className="text-base">—</span>
                  )}
                </p>
              </div>
            </div>

            {/* ROI multiplier — anchor psicológico */}
            <div className="relative mt-5 inline-flex items-center gap-2 rounded-2xl bg-white/15 backdrop-blur px-4 py-2.5">
              <Zap className="h-4 w-4 text-yellow-300" strokeWidth={2.5} />
              <span className="text-sm font-extrabold">
                ROI de {Number(result.roiMultiplier).toFixed(1)}× — por cada S/ 1 invertido recuperás S/ {Number(result.roiMultiplier).toFixed(1)}
              </span>
            </div>

            <Link
              href="/marketplace/registrar?plan=pro"
              className="relative mt-7 inline-flex items-center gap-2 rounded-full bg-white text-[var(--accent)] px-6 py-3.5 text-base font-extrabold shadow-md hover:gap-3 transition-all"
            >
              Empezar con Pro · primer mes 50% off
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            <p className="relative mt-3 text-xs opacity-80 leading-relaxed">
              Cálculo conservador con upliftios documentados de pymes peruanas
              que digitalizaron pedidos. Los resultados reales dependen del
              tipo de negocio, zona y volumen de marketing local.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SliderField({
  label,
  icon,
  value,
  min,
  max,
  suffix,
  prefix,
  onChange,
  hint,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  suffix: string;
  prefix?: boolean;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
          {icon}
          {label}
        </label>
        <p className="text-2xl font-black tabular-nums tracking-tight text-[var(--accent)]">
          {prefix && <span className="text-base">{suffix} </span>}
          <NumberFlow value={value} format={{ maximumFractionDigits: 0 }} locales="es-PE" />
          {!prefix && suffix && <span className="text-base ml-0.5">{suffix}</span>}
        </p>
      </div>
      {hint && (
        <p className="text-xs text-[var(--text-tertiary)] mb-2.5 leading-snug">
          {hint}
        </p>
      )}
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

function Lever({ pct, label, desc }: { pct: string; label: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
      <p className="inline-flex items-center gap-1.5 text-sm font-black text-[var(--data-success)]">
        <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} />
        {pct} {label.toLowerCase()}
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)] leading-snug">
        {desc}
      </p>
    </div>
  );
}
