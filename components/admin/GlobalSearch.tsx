"use client";

/**
 * Buscador del panel (⌘K): módulos, fichas, lo que abriste hace poco (M06) y
 * comandos que abren el lugar exacto (M04). Qué encuentra y con qué permiso:
 * `buscador/use-busqueda-panel`.
 */

import { useState, useEffect, useId, useRef } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import {
  Search, X, Package, Users, ShoppingCart, AlertTriangle, Loader2, LayoutDashboard, Zap, History,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { destinoDelResultado } from "@/lib/admin/destino-busqueda";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { PieBuscador } from "./buscador/PieBuscador";
import type { GroupedResults, SearchResult } from "./buscador/indice-modulos";
import { FilaResultado, ResultSkeleton } from "./buscador/FilaResultado";
import { useBusquedaPanel } from "./buscador/use-busqueda-panel";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
  onNavigate: (tab: string, vista?: string, sub?: string) => void;
}

// ── Metadatos de grupos ───────────────────────────────────────────────────────

const GROUP_META: Record<keyof GroupedResults, { label: string; icon: React.ElementType; color: string }> = {
  recientes: { label: "Abriste hace poco", icon: History,       color: "text-[var(--text-secondary)]" },
  modulos:   { label: "Módulos",         icon: LayoutDashboard, color: "text-primary" },
  productos: { label: "Productos",       icon: Package,         color: "text-[var(--data-success-500)]" },
  clientes:  { label: "Clientes",        icon: Users,           color: "text-[var(--text-secondary)]" },
  pedidos:   { label: "Pedidos",         icon: ShoppingCart,    color: "text-[var(--data-warning-500)]" },
  acciones:  { label: "Hacer",           icon: Zap,             color: "text-[var(--data-success-500)]" },
};

