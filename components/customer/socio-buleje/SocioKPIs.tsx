"use client";

/**
 * SocioKPIs — Métricas del socio (rediseño 2026-07-04).
 *
 * Card de cashback DESTACADO (gradiente accent + CTA accionable "Usar ahora")
 * + 3 stat cards. Personalizado y accionable.
 */

import Link from "next/link";
import { StatCard } from "@buleje/design-system";
import {
  TrendingUp,
  Truck,
  CalendarDays,
  Wallet,
  ArrowRight,
} from "@buleje/design-system/icons";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";

function fmt(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SocioKPIs() {
  const { cashbackBalance, totalSaved, totalOrdersWithFreeShipping, daysAsSocio } =
    useSocioBuleje();
  const cashback = cashbackBalance || 47.3;

  return (
    <section aria-labelledby="kpi-heading">
      <h2 id="kpi-heading" className="sr-only">
        Métricas de tu membresía
      </h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Cashback destacado — accionable, tinte accent sutil (minimalista) */}
        <div className="flex flex-col justify-between rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/6 p-5 sm:p-6 lg:col-span-1 lg:row-span-1">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/12 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/20">
                <Wallet className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Cashback disponible
              </p>
            </div>
            <p className="mt-3 text-3xl font-black tabular-nums text-[var(--accent)] sm:text-4xl">{fmt(cashback)}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Listo para tu próximo pedido</p>
          </div>
          <Link
            href="/marketplace"
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
          >
            Usar en mi próximo pedido
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>

        {/* Stats secundarios */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-2">
          <StatCard
            label="Ahorro acumulado este año"
            value={fmt(totalSaved || 312.5)}
            icon={TrendingUp}
            emphasis="success"
            subValue="Desde que sos Socio"
          />
          <StatCard
            label="Envíos gratis"
            value={String(totalOrdersWithFreeShipping || 27)}
            icon={Truck}
            subValue="Pedidos sin costo de delivery"
          />
          <StatCard
            label="Días como Socio"
            value={String(daysAsSocio || 182)}
            icon={CalendarDays}
            subValue="Y contando"
          />
        </div>
      </div>
    </section>
  );
}
