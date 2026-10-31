"use client";

/**
 * Los avisos ámbar de la franja que NO se dibujan fuera de Inicio (Brandon
 * 19-10, «Más espacio arriba»: la franja ocupaba una fila en todas las
 * pantallas y repetía la campanita). La franja (`AdminAlertsBanner`) los
 * publica acá —mismos datos, sin pedir nada nuevo— y la campanita los muestra
 * con un punto y una lista arriba del centro de notificaciones. Lo rojo sigue
 * en la franja en todas las pantallas.
 */
import { useSyncExternalStore } from "react";
import { AlertTriangle, X } from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";

export interface AvisoEscondido {
  id: string;
  label: string;
  /** Dato corto (la fecha, el plan…). */
  resumen?: string;
  count?: number;
  cta: string;
  href: string;
}

const VACIO: readonly AvisoEscondido[] = [];
let avisos: readonly AvisoEscondido[] = VACIO;
let firma = "[]";
let cerrar: ((id: string) => void) | null = null;
const oyentes = new Set<() => void>();

/** La franja dice cuáles quedaron fuera de la vista y cómo se cierra uno (respeta lo ya cerrado). */
export function fijarAvisosEscondidos(lista: readonly AvisoEscondido[], alCerrar: ((id: string) => void) | null): void {
  cerrar = alCerrar;
  const nueva = JSON.stringify(lista);
  if (nueva === firma) return;
  firma = nueva;
  avisos = lista.length > 0 ? lista : VACIO;
  for (const avisar of oyentes) avisar();
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

export function useAvisosEscondidos(): readonly AvisoEscondido[] {
  return useSyncExternalStore(
    suscribir,
    () => avisos,
    () => VACIO,
  );
}

/** La lista compacta para el centro de notificaciones. `alIr` cierra el centro antes de navegar. */
export function AvisosDeLaFranja({ alIr }: { alIr: () => void }) {
  const lista = useAvisosEscondidos();
  if (lista.length === 0) return null;
  return (
    <section aria-label="Avisos del negocio" className="py-2">
      <ul className="flex flex-col gap-1">
        {lista.map((a) => (
          <li key={a.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface-sunken)] pl-3">
            {/* La cifra ya va dentro del rótulo («1 solicitud…»): acá es la marca, como en la franja. */}
            {a.count != null ? (
              <span
                aria-hidden
                className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--data-warning-500)]/15 px-1.5 text-sm font-bold tabular-nums text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              >
                {a.count}
              </span>
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
              {a.label}
              {a.resumen ? <span className="text-[var(--text-tertiary)]"> · {a.resumen}</span> : null}
            </span>
            <button
              type="button"
              onClick={() => {
                alIr();
                irAEnlace(a.href);
              }}
              className="h-12 shrink-0 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--surface-raised)] dark:text-[var(--accent)]"
            >
              {a.cta}
            </button>
            <button
              type="button"
              onClick={() => cerrar?.(a.id)}
              aria-label={`Ocultar «${a.label}»`}
              title="Ocultar por 6 horas"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
