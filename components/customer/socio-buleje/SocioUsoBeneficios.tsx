"use client";

/**
 * SocioUsoBeneficios — Uso de beneficios del mes con DATOS REALES (ledger).
 *
 * Muestra el cashback ganado este mes vs. una meta, y el saldo disponible. Sin
 * datos de prueba: todo sale del context (que hidrata del ledger real).
 */

import { SectionTitle, CardTitle, Caption, Kicker } from "@buleje/design-system";
import { cn } from "@buleje/design-system";
import { useSocioBuleje } from "@/contexts/socio-buleje-context";

const MONTHLY_GOAL = 100; // meta de cashback mensual (S/)

function fmt(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
}

export function SocioUsoBeneficios() {
  const { thisMonthCashback, cashbackBalance } = useSocioBuleje();

  const rows = [
    {
      label: "Cashback ganado este mes",
      value: thisMonthCashback,
      goal: MONTHLY_GOAL,
      description:
        thisMonthCashback >= MONTHLY_GOAL
          ? "¡Meta del mes alcanzada! 🎉"
          : `Te faltan ${fmt(Math.max(0, MONTHLY_GOAL - thisMonthCashback))} para la meta de ${fmt(MONTHLY_GOAL)}`,
    },
    {
      label: "Saldo disponible para usar",
      value: cashbackBalance,
      goal: Math.max(cashbackBalance, 1),
      description: "Aplicalo como descuento en tu próximo pedido",
    },
  ];

  return (
    <section aria-labelledby="uso-heading">
      <header className="mb-4">
        <Kicker>Tu mes en curso</Kicker>
        <SectionTitle id="uso-heading" className="mt-1">
          Beneficios en marcha
        </SectionTitle>
      </header>

      <ul className="space-y-3">
        {rows.map((u) => (
          <li
            key={u.label}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>{u.label}</CardTitle>
                <Caption className="mt-0.5 text-[var(--text-tertiary)]">{u.description}</Caption>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-[length:var(--ts-lg)] font-extrabold tabular-nums text-[var(--text-primary)]">
                  {fmt(u.value)}
                </span>
                {u.goal > u.value && (
                  <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]"> / {fmt(u.goal)}</span>
                )}
              </div>
            </div>
            <ProgressBar pct={Math.min(100, u.goal > 0 ? (u.value / u.goal) * 100 : 0)} />
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
          pct >= 75 ? "bg-[var(--data-success-500)]" : "bg-[var(--accent)]",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default SocioUsoBeneficios;
