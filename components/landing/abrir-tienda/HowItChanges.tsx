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
import { ArrowUpRight, ArrowRight, X, Check } from "@buleje/design-system/icons";

interface Comparison {
  moment: string;
  before: string;
  after: string;
}

const COMPARISONS: Comparison[] = [
  {
    moment: "A las 7:00 AM",
    before: "Anotás el inventario en un cuaderno y cruzás dedos para que cuadre.",
    after: "Abrís Buleje y ya sabés qué se vendió ayer, qué falta y qué pedir.",
  },
  {
    moment: "Cuando entra un cliente",
    before: "Le decís el precio de memoria y a veces te equivocás. La balanza es manual.",
    after: "Escaneás el código, se calcula solo y se descuenta del stock al instante.",
  },
  {
    moment: "Cuando un vecino te escribe por WhatsApp",
    before: "Le copiás precios uno a uno, calculás a mano y le mandás cuenta de banco.",
    after: "Te pasa un link, arma su pedido solo y vos sólo aceptás y despachás.",
  },
  {
    moment: "Al cierre del día",
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
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.98]">
            Lo mismo que ya hacés,
            <br />
            <span className="text-[var(--accent)]">
              pero sin perder tiempo ni plata.
            </span>
          </h2>
          <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
            No te prometemos números mágicos. Te mostramos las cosas concretas
            que cambian desde el primer día.
          </p>
        </div>

        {/* Tabla comparativa — Antes / Después */}
        <div className="grid gap-4 max-w-4xl mx-auto">
          {COMPARISONS.map((c) => (
            <div
              key={c.moment}
              className="rounded-3xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] overflow-hidden"
            >
              <div className="px-5 sm:px-6 py-3 border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
                  {c.moment}
                </p>
              </div>
              <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--rule-base)]">
                <div className="px-5 sm:px-6 py-4 sm:py-5 flex items-start gap-3">
                  <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--rule-base)] text-[var(--text-tertiary)]">
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                      Hoy sin Buleje
                    </p>
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      {c.before}
                    </p>
                  </div>
                </div>
                <div className="px-5 sm:px-6 py-4 sm:py-5 flex items-start gap-3 bg-[var(--accent-soft)]">
                  <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-sm">
                    <Check className="h-4 w-4" strokeWidth={2.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent)] mb-1">
                      Con Buleje
                    </p>
                    <p className="text-sm font-medium leading-relaxed text-[var(--text-primary)]">
                      {c.after}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA + microcopy honesto */}
        <div className="mt-14 text-center">
          <Link
            href="#planes"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-7 py-3.5 text-base font-extrabold shadow-md hover:gap-3 hover:shadow-lg transition-all"
          >
            Ver los planes
            <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            <ArrowUpRight className="hidden h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </Link>
          <p className="mt-4 text-sm text-[var(--text-tertiary)] max-w-md mx-auto">
            Lo verificás vos mismo en el primer mes — sin tarjeta, sin compromiso,
            y los datos siempre quedan tuyos.
          </p>
        </div>
      </div>
    </section>
  );
}
