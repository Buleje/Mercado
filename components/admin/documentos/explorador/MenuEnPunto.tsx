"use client";

/**
 * MenuEnPunto — el menú del clic derecho del explorador del Archivo: una
 * carpeta, un archivo, varios elementos, el fondo vacío o el Acceso rápido.
 *
 * Se abre en un punto (clic derecho, mantener presionado en el celular, o la
 * tecla de menú / Shift+F10 sobre el elemento) y se cierra con Escape, clic
 * afuera, scroll de la página o al elegir. Los submenús (Ver ›, Nuevo ›) los
 * dibuja `PanelMenu`. Va en un portal a `body` con los tokens del panel: la
 * tarjeta del Drive usa `content-visibility`, que recorta los `fixed` de
 * adentro, y fuera del panel los tokens son los de la tienda.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import type { ItemMenu } from "./item-menu";
import PanelMenu, { SELECTOR_ITEM } from "./PanelMenu";
import { ubicar, useMenuQueEntra, type PosicionMenu, type PuntoDeMenu } from "./ubicar-menu";

export type { ItemMenu };

interface Props {
  /** `null` = cerrado. Cada punto nuevo lo abre ahí. */
  abrirEn: PuntoDeMenu | null;
  items: readonly ItemMenu[];
  /** Para el lector de pantalla: «Opciones de Facturas». */
  etiqueta: string;
  onCerrado: () => void;
}

export default function MenuEnPunto({ abrirEn, items, etiqueta, onCerrado }: Props) {
  const [pos, setPos] = useState<PosicionMenu | null>(null);
  const capaRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** A dónde vuelve el foco al cerrar (el elemento del clic derecho). */
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
    const dentro = (e: Event) => !!capaRef.current?.contains(e.target as Node);
    const afuera = (e: Event) => { if (!dentro(e)) cerrar(); };
    // Scrollear DENTRO del menú no lo cierra; la página de atrás, sí.
    const alScroll = (e: Event) => { if (!dentro(e)) cerrar(); };
    const alRedimensionar = () => cerrar();
    const alTeclado = (e: KeyboardEvent) => {
      // En un submenú, Escape cierra sólo ese nivel (lo maneja su panel).
      const nivel = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[role=menu]")?.dataset.nivel;
      if (e.key === "Escape" && nivel && nivel !== "0") return;
      if (e.key === "Escape" || e.key === "Tab") {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
        cerrar(true);
      }
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

  const elegir = useCallback((accion: () => void) => {
    cerrar(true);
    accion();
  }, [cerrar]);

  if (!abierto || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div ref={capaRef} style={tokens}>
      <PanelMenu
        panelRef={menuRef}
        items={items}
        etiqueta={etiqueta}
        nivel={0}
        dataQa="menu-explorador"
        onElegir={elegir}
        estilo={{ top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxHeight }}
      />
    </div>,
    document.body,
  );
}
