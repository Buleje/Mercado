"use client";

/**
 * CtpPendientes — lo que falta hacer en el Libro, en una tira.
 *
 * El Libro tiene doce pestañas y "¿qué tengo pendiente?" estaba repartido entre
 * ellas: los ingresos sin validar en una, las guías del monte sin ingresar en
 * otra, los despachos sin GTF o sin anexo en otras dos, los saldos negativos en
 * la quinta. Esto lo junta, lo ordena por lo que traba el cierre y cada chip
 * lleva al lugar donde se resuelve.
 *
 * 2026-07-26 — de panel de tarjetas (≈170px, siempre presente) a una fila de
 * chips (≈40px): es un semáforo de camino, no el contenido de la pantalla. Los
 * datos llegan por prop desde el shell, que ya los usa para los avisos de la
 * cabina — un solo fetch, una sola verdad.
 */
import { AlertTriangle, ArrowRight, CheckCircle2 } from "@buleje/design-system/icons";
import { resumenPendientes, type Pendiente } from "@/lib/forestal/ctp-pendientes";
import type { CtpPendientesState } from "@/hooks/use-ctp-pendientes";

const TONO: Record<Pendiente["urgencia"], string> = {
  bloquea:
    "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] hover:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  atrasado:
    "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] hover:border-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  pendiente:
    "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]",
};

export default function CtpPendientes({
  estado,
  onIr,
}: {
  estado: CtpPendientesState;
  /** Salta a la pestaña donde se resuelve ese pendiente, con su filtro puesto. */
  onIr: (vista: string, filtro?: Pendiente["filtro"]) => void;
}) {
  const { lista, cargando, falló, recargar } = estado;

  // Mientras se revisa no se afirma nada: tres siluetas y el ancho reservado.
  if (cargando) {
    return (
      <div className="flex gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-9 w-40 animate-pulse rounded-full bg-[var(--surface-sunken)]" />
        ))}
      </div>
    );
  }

  // Falló la revisión: se dice, no se disfraza de "todo bien".
  if (falló) {
    return (
      <p className="inline-flex h-9 items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-sm text-[var(--text-tertiary)]">
        No se pudo revisar qué falta.
        <button type="button" onClick={recargar} className="font-bold text-primary hover:underline">
          Reintentar
        </button>
      </p>
    );
  }

  if (lista.length === 0) {
    return (
      <p className="inline-flex h-9 items-center gap-2 rounded-full border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-3.5 text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        {resumenPendientes(lista)}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {lista.map((p) => (
        <button
          key={p.clave}
          type="button"
          onClick={() => onIr(p.vista, p.filtro)}
          title={p.detalle}
          className={`inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 text-sm transition-colors ${TONO[p.urgencia]}`}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <b className="font-mono tabular-nums">{p.cantidad}</b>
          <span className="font-bold">{p.titulo}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      ))}
      <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{resumenPendientes(lista)}</span>
    </div>
  );
}
