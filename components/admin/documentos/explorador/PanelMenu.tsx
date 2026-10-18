"use client";

/**
 * Un panel del menú del explorador: la raíz (lo ubica `MenuEnPunto`) o un
 * submenú (se ubica al costado de su opción con `ubicarSubmenu`).
 *
 * Mouse: pasar por encima de «Ver ›» abre su submenú; ir a otra opción lo
 * cierra después de un instante (para poder cruzar en diagonal sin perderlo).
 * Teclado: ↑ ↓ Inicio Fin dentro del panel, → abre el submenú, ← o Escape lo
 * cierra y devuelve el foco a su opción. En el celular no entran dos paneles
 * lado a lado: el submenú se despliega adentro, debajo de su opción.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ChevronDown, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ItemMenu } from "./item-menu";
import { ANCHO_MENU, submenuEnLinea, ubicarSubmenu } from "./ubicar-menu";

export const SELECTOR_ITEM = "[role^=menuitem]:not([aria-disabled=true])";

interface Props {
  items: readonly ItemMenu[];
  etiqueta: string;
  estilo: CSSProperties;
  /** Elegir una opción cierra el menú entero. */
  onElegir: (accion: () => void) => void;
  /** Sólo los submenús: ← o Escape. */
  onCerrarme?: () => void;
  /** El mouse entró a este panel (el padre no lo cierra). */
  onEntrar?: () => void;
  nivel: number;
  dataQa?: string;
  panelRef?: React.Ref<HTMLDivElement>;
}

type Abierto = { id: string; rect: DOMRect; enfocar: boolean };

const CLASE_OPCION =
  "flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] focus-visible:outline-none";

function moverFoco(panel: HTMLElement, tecla: string) {
  const lista = [...panel.querySelectorAll<HTMLElement>(SELECTOR_ITEM)];
  if (lista.length === 0) return;
  const i = lista.indexOf(document.activeElement as HTMLElement);
  const sig =
    tecla === "Home" ? 0
    : tecla === "End" ? lista.length - 1
    : tecla === "ArrowDown" ? (i + 1) % lista.length
    : (i - 1 + lista.length) % lista.length;
  lista[sig]?.focus({ preventScroll: true });
}

