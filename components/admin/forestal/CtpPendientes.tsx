"use client";

/**
 * CtpPendientes — lo que falta hacer en el Libro, arriba de todo.
 *
 * El Libro tiene doce pestañas y "¿qué tengo pendiente?" estaba repartido entre
 * ellas: los ingresos sin validar en una, las guías del monte sin ingresar en
 * otra, los despachos sin GTF o sin anexo en otras dos, los saldos negativos en
 * la quinta. Esto lo junta, lo ordena por lo que traba el cierre y cada línea
 * lleva al lugar donde se resuelve.
 *
 * No agrega endpoints: usa los que las propias pestañas ya consumen.
 */
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Loader2 } from "@buleje/design-system/icons";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { resumenPendientes, type Pendiente } from "@/lib/forestal/ctp-pendientes";
import { useCtpPendientes } from "@/hooks/use-ctp-pendientes";

const TONO: Record<Pendiente["urgencia"], string> = {
  bloquea: "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  atrasado: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  pendiente: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
};

export default function CtpPendientes({ period, onIr }: {
  period: CtpPeriod;
  /** Salta a la pestaña donde se resuelve ese pendiente. */
  onIr: (vista: string) => void;
}) {
  const { lista, cargando, falló, recargar } = useCtpPendientes(period);


  if (cargando) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--text-tertiary)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Revisando qué falta en el libro…
      </p>
    );
  }

  // Falló la revisión: se dice, no se disfraza de "todo bien".
  if (falló) {
    return (
      <p className="flex items-center justify-between gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-xs text-[var(--text-tertiary)]">
        <span>No se pudo revisar qué falta en el libro.</span>
        <button type="button" onClick={recargar} className="font-bold text-[var(--accent)] hover:underline">Reintentar</button>
      </p>
    );
  }

  if (lista.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-4 py-3 text-xs font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {resumenPendientes(lista)}
      </p>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <ClipboardList className="h-4 w-4 text-[var(--accent)]" /> Qué falta en el libro
        </span>
        <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{resumenPendientes(lista)}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {lista.map((p) => (
          <li key={p.clave}>
            <button
              type="button"
              onClick={() => onIr(p.vista)}
              className={`flex w-full items-start gap-2 rounded-xl border-2 px-3 py-2 text-left transition hover:brightness-105 ${TONO[p.urgencia]}`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <b className="font-mono text-sm tabular-nums">{p.cantidad}</b>
                  <b className="text-xs font-bold">{p.titulo}</b>
                </span>
                <span className="mt-0.5 block text-[length:var(--ts-2xs)] opacity-80">{p.detalle}</span>
              </span>
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
