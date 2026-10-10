import { Fragment } from "react";
import { Share2, Users, Truck } from "@buleje/design-system/icons";

/**
 * HowJuntaWorks — explicador visual de La Junta en 3 pasos con iconos y una
 * palabra cada uno. Reemplaza la lista de pasos escritos (menos texto, más
 * intuitivo). Presentational puro → server-compatible (sin "use client").
 */
const STEPS = [
  { icon: Share2, label: "Comparte" },
  { icon: Users, label: "Se suman" },
  { icon: Truck, label: "1 entrega" },
] as const;

export default function HowJuntaWorks({
  className = "",
}: {
  className?: string;
}) {
  return (
    <ol
      aria-label="Cómo funciona: comparte, se suman los vecinos, llega una sola entrega"
      className={`flex items-start justify-between gap-1 ${className}`}
    >
      {STEPS.map((step, i) => (
        <Fragment key={step.label}>
          <li className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-14 w-14 items-center justify-center bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <step.icon className="h-6 w-6" strokeWidth={2} aria-hidden />
            </span>
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {step.label}
            </span>
          </li>
          {i < STEPS.length - 1 && (
            <span
              className="mt-7 h-px flex-1 bg-[var(--rule-base)]"
              aria-hidden
            />
          )}
        </Fragment>
      ))}
    </ol>
  );
}