export default function PanelMenu({ items, etiqueta, estilo, onElegir, onCerrarme, onEntrar, nivel, dataQa, panelRef }: Props) {
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const [enLinea] = useState(submenuEnLinea);
  const demora = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelar = () => { if (demora.current) clearTimeout(demora.current); demora.current = null; };
  useEffect(() => cancelar, []);

  const abrir = (id: string, el: HTMLElement, enfocar: boolean) => {
    cancelar();
    setAbierto((a) => (a?.id === id && !enfocar ? a : { id, rect: el.getBoundingClientRect(), enfocar }));
  };
  const alPasar = (it: ItemMenu, el: HTMLElement) => {
    if (enLinea) return;
    el.focus({ preventScroll: true });
    cancelar();
    if (it.tipo === "submenu") {
      if (it.deshabilitado) return;
      demora.current = setTimeout(() => abrir(it.id, el, false), 120);
    } else if (abierto) {
      demora.current = setTimeout(() => setAbierto(null), 260);
    }
  };

  const alTeclado = (e: KeyboardEvent<HTMLDivElement>) => {
    // Las teclas de un submenú las maneja su propio panel (no burbujean acá:
    // es un hermano en el portal, no un hijo).
    if (e.target instanceof HTMLElement && e.target.closest("[role=menu]") !== e.currentTarget) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      moverFoco(e.currentTarget, e.key);
      return;
    }
    const el = document.activeElement as HTMLElement | null;
    if (e.key === "ArrowRight" && el?.getAttribute("aria-haspopup") === "menu") {
      e.preventDefault();
      el.click();
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "Escape") && nivel > 0) {
      e.preventDefault();
      e.stopPropagation();
      onCerrarme?.();
    }
  };

  const opcion = (it: Extract<ItemMenu, { tipo?: "accion" }>) => {
    const { Icon } = it;
    return (
      <button
        key={it.id}
        type="button"
        role={it.marcado === undefined ? "menuitem" : "menuitemradio"}
        aria-checked={it.marcado === undefined ? undefined : it.marcado}
        aria-disabled={it.deshabilitado || undefined}
        data-item={it.id}
        onPointerEnter={(e) => alPasar(it, e.currentTarget)}
        onClick={it.deshabilitado ? undefined : (e) => { e.stopPropagation(); onElegir(it.onSelect); }}
        className={cn(
          CLASE_OPCION,
          it.principal ? "font-bold" : "font-medium",
          it.peligro ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-secondary)]",
          it.deshabilitado && "cursor-not-allowed opacity-50 hover:bg-transparent",
        )}
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : <span className="h-4 w-4 shrink-0" aria-hidden />}
        <span className="flex-1 truncate">{it.label}</span>
        {it.atajo && <kbd className="font-mono text-xs text-[var(--text-tertiary)]">{it.atajo}</kbd>}
        {it.marcado && <Check className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />}
      </button>
    );
  };

  const dibujar = (lista: readonly ItemMenu[]): React.ReactNode[] =>
    lista.map((it) => {
      if (it.tipo === "separador") return <div key={it.id} role="separator" className="my-1 border-t border-[var(--rule-soft)]" />;
      if (it.tipo === "titulo") {
        return (
          <p key={it.id} className="px-3 pb-1 pt-2 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            {it.label}
          </p>
        );
      }
      if (it.tipo !== "submenu") return opcion(it);
      const { Icon } = it;
      const esteAbierto = abierto?.id === it.id;
      return (
        <div key={it.id} className="contents">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={esteAbierto}
            aria-disabled={it.deshabilitado || undefined}
            data-item={it.id}
            onPointerEnter={(e) => alPasar(it, e.currentTarget)}
            onClick={it.deshabilitado ? undefined : (e) => {
              e.stopPropagation();
              // `detail === 0`: vino del teclado (Enter, Espacio, →): el foco entra.
              // El rect se lee ACÁ: dentro del actualizador `e.currentTarget` ya es null
              // (React lo corre después del evento) y el panel se caía en el celular.
              const rect = e.currentTarget.getBoundingClientRect();
              if (enLinea) setAbierto((a) => (a?.id === it.id ? null : { id: it.id, rect, enfocar: false }));
              else abrir(it.id, e.currentTarget, e.detail === 0);
            }}
            className={cn(
              CLASE_OPCION,
              "font-medium text-[var(--text-secondary)]",
              esteAbierto && !enLinea && "bg-[var(--surface-sunken)]",
              it.deshabilitado && "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : <span className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="flex-1 truncate">{it.label}</span>
            {enLinea && esteAbierto
              ? <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              : <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />}
          </button>
          {enLinea && esteAbierto && (
            <div role="group" aria-label={it.label} className="bg-[var(--surface-sunken)] py-1 pl-3">
              {dibujar(it.items)}
            </div>
          )}
        </div>
      );
    });

  const sub = !enLinea && abierto ? items.find((it) => it.id === abierto.id) : undefined;

  return (
    <>
      <div
        ref={panelRef}
        role="menu"
        aria-label={etiqueta}
        data-qa={dataQa}
        data-nivel={nivel}
        onKeyDown={alTeclado}
        onPointerEnter={() => { cancelar(); onEntrar?.(); }}
        className="fixed z-modal-2 overflow-y-auto overscroll-contain rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 text-[var(--text-primary)] shadow-[var(--shadow-lg)]"
        style={{ width: ANCHO_MENU, ...estilo }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        {dibujar(items)}
      </div>
      {sub?.tipo === "submenu" && abierto && (
        <Submenu
          key={sub.id}
          rect={abierto.rect}
          enfocar={abierto.enfocar}
          items={sub.items}
          etiqueta={sub.label}
          nivel={nivel + 1}
          onElegir={onElegir}
          onEntrar={cancelar}
          onCerrarme={() => {
            setAbierto(null);
            (document.querySelector(`[data-nivel="${nivel}"] [data-item="${sub.id}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}

function Submenu({ rect, enfocar, ...resto }: Omit<Props, "estilo" | "panelRef" | "dataQa"> & { rect: DOMRect; enfocar: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setPos(ubicarSubmenu(rect, el.scrollHeight + 2));
  }, [rect]);
  useEffect(() => {
    if (enfocar && pos) ref.current?.querySelector<HTMLElement>(SELECTOR_ITEM)?.focus({ preventScroll: true });
  }, [enfocar, pos]);
  return (
    <PanelMenu
      {...resto}
      panelRef={ref}
      dataQa="submenu-explorador"
      estilo={pos ?? { top: rect.top, left: rect.right, visibility: "hidden" }}
    />
  );
}
