"use client";

/**
 * SocioComparacion — Comparativa Invitado vs Socio (rediseño 2026-07-04).
 *
 * Tabla en card redondeado con la columna "Socio Buleje" DESTACADA (fondo
 * accent-soft + header en accent + checks accent). Coherente con el hero premium.
 */

import { SectionTitle, BodyText, Kicker } from "@buleje/design-system";
import { Check, Minus, Star } from "@buleje/design-system/icons";

type Row = {
  feature: string;
  invitado: string | "no";
  socio: string;
};

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
    <section
      className="mx-auto max-w-5xl px-4 py-16 sm:py-20"
      aria-labelledby="comparacion-heading"
    >
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

      <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-base)]">
                <th className="px-5 py-4 font-bold text-[var(--text-tertiary)]">Beneficio</th>
                <th className="px-5 py-4 text-center font-bold text-[var(--text-tertiary)]">Invitado</th>
                <th className="bg-[var(--accent)]/8 px-5 py-4 text-center">
                  <span className="inline-flex items-center gap-1.5 font-black text-[var(--accent)]">
                    <Star className="h-4 w-4 fill-[var(--accent)]" aria-hidden />
                    Socio Buleje
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.feature}
                  className={i < ROWS.length - 1 ? "border-b border-[var(--rule-soft)]" : ""}
                >
                  <td className="px-5 py-4 font-semibold text-[var(--text-primary)]">
                    {row.feature}
                  </td>
                  <td className="px-5 py-4 text-center">
                    {row.invitado === "no" ? (
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-tertiary)]">
                        <Minus className="h-4 w-4" aria-hidden />
                        No incluido
                      </span>
                    ) : (
                      <span className="text-[var(--text-secondary)]">{row.invitado}</span>
                    )}
                  </td>
                  <td className="bg-[var(--accent)]/8 px-5 py-4 text-center">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                      </span>
                      {row.socio}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