/** La ruta de un resultado: la suya (comando, reciente) o la de su ficha o módulo. */
function hrefDe(r: SearchResult): string | null {
  if (r.href) return r.href;
  return r.action ? null : destinoDelResultado(r)?.href ?? null;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function GlobalSearch({ open, onClose, onOpen, onNavigate }: Props) {
  /** Para atar el diálogo con su título. */
  const idBase = useId();
  const { query, setQuery, grouped, loading, orden } = useBusquedaPanel(open);
  const [selected, setSelected] = useState(0);

  const inputRef    = useRef<HTMLInputElement>(null);
  const dialogRef   = useRef<HTMLDivElement>(null);
  // Foco atrapado + devuelto al cerrar. Escape lo sigue manejando el handler
  // de más abajo (también mueve ↑/↓/Enter) — acá se apaga para no cerrarlo dos veces.
  useModalAccesible(dialogRef, { onCerrar: onClose, activo: open, cerrarConEscape: false });

  // Offset vertical del popover. Estaba fijo en `top-14` (56px), que asume que
  // el header arranca en y=0 — pero arriba puede haber una barra de alertas o
  // el banner de impersonación, así que el popover terminaba TAPANDO el header
  // y su propio botón de búsqueda. Se mide el borde inferior real del header.
  const [anchorTop, setAnchorTop] = useState(56);
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const header = document.querySelector<HTMLElement>("[data-admin-header]");
      setAnchorTop(header ? Math.round(header.getBoundingClientRect().bottom + 8) : 56);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  // Atajo global Ctrl+K / Cmd+K
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          onClose();
        } else {
          onOpen?.();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [open, onClose, onOpen]);

  // Focus al abrir (la búsqueda se vacía sola en useBusquedaPanel)
  useEffect(() => {
    if (open) {
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Lista plana para navegación por teclado
  const flatResults = orden.flatMap(g => grouped[g]);
  const totalResults = flatResults.length;

  /* Elegir un resultado: un comando o un reciente va a SU ruta (con el evento
     que la pantalla escucha si ya estaba abierta: «Cerrar el turno»); un
     producto, cliente o pedido abre SU ficha si ya abre por enlace
     (lib/admin/destino-busqueda; sin recargar: el video de las cámaras sigue);
     si no, su módulo. */
  const elegir = (r: SearchResult) => {
    if (r.action) { r.action(); return; }
    if (r.href) {
      irAEnlace(r.href);
      if (r.evento) window.dispatchEvent(new CustomEvent(r.evento));
      onClose();
      return;
    }
    const destino = destinoDelResultado(r);
    if (!destino) return;
    if (destino.abreFicha) irAEnlace(destino.href);
    else onNavigate(destino.tab, r.vista, r.sub);
    onClose();
  };

  // Navegación por teclado
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, totalResults - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && flatResults[selected]) {
        const r = flatResults[selected];
        /* Ctrl/Cmd + Enter: en otra pestaña, como el ctrl + clic del enlace. */
        const href = hrefDe(r);
        if ((e.ctrlKey || e.metaKey) && href) {
          e.preventDefault();
          window.open(href, "_blank", "noopener");
          return;
        }
        elegir(r);
      }
      if (e.key === "Escape") { onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flatResults, selected, totalResults]);

  if (!open) return null;

  const hasResults = totalResults > 0;
  const isSearching = query.trim().length >= 2;

  // Índice global para resaltar selección por teclado
  let globalIdx = 0;

  return (
    <>
      {/* Backdrop oscurecido (Brandon 2026-08-28): antes era transparente y
          dejaba el pill "Buscar módulos, productos, clientes…" del header
          totalmente visible justo encima de este popover — dos cajas de
          búsqueda casi idénticas a la vista a la vez. Con el fondo atenuado,
          el pill del header queda claramente de fondo/inactivo y este input
          se lee como el único foco. */}
      <div
        className="fixed inset-0 z-tour bg-black/50 backdrop-blur-sm animate-in fade-in duration-[var(--dur-base)]"
        onClick={onClose}
        aria-hidden
      />
      {/* Popover anclado al search button del topbar (top-14 ~ debajo del header
          h-14), alineado a la izquierda con el botón. En mobile ocupa todo el ancho.

          El ancho va en rem EXPLÍCITO (36rem = 576px): hasta 2026-10-09
          globals.css ponía `--container-xl` en 1440px y `sm:max-w-xl` hacía que
          el popover midiera 1200px —casi toda la pantalla—. Hoy `max-w-xl`
          vale lo mismo; el rem se queda por claridad. */}
      <div
        style={{ top: anchorTop }}
        className="fixed left-2 sm:left-12 lg:left-[calc(var(--admin-sidebar-w,276px)+1rem)] right-2 sm:right-auto z-[9999] sm:w-[calc(100vw-3rem)] sm:max-w-[36rem] animate-in fade-in zoom-in-95 duration-[var(--dur-base)]"
      >
        {/* `role="dialog"` + `aria-modal`: el buscador se comportaba como un
            modal —tapa la página, atrapa Escape, se cierra al click fuera— pero
            no lo DECÍA, así que un lector de pantalla lo leía como un trozo más
            de la página y no anunciaba que se había abierto algo.
            `aria-labelledby` apunta al «Buscar en todo el panel» de adentro, que
            ya existía: no hace falta un título invisible aparte. */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${idBase}-titulo`}
          tabIndex={-1}
          className="bg-[var(--surface-raised)] rounded-2xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] shadow-[var(--shadow-xl)]"
          onClick={e => e.stopPropagation()}
        >
        {/* ── Input de búsqueda — más prominente, h-14, con eyebrow ── */}
        <div className="px-5 pt-4 pb-2 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
          <p
            id={`${idBase}-titulo`}
            className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2"
          >
            Buscar en todo el panel
          </p>
          <div className="flex items-center gap-3">
            {loading
              ? <Loader2 className="h-5 w-5 text-primary shrink-0 animate-spin" />
              : <Search className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted shrink-0" strokeWidth={2} />
            }
            <input
              ref={inputRef}
              type="text"
              placeholder="Busca o pide: «nueva venta», «cobrar a Juan»…"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(0); }}
              className="flex-1 bg-transparent text-base font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] dark:placeholder:text-muted placeholder:font-normal outline-none"
            />
            <div className="flex items-center gap-2 shrink-0">
              {query && (
                <button
                  onClick={() => { setQuery(""); setSelected(0); }}
                  className="p-1 rounded-full hover:bg-[var(--surface-sunken)] transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4 text-[var(--text-tertiary)]" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[length:var(--ts-2xs)] font-bold font-mono text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                Esc
              </kbd>
            </div>
          </div>
        </div>

        {/* ── Resultados ── */}
        {isSearching && (
          <div className="max-h-[60vh] overflow-y-auto">
            {!loading && !hasResults && (
              <div className="flex items-center gap-3 px-4 py-8 text-[var(--text-tertiary)] dark:text-muted text-sm justify-center">
                <AlertTriangle className="h-5 w-5" />
                Sin resultados para &ldquo;{query}&rdquo;
              </div>
            )}

            {/* Comandos, módulos y recientes salen al toque; productos,
                clientes y pedidos llegan del servidor (el esqueleto, abajo). */}
            {orden.map(groupKey => {
              const items = grouped[groupKey];
              if (items.length === 0) return null;
              const meta = GROUP_META[groupKey];
              const GroupIcon = meta.icon;

              return (
                <div key={groupKey}>
                  {/* Cabecera de grupo — eyebrow uppercase + counter */}
                  <div className="flex items-center justify-between gap-2 px-5 py-2 bg-[var(--surface-sunken)] border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                      <GroupIcon className={cn("h-3.5 w-3.5", meta.color)} strokeWidth={2.25} />
                      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)] dark:text-muted">
                        {meta.label}
                      </span>
                    </div>
                    <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                      {items.length}
                    </span>
                  </div>

                  {items.map(r => {
                    const itemIdx = globalIdx++;
                    return (
                      <FilaResultado
                        key={r.id}
                        r={r}
                        query={r.type === "accion" ? "" : query}
                        href={hrefDe(r)}
                        seleccionado={itemIdx === selected}
                        iconoGrupo={meta.icon}
                        color={meta.color}
                        onElegir={() => elegir(r)}
                      />
                    );
                  })}
                </div>
              );
            })}

            {loading && <ResultSkeleton />}
          </div>
        )}

        {/* Sin «Acceso rápido» (Brandon 16-10: «quita ese menú y que sólo funcione el
            buscador»): con el campo vacío la ventana es el buscador y nada más. */}

        <PieBuscador />
        </div>
      </div>
    </>
  );
}
