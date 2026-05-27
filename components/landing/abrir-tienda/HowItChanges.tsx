"use client";

/**
 * HowItChanges — sección "Cómo cambia tu día con Buleje".
 *
 * Reemplaza al RoiCalculator anterior (Brandon mayo 2026: "muy inmoral
 * prometer cifras"). En lugar de cifras inventadas, mostramos los
 * cambios concretos que un dueño percibe en su día a día — verificables,
 * no proyectables.
 *
 * Side-by-side: ANTES (sin Buleje) vs DESPUÉS (con Buleje), agrupado en
 * 4 momentos del día. Sin números mágicos, sin uplifts.
 */

import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  X,
  Check,
  Sunrise,
  ShoppingCart,
  MessageCircle,
  Moon,
  type LucideIcon,
} from "@buleje/design-system/icons";

interface Comparison {
  moment: string;
  icon: LucideIcon;
  beforeTime: string;
  afterTime: string;
  before: string;
  after: string;
}

const COMPARISONS: Comparison[] = [
  {
    moment: "A las 7:00 AM",
    icon: Sunrise,
    beforeTime: "20 min",
    afterTime: "30 seg",
    before: "Anotás el inventario en un cuaderno y cruzás dedos para que cuadre.",
    after: "Abrís Buleje y ya sabés qué se vendió ayer, qué falta y qué pedir.",
  },
  {
    moment: "Cuando entra un cliente",
    icon: ShoppingCart,
    beforeTime: "2-3 min",
    afterTime: "5 seg",
    before: "Le decís el precio de memoria y a veces te equivocás. La balanza es manual.",
    after: "Escaneás el código, se calcula solo y se descuenta del stock al instante.",
  },
  {
    moment: "Cuando un vecino te escribe por WhatsApp",
    icon: MessageCircle,
    beforeTime: "10 min",
    afterTime: "0 min",
    before: "Le copiás precios uno a uno, calculás a mano y le mandás cuenta de banco.",
    after: "Te pasa un link, arma su pedido solo y tú sólo aceptás y despachás.",
  },
  {
    moment: "Al cierre del día",
    icon: Moon,
    beforeTime: "45 min",
    afterTime: "1 click",
    before: "Sumás recibos a mano, te falta plata, no sabés bien qué pasó.",
    after: "Ves el reporte real: ventas, fiados, productos top, flujo de caja.",
  },
];

export default function HowItChanges() {
  return (
    <section className="py-20 sm:py-28 bg-[var(--surface-canvas)]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 sm:mb-16">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            Tu día a día
          </p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold tracking-[-0.035em] text-[var(--text-primary)] leading-[0.98]">
            Lo mismo que ya hacés,{" "}
            <br className="hidden sm:block" />
            <span className="italic font-serif text-[var(--accent)]">
              sin perder tiempo ni plata.
            </span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
            No te prometemos números mágicos. Te mostramos las cosas concretas
            que cambian desde el primer día.
          </p>
        </div>

        {/* Línea de tiempo del día — la mañana al cierre. Spine + nodos por momento */}
        <ol className="relative max-w-4xl mx-auto">
          {/* Spine vertical (detrás de los nodos) */}
          <div
            aria-hidden
            className="absolute left-6 sm:left-7 top-7 bottom-7 w-0.5 bg-linear-to-b from-[var(--accent)]/50 via-[var(--accent)]/25 to-[var(--accent)]/0"
          />

          {COMPARISONS.map((c) => {
            const Icon = c.icon;
            return (
              <li key={c.moment} className="relative flex gap-4 sm:gap-6 pb-6 last:pb-0">
                {/* Nodo del momento sobre el spine */}
                <div className="relative z-10 shrink-0">
                  <span
                    aria-hidden
                    className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--accent)]/35 text-[var(--accent)] shadow-[var(--shadow-md)]"
                  >
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2} />
                  </span>
                </div>

                {/* Tarjeta del momento */}
                <div className="group flex-1 min-w-0 rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-base)] overflow-hidden transition-all hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-md)]">
                  {/* Header: momento + chip de ahorro */}
                  <div className="px-5 sm:px-6 py-3.5 border-b border-[var(--rule-soft)] flex items-center gap-3">
                    <p className="flex-1 text-sm font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)] truncate">
                      {c.moment}
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-3 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider whitespace-nowrap shadow-sm shadow-[var(--accent)]/20">
                      <span className="line-through opacity-60 tabular-nums">{c.beforeTime}</span>
                      <ArrowRight className="h-3 w-3" strokeWidth={3} />
                      <span className="tabular-nums">{c.afterTime}</span>
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--rule-soft)]">
                    {/* Antes */}
                    <div className="px-5 sm:px-6 py-5 flex items-start gap-3 bg-[var(--surface-sunken)]/40">
                      <span aria-hidden className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--rule-base)] text-[var(--text-tertiary)]">
                        <X className="h-4 w-4" strokeWidth={2.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1.5">
                          Hoy sin Buleje
                        </p>
                        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{c.before}</p>
                      </div>
                    </div>

                    {/* Después */}
                    <div className="px-5 sm:px-6 py-5 flex items-start gap-3 bg-[var(--accent-soft)]">
                      <span aria-hidden className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white shadow-md shadow-[var(--accent)]/25">
                        <Check className="h-4 w-4" strokeWidth={2.75} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
                          Con Buleje
                        </p>
                        <p className="text-sm font-semibold leading-relaxed text-[var(--text-primary)]">{c.after}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {/* CTA + microcopy honesto */}
        <div className="mt-14 text-center">
          <Link
            href="#planes"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-7 py-3.5 text-base font-extrabold shadow-md hover:gap-3 hover:shadow-lg transition-all"
          >
            Ver los planes
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            <ArrowUpRight className="hidden h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </Link>
          <p className="mt-4 text-sm text-[var(--text-tertiary)] max-w-md mx-auto">
            Lo verificás tú mismo en el primer mes — sin tarjeta, sin compromiso,
            y los datos siempre quedan tuyos.
          </p>
        </div>
      </div>
    </section>
  );
}
