"use client";

/**
 * ExplorarTrustStrip — Banda de confianza minimalista.
 *
 * 4 stats con números grandes en accent. Sin gradientes payaso —
 * la fuerza está en la escala tipográfica y los dividers limpios.
 */

import { Store, Users, Truck, Wallet, type LucideIcon } from "@buleje/design-system/icons";

interface TrustItem {
  icon: LucideIcon;
  big: string;
  label: string;
  sub: string;
}

const ITEMS: TrustItem[] = [
  { icon: Store, big: "200+", label: "Bodegas activas", sub: "En toda Pucallpa" },
  { icon: Users, big: "5.4k", label: "Vecinos felices", sub: "Este mes" },
  { icon: Truck, big: "25 min", label: "Promedio entrega", sub: "Puerta a puerta" },
  { icon: Wallet, big: "Yape · Plin", label: "Pago seguro", sub: "Efectivo también" },
];

export default function ExplorarTrustStrip() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-[var(--rule-soft)]">
          {ITEMS.map((it) => {
            const Icon = it.icon;
            return (
              <div
                key={it.label}
                className="group flex items-start gap-3 p-5 sm:p-6 transition-colors hover:bg-[var(--surface-canvas)]"
              >
                <span className="inline-flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-3xl sm:text-4xl font-black tracking-[-0.025em] leading-none text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                    {it.big}
                  </p>
                  <p className="mt-2 text-sm sm:text-base font-black text-[var(--text-primary)] leading-tight">
                    {it.label}
                  </p>
                  <p className="text-xs font-semibold text-[var(--text-tertiary)] leading-tight">{it.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
