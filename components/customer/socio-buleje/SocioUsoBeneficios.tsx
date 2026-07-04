"use client";

/**
 * SocioUsoBeneficios — Progress bars con uso mensual de beneficios.
 */

import {
  SectionTitle,
  CardTitle,
  Caption,
  Kicker,
} from "@buleje/design-system";
import { cn } from "@buleje/design-system";

type UsoRow = {
  label: string;
  value: number;
  goal: number;
  unit: string;
  description: string;
};

const USOS: readonly UsoRow[] = [
  {
    label: "Cashback generado este mes",
    value: 47,
    goal: 100,
    unit: "S/",
    description: "Te faltan S/ 53 para la meta de S/ 100",
  },
  {
    label: "Pedidos con delivery gratis",
    value: 12,
    goal: 20,
    unit: "pedidos",
    description: "Sigue pidiendo sin costo de envío",
  },
  {
    label: "Ofertas exclusivas usadas",
    value: 6,
    goal: 12,
    unit: "ofertas",
    description: "Tienes 6 ofertas más disponibles",
  },
];

export function SocioUsoBeneficios() {
  return (
    <section aria-labelledby="uso-heading">
      <header className="mb-4">
        <Kicker>Tu uso este mes</Kicker>
        <SectionTitle id="uso-heading" className="mt-1">
          Beneficios en marcha
        </SectionTitle>
      </header>

      <ul className="space-y-3">
        {USOS.map((u) => (
          <li
            key={u.label}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <CardTitle>{u.label}</CardTitle>
                <Caption className="mt-0.5 text-[var(--text-tertiary)]">
                  {u.description}
                </Caption>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[length:var(--ts-lg)] font-extrabold tabular-nums text-[var(--text-primary)]">
                  {u.unit === "S/" ? `S/ ${u.value}` : u.value}
                </span>
                <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  {" "}/ {u.unit === "S/" ? `S/ ${u.goal}` : `${u.goal} ${u.unit}`}
                </span>
              </div>
            </div>

            <ProgressBar pct={Math.min(100, (u.value / u.goal) * 100)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="mt-3 h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden"
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-700",
          pct >= 75
            ? "bg-[var(--data-success-500)]"
            : "bg-[var(--accent)]",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// re-export as default too
export default SocioUsoBeneficios;
