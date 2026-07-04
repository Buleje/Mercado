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
        {/* Cashback destacado — accionable */}
        <div
          className="relative flex flex-col justify-between overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-md)] sm:p-6 lg:col-span-1 lg:row-span-1"
          style={{
            backgroundImage:
              "linear-gradient(140deg, var(--accent) 0%, var(--accent-dark) 100%)",
          }}
        >
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/25">
                <Wallet className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/80">
                Cashback disponible
              </p>
            </div>
            <p className="mt-3 text-3xl font-black tabular-nums sm:text-4xl">{fmt(cashback)}</p>
            <p className="mt-1 text-sm text-white/80">Listo para tu próximo pedido</p>
          </div>
          <Link
            href="/marketplace"
            className="relative mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[var(--accent-dark)] transition-transform hover:-translate-y-0.5"
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
