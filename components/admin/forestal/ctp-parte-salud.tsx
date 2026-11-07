/**
 * Qué le falta a la ficha del Directorio para servir en sus papeles
 * (`directorio-salud`). No bloquea: es una lista de pendientes, que es lo
 * contrario de un formulario que no deja guardar.
 *
 * Con la ficha por pasos (Brandon 24-10) se parte en dos: arriba, una línea con
 * el porcentaje (la barra de pasos ya marca cuál tiene algo por cargar); y en
 * cada paso, lo que falta DE ESE paso, al lado de los campos que lo resuelven.
 * Antes se listaban los 4 primeros arriba de todo, lejos de su campo.
 */

import { Check } from "@buleje/design-system/icons";
import type { Pendiente } from "@/lib/forestal/directorio-salud";

export function ResumenDeSalud({ listo, cuantos }: { listo: number; cuantos: number }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2">
      <span className="text-sm font-bold text-[var(--text-primary)]">
        {listo === 100 ? "Ficha completa para lo que hace" : `Ficha al ${listo}%`}
      </span>
      <div
        className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        role="progressbar"
        aria-valuenow={listo}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Qué parte de la ficha está cargada"
      >
        <div
          className={`h-full rounded-full transition-[width] ${
            listo === 100 ? "bg-[var(--data-success-500)]" : listo >= 60 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]"
          }`}
          style={{ width: `${Math.max(4, listo)}%` }}
        />
      </div>
      <span className="text-xs text-[var(--text-tertiary)]">
        {cuantos === 0 ? "No falta nada de lo que piden estos papeles" : `${cuantos} dato${cuantos === 1 ? "" : "s"} por cargar`}
      </span>
    </div>
  );
}

/** Lo que falta en este paso, arriba de sus campos. Sin nada que decir, no ocupa lugar. */
export function PendientesDelPaso({ pendientes, cubierto }: { pendientes: readonly Pendiente[]; cubierto?: string | null }) {
  if (pendientes.length === 0 && !cubierto) return null;
  return (
    <div className="mb-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2">
      {pendientes.length > 0 && (
        <ul className="space-y-1" aria-label="Lo que falta en este paso">
          {pendientes.map((x) => (
            <li key={x.campo} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  x.nivel === "alto" ? "bg-[var(--data-error-500)]" : "bg-[var(--data-warning-500)]"
                }`}
              />
              <span className="text-[var(--text-secondary)]">
                <b className="text-[var(--text-primary)]">{x.campo}</b> — {x.porque}
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* Un pendiente que desaparece en silencio confunde tanto como uno de
          más: se dice por qué dejó de pedirse. */}
      {cubierto && (
        <p className={`flex items-start gap-1.5 text-sm text-[var(--data-success-700)] dark:text-[var(--data-success-500)] ${pendientes.length > 0 ? "mt-2" : ""}`}>
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{cubierto}</span>
        </p>
      )}
    </div>
  );
}
