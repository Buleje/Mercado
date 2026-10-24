"use client";

/**
 * «Recientes» DENTRO del menú de accesos directos. Hasta el 20-10 era un reloj
 * suelto en la cabecera (M06, noche 17-10); Brandon pidió la barra con sólo
 * Cámaras y Accesos directos, y la lista se mudó acá para no perderla: lo
 * último que abriste —pestaña › vista › la ficha— para volver con un clic,
 * sin recargar (la pantalla de donde sales conserva su búsqueda, sus filtros y
 * el carrito: el panel deja montadas las pestañas).
 *
 * Los lugares los sigue anotando la cabecera (`useRegistrarRecientes` en
 * `AdminTopHeader`); se guardan por persona en este navegador.
 */

import { History, Trash2 } from "@buleje/design-system/icons";
import { ResultadoEnlazable } from "@/components/admin/shared/ResultadoEnlazable";
import { cuandoFue } from "@/components/notifications/notificaciones-categorias";
import type { Reciente } from "@/lib/admin/recientes-panel";

interface Props {
  /** Los recientes sin el lugar donde estás. */
  lista: readonly Reciente[];
  /** Hay algo guardado (aunque sea sólo esta pantalla): se ofrece borrar. */
  hayGuardados: boolean;
  alVolver: (href: string) => void;
  alBorrar: () => void;
}

export default function RecientesDelMenu({ lista, hayGuardados, alVolver, alBorrar }: Props) {
  return (
    <div role="group" aria-label="Recientes" className="mt-2 border-t border-[var(--rule-soft)] pt-2">
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <p aria-hidden className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <History className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
          Recientes
        </p>
        {hayGuardados && (
          <button
            type="button"
            role="menuitem"
            onClick={alBorrar}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Borrar la lista
          </button>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="px-2 pb-2 text-sm text-[var(--text-secondary)]">Lo que abras en el panel aparece acá para volver con un clic.</p>
      ) : (
        <ul role="none" className="max-h-60 overflow-y-auto overscroll-contain">
          {lista.map((r) => (
            <li key={r.href} role="none">
              <ResultadoEnlazable
                href={r.href}
                onElegir={() => alVolver(r.href)}
                atributos={{ role: "menuitem" }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{r.titulo}</span>
                  {r.camino && <span className="block truncate text-xs text-[var(--text-secondary)]">{r.camino}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  {r.tipo && (
                    <span className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                      {r.tipo}
                    </span>
                  )}
                  <span className="text-xs tabular-nums text-[var(--text-secondary)]">{cuandoFue(new Date(r.en).toISOString())}</span>
                </span>
              </ResultadoEnlazable>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
