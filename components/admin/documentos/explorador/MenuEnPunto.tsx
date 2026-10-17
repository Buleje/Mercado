"use client";

/**
 * MenuEnPunto — el menú del clic derecho del explorador del Archivo (carpetas,
 * el fondo vacío y el Acceso rápido). Los documentos siguen con su
 * `MenuDocumento`, que comparte la misma cuenta de posición (`ubicar`).
 *
 * Se abre en un punto (clic derecho, mantener presionado en el celular, o la
 * tecla de menú / Shift+F10 sobre el elemento) y se cierra con Escape, clic
 * afuera, scroll de la página o al elegir. Va en un portal a `body` con los
 * tokens del panel: la tarjeta del Drive usa `content-visibility`, que recorta
 * los `fixed` de adentro, y fuera del panel los tokens son los de la tienda.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Check, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { ANCHO_MENU, ubicar, useMenuQueEntra, type PosicionMenu, type PuntoDeMenu } from "./ubicar-menu";

export type ItemMenu =
  | {
      tipo?: "accion";
      id: string;
      label: string;
      Icon?: LucideIcon;
      onSelect: () => void;
      /** Borra o saca algo: rojo y al final. */
      peligro?: boolean;
      /** Opción de un grupo excluyente (la vista actual, el orden): tilde. */
      marcado?: boolean;
      /** Opción principal (Abrir): en negrita, como en Windows. */
      principal?: boolean;
      deshabilitado?: boolean;
      /** Atajo de teclado que se muestra a la derecha («F2»). */
      atajo?: string;
    }
  | { tipo: "separador"; id: string }
  | { tipo: "titulo"; id: string; label: string };

interface Props {
  /** `null` = cerrado. Cada punto nuevo lo abre ahí. */
  abrirEn: PuntoDeMenu | null;
  items: readonly ItemMenu[];
  /** Para el lector de pantalla: «Opciones de Facturas». */
  etiqueta: string;
  onCerrado: () => void;
}

const SELECTOR_ITEM = "[role^=menuitem]:not([aria-disabled=true])";

export default function MenuEnPunto({ abrirEn, items, etiqueta, onCerrado }: Props) {
  const [pos, setPos] = useState<PosicionMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** A dónde vuelve el foco al cerrar con Escape (el elemento del clic derecho). */
  const focoPrevio = useRef<HTMLElement | null>(null);
  const onCerradoRef = useRef(onCerrado);
  useEffect(() => { onCerradoRef.current = onCerrado; }, [onCerrado]);
  const abierto = pos !== null;
  const tokens = usePanelTokens(abierto);

  useLayoutEffect(() => {
    if (!abrirEn) { setPos(null); return; }
    focoPrevio.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPos(ubicar(abrirEn.x, abrirEn.arriba ?? abrirEn.y, abrirEn.y));
  }, [abrirEn]);
  useMenuQueEntra(menuRef, pos, setPos);

  const cerrar = useCallback((devolverFoco = false) => {
    setPos(null);
    onCerradoRef.current();
    if (devolverFoco) focoPrevio.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!abierto) return;
    menuRef.current?.querySelector<HTMLElement>(SELECTOR_ITEM)?.focus({ preventScroll: true });
    const afuera = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) cerrar(); };
    // Scrollear DENTRO del menú no lo cierra; la página de atrás, sí.
    const alScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) cerrar(); };
    const alRedimensionar = () => cerrar();
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
        cerrar(true);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const lista = [...(menuRef.current?.querySelectorAll<HTMLElement>(SELECTOR_ITEM) ?? [])];
      if (lista.length === 0) return;
      e.preventDefault();
      const i = lista.indexOf(document.activeElement as HTMLElement);
      const sig =
        e.key === "Home" ? 0
        : e.key === "End" ? lista.length - 1
        : e.key === "ArrowDown" ? (i + 1) % lista.length
        : (i - 1 + lista.length) % lista.length;
      lista[sig]?.focus();
    };
    window.addEventListener("pointerdown", afuera, true);
    window.addEventListener("scroll", alScroll, true);
    window.addEventListener("resize", alRedimensionar);
    window.addEventListener("keydown", alTeclado, true);
    return () => {
      window.removeEventListener("pointerdown", afuera, true);
      window.removeEventListener("scroll", alScroll, true);
      window.removeEventListener("resize", alRedimensionar);
      window.removeEventListener("keydown", alTeclado, true);
    };
  }, [abierto, cerrar]);

  const elegir = (accion: () => void) => (e: ReactMouseEvent) => {
    e.stopPropagation();
    cerrar(true);
    accion();
  };

  if (!abierto || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={etiqueta}
      data-qa="menu-explorador"
      className="fixed z-modal-2 overflow-y-auto overscroll-contain rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 text-[var(--text-primary)] shadow-[var(--shadow-lg)]"
      style={{ ...tokens, top: pos.top, bottom: pos.bottom, left: pos.left, width: ANCHO_MENU, maxHeight: pos.maxHeight }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {items.map((it) => {
        if (it.tipo === "separador") return <div key={it.id} role="separator" className="my-1 border-t border-[var(--rule-soft)]" />;
        if (it.tipo === "titulo") {
          return (
            <p key={it.id} className="px-3 pb-1 pt-2 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              {it.label}
            </p>
          );
        }
        const { Icon } = it;
        return (
          <button
            key={it.id}
            type="button"
            role={it.marcado === undefined ? "menuitem" : "menuitemradio"}
            aria-checked={it.marcado === undefined ? undefined : it.marcado}
            aria-disabled={it.deshabilitado || undefined}
            data-item={it.id}
            onClick={it.deshabilitado ? undefined : elegir(it.onSelect)}
            className={cn(
              "flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] focus-visible:outline-none",
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
      })}
    </div>,
    document.body,
  );
}
