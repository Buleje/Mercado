"use client";

import { ArrowRight } from "@buleje/design-system/icons";
import type { AccionNavegar } from "./tipos";

/**
 * Los botones que abren la pantalla de la que habla la respuesta.
 *
 * Navega por el evento `admin:navigate` —el mismo que usan el buscador global y
 * las notificaciones— en vez de un `<a href>`: el panel es una SPA y recargar
 * pierde la conversación. Nunca navega solo; el usuario decide cuándo.
 */
export function BotonesDeAccion({ acciones }: { acciones?: AccionNavegar[] }) {
  if (!acciones || acciones.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {acciones.map((a) => (
        <button
          key={a.url}
          type="button"
          onClick={() => {
            if (a.filtro) {
              // El módulo destino levanta el filtro al montar. sessionStorage y
              // no el evento: los módulos son lazy y pueden no estar montados
              // cuando se dispara.
              try {
                sessionStorage.setItem("admin-buscar", a.filtro);
              } catch {
                /* modo privado */
              }
            }
            window.dispatchEvent(
              new CustomEvent("admin:navigate", {
                detail: { tab: a.tab, vista: a.vista ?? undefined },
              }),
            );
          }}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-sunken)]"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          Abrir {a.label}
          {a.filtro && (
            <span className="font-normal text-[var(--text-tertiary)]">· {a.filtro}</span>
          )}
        </button>
      ))}
    </div>
  );
}
