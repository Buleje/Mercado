"use client";

/**
 * SocioComparacion — Invitado vs Socio (rediseño 2026-07-04, v2).
 *
 * En vez de una tabla plana, DOS tarjetas contrastantes lado a lado: "Invitado"
 * apagada (dashes) y "Socio Buleje" premium (tinte accent + ribbon + checks). El
 * contraste hace evidente el valor de un vistazo.
 */

import { SectionTitle, BodyText, Kicker } from "@buleje/design-system";
import { Check, Minus, Crown } from "@buleje/design-system/icons";

type Row = { feature: string; invitado: string | "no"; socio: string };

const ROWS: readonly Row[] = [
  { feature: "Delivery", invitado: "Pago por cada pedido", socio: "Gratis e ilimitado" },
  { feature: "Cashback en compras", invitado: "no", socio: "5% en cada pedido" },
  { feature: "Precios exclusivos", invitado: "no", socio: "Productos seleccionados" },
  { feature: "Acceso anticipado a ofertas", invitado: "no", socio: "24 horas antes" },
  { feature: "Soporte por WhatsApp", invitado: "Estándar", socio: "Prioritario" },
  { feature: "Puntos de fidelidad", invitado: "Estándar", socio: "2× puntos" },
  { feature: "Permanencia", invitado: "Ninguna", socio: "Cancelás cuando quieras" },
];

export function SocioComparacion() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20" aria-labelledby="comparacion-heading">
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <Kicker>Comparación</Kicker>
        <SectionTitle
          id="comparacion-heading"
          as="h2"
          className="mt-2 text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)]"
        >
          Invitado vs Socio Buleje
        </SectionTitle>
        <BodyText className="mt-3 text-[var(--text-secondary)]">
          Las diferencias se sienten desde el primer pedido.
        </BodyText>
      </header>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
        {/* Invitado — apagada */}
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
          <div className="mb-5">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Sin membresía
            </p>
            <h3 className="text-xl font-black text-[var(--text-secondary)]">Invitado</h3>
          </div>
          <ul className="space-y-3.5">
            {ROWS.map((r) => (
              <li key={r.feature} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                  <Minus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--text-secondary)]">{r.feature}</span>
                  <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    {r.invitado === "no" ? "No incluido" : r.invitado}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Socio — premium */}
        <div className="relative rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/6 p-6 shadow-[var(--shadow-md)] md:-mt-3">
          <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-3 py-1 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wide)] text-white shadow-sm">
            <Crown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            Recomendado
          </span>
          <div className="mb-5 mt-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
              Membresía
            </p>
            <h3 className="text-xl font-black text-[var(--text-primary)]">Socio Buleje</h3>
          </div>
          <ul className="space-y-3.5">
            {ROWS.map((r) => (
              <li key={r.feature} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{r.feature}</span>
                  <span className="block text-[length:var(--ts-xs)] font-semibold text-[var(--accent)]">{r.socio}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
