"use client";

/**
 * «Recientes» (M06 de la noche 17-10): el reloj de la cabecera, al lado de los
 * accesos rápidos. Lista lo último que abriste —pestaña › vista › la ficha—
 * para volver con un clic, sin recargar: la pantalla de donde sales conserva
 * su búsqueda, sus filtros y el carrito (el panel deja montadas las pestañas).
 *
 * Esta misma pieza anota los lugares (`useRegistrarRecientes`): la cabecera se
 * monta una sola vez. Se guardan por persona en este navegador.
 */

import { useEffect, useRef, useState } from "react";
import { History, Trash2 } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { ResultadoEnlazable } from "@/components/admin/shared/ResultadoEnlazable";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { cuandoFue } from "@/components/notifications/notificaciones-categorias";
import { entradaDeUrl } from "@/lib/admin/recientes-panel";
import { useRecientes, useRegistrarRecientes } from "@/hooks/use-recientes-panel";
import { cn } from "@/lib/utils";
import { etiquetaDeTab } from "../buscador/indice-modulos";

const BOTON =
  "grid h-12 w-12 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
const CLARO =
  "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]";
const OSCURO = cn(CLARO, "sm:text-white/70 sm:hover:bg-white/10 sm:hover:text-white");

export default function MenuRecientes({ onDarkHeader = false }: { onDarkHeader?: boolean }) {
  useRegistrarRecientes();
  const { recientes, listo, borrar } = useRecientes();
  const [abierto, setAbierto] = useState(false);
  /** Dónde estás al abrir el menú: no se ofrece volver al mismo lugar. */
  const [aca, setAca] = useState<string | null>(null);
  const raizRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAbierto(false);
      botonRef.current?.focus();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  /* Sin sesión (o sin poder guardar) no hay recientes que mostrar. */
  if (!listo) return null;
  const lista = recientes.filter((r) => r.href !== aca);

  const alternar = () => {
    if (!abierto) setAca(entradaDeUrl(window.location.pathname + window.location.search, etiquetaDeTab)?.href ?? null);
    setAbierto((v) => !v);
  };
  const volver = (href: string) => {
    setAbierto(false);
    irAEnlace(href);
  };

  return (
    <div ref={raizRef} className="relative max-sm:static">
      <AdminTooltip content="Abriste hace poco" side="bottom" className="text-sm">
        <button
          ref={botonRef}
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          aria-label="Abriste hace poco"
          data-qa="menu-recientes"
          className={cn(BOTON, abierto ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : onDarkHeader ? OSCURO : CLARO)}
        >
          <History className="h-5 w-5" aria-hidden />
        </button>
      </AdminTooltip>

      {abierto && (
        <nav
          aria-label="Abriste hace poco"
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-96 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]",
            "max-sm:left-3 max-sm:right-3 max-sm:w-auto",
          )}
        >
          <p className="px-2 pb-2 pt-1 text-sm font-bold text-[var(--text-primary)]">Abriste hace poco</p>
          {lista.length === 0 ? (
            <p className="px-2 pb-3 text-sm text-[var(--text-secondary)]">Lo que abras en el panel aparece acá para volver con un clic.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {lista.map((r) => (
                <li key={r.href}>
                  <ResultadoEnlazable
                    href={r.href}
                    onElegir={() => volver(r.href)}
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
          {recientes.length > 0 && (
            <button
              type="button"
              onClick={() => {
                borrar();
                setAbierto(false);
                botonRef.current?.focus();
              }}
              className="mt-1 flex min-h-12 w-full items-center gap-2 rounded-xl border-t border-[var(--rule-soft)] px-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Borrar la lista
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
