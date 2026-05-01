"use client";

/**
 * VenderRevenueCalculator — inputs interactivos: pedidos/mes, ticket promedio,
 * comisión. Output: "Ganás S/ X al mes".
 *
 * Fórmula Feynman:
 *   revenue_bruto = pedidos × ticket
 *   comision_buleje = revenue_bruto × 0.05 (5% plan Pro) · 0% primer mes
 *   ingreso_neto = revenue_bruto - comision_buleje
 *
 * Toda la lógica se calcula client-side — landing informativa, no persiste.
 */

import { useState, useMemo } from "react";
import { Calculator, TrendingUp } from "@buleje/design-system/icons";

const DEFAULTS = {
  orders: 120,
  ticket: 45,
  commissionPct: 5, // default plan Pro
};

function formatSoles(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function VenderRevenueCalculator() {
  const [orders, setOrders] = useState(DEFAULTS.orders);
  const [ticket, setTicket] = useState(DEFAULTS.ticket);
  const [freeFirstMonth, setFreeFirstMonth] = useState(true);

  const result = useMemo(() => {
    const gross = orders * ticket;
    const commissionPct = freeFirstMonth ? 0 : DEFAULTS.commissionPct;
    const commission = gross * (commissionPct / 100);
    const net = gross - commission;
    return { gross, commission, net, commissionPct };
  }, [orders, ticket, freeFirstMonth]);

  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <header className="mb-10 max-w-2xl">
          <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            <Calculator className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
            Calculadora de ingresos
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            ¿Cuánto vas a ganar el mes que viene?
          </h2>
          <p className="mt-3 text-[var(--text-secondary)]">
            Movele a los controles como si estuvieras armando el pedido del
            mayorista. Los números son estimativos pero son la media real de
            las bodegas que ya venden.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Inputs */}
          <div className="space-y-5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 lg:col-span-3">
            {/* Pedidos por mes */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label
                  htmlFor="orders"
                  className="text-sm font-semibold text-[var(--text-primary)]"
                >
                  Pedidos por mes
                </label>
                <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {orders}
                </span>
              </div>
              <input
                id="orders"
                type="range"
                min={10}
                max={600}
                step={10}
                value={orders}
                onChange={(e) => setOrders(Number(e.target.value))}
                className="w-full accent-[var(--text-primary)]"
              />
              <div className="mt-1 flex justify-between text-[length:var(--ts-2xs)] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                <span>10</span>
                <span>600</span>
              </div>
            </div>

            {/* Ticket promedio */}
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label
                  htmlFor="ticket"
                  className="text-sm font-semibold text-[var(--text-primary)]"
                >
                  Ticket promedio (S/)
                </label>
                <span className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {formatSoles(ticket)}
                </span>
              </div>
              <input
                id="ticket"
                type="range"
                min={15}
                max={150}
                step={5}
                value={ticket}
                onChange={(e) => setTicket(Number(e.target.value))}
                className="w-full accent-[var(--text-primary)]"
              />
              <div className="mt-1 flex justify-between text-[length:var(--ts-2xs)] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                <span>S/ 15</span>
                <span>S/ 150</span>
              </div>
            </div>

            {/* Plan */}
            <fieldset className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                Plan
              </legend>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-[var(--surface-canvas)] px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="plan"
                    checked={freeFirstMonth}
                    onChange={() => setFreeFirstMonth(true)}
                    className="accent-[var(--text-primary)]"
                  />
                  <span className="flex-1 text-[var(--text-primary)]">
                    <strong className="font-semibold">Gratis primer mes</strong>{" "}
                    <span className="text-[var(--text-tertiary)]">· 0% comisión</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-[var(--surface-canvas)] px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="plan"
                    checked={!freeFirstMonth}
                    onChange={() => setFreeFirstMonth(false)}
                    className="accent-[var(--text-primary)]"
                  />
                  <span className="flex-1 text-[var(--text-primary)]">
                    <strong className="font-semibold">Plan Pro</strong>{" "}
                    <span className="text-[var(--text-tertiary)]">· 5% comisión</span>
                  </span>
                </label>
              </div>
            </fieldset>
          </div>

          {/* Output — ingreso neto */}
          <div className="space-y-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--text-primary)] p-6 text-[var(--surface-canvas)] lg:col-span-2">
            <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] opacity-70">
              <TrendingUp className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Ingreso neto estimado
            </p>
            <p className="text-5xl font-extrabold tracking-tight tabular-nums sm:text-6xl">
              {formatSoles(result.net)}
            </p>
            <p className="text-sm opacity-80">por mes en tu bolsillo</p>
            <div className="space-y-2 border-t border-[var(--surface-canvas)]/20 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="opacity-70">Ventas brutas</span>
                <span className="font-semibold tabular-nums">
                  {formatSoles(result.gross)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="opacity-70">
                  Comisión Buleje ({result.commissionPct}%)
                </span>
                <span className="font-semibold tabular-nums">
                  {formatSoles(result.commission)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
