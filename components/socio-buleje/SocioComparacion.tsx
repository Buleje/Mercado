"use client";

/**
 * SocioComparacion — Tabla comparativa Invitado vs Socio Buleje.
 *
 * Usa DataTable DS + check/dash en tokens.
 */

import {
  SectionTitle,
  BodyText,
  DataTable,
  Kicker,
} from "@buleje/design-system";
import { Check, Minus } from "@buleje/design-system/icons";

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

function Cell({ value, active }: { value: string | "no"; active?: boolean }) {
  if (value === "no") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--text-tertiary)]">
        <Minus className="h-3.5 w-3.5" aria-hidden />
        No incluido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)]">
      {active && (
        <Check
          className="h-3.5 w-3.5 text-[var(--data-success)] shrink-0"
          aria-hidden
        />
      )}
      {value}
    </span>
  );
}

export function SocioComparacion() {
  return (
    <section
      className="mx-auto max-w-5xl px-4 py-16 sm:py-20"
      aria-labelledby="comparacion-heading"
    >
      <header className="text-center max-w-2xl mx-auto mb-10">
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

      <DataTable>
        <thead>
          <tr>
            <th>Beneficio</th>
            <th>Invitado</th>
            <th>Socio Buleje</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.feature}>
              <td className="font-semibold text-[var(--text-primary)]">{row.feature}</td>
              <td>
                <Cell value={row.invitado} />
              </td>
              <td>
                <Cell value={row.socio} active />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}
