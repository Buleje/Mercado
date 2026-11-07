"use client";

/**
 * MenuDocumento — el «⋯» de un documento del Archivo (tarjeta y fila).
 *
 * Antes (11-10): la tarjeta tenía cuatro íconos de 28 px al pasar el mouse
 * (favorito, WhatsApp, descargar, eliminar) más un chip «＋» de 18 px para el
 * estado, y la fila de la lista un kebab de 28 px con el resto. Diez tarjetas =
 * 50 botones chicos que en el celular ni se veían (sin hover). Ahora la acción
 * principal es abrir (la miniatura o el nombre) y TODO lo demás vive acá, igual
 * en la tarjeta, en la fila y al clic derecho sobre cualquiera de las dos.
 *
 * El menú va en un portal: la tarjeta tiene `content-visibility: auto`, que la
 * vuelve el marco de los `fixed` de adentro y los recorta a su caja.
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  Check, ChevronDown, ChevronRight, Download, Eye, FileStack, FolderInput, MessageCircle, MoreHorizontal,
  Pencil, PenLine, RotateCw, Scissors, Stamp, Star, Tag, Trash2, Wand2,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { ANCHO_MENU, ubicar, useMenuQueEntra, type PosicionMenu, type PuntoDeMenu } from "./explorador/ubicar-menu";

export type { PuntoDeMenu };

export interface AccionesDocumento {
  onPreview: () => void;
  onAnalyze: () => void;
  onDownload: () => void;
  onRename: () => void;
  onMove: () => void;
  onTag: () => void;
  onWhatsApp: () => void;
  onSign: () => void;
  onStamp: () => void;
  onRotate: () => void;
  onSplit: () => void;
  onEditPages: () => void;
  onToggleFav: () => void;
  onDelete: () => void;
  onSetStatus: (estado: string) => void;
  isPdf: boolean;
  favorite: boolean;
  /** Estado del flujo (`none` = sin estado). */
  status: string;
}

export interface EstadoDelMenu {
  clave: string;
  label: string;
  /** Clase del punto de color (la misma del chip). */
  dot: string;
}

/** Opciones que agrega quien lo usa (el explorador: fijar, usar como ícono). */
export interface ExtraDelMenu {
  id: string;
  label: string;
  Icon: LucideIcon;
  onSelect: () => void;
}

interface Props extends AccionesDocumento {
  /** Para el lector de pantalla: «Acciones de licencia.png». */
  nombre: string;
  estados: readonly EstadoDelMenu[];
  /** Cada punto nuevo abre el menú ahí; `null` lo cierra si se abrió así. */
  abrirEn?: PuntoDeMenu | null;
  /** Se cerró (Escape, clic afuera, una opción): el dueño suelta su punto. */
  onCerrado?: () => void;
  /**
   * Sobre la miniatura de la tarjeta: el toque sigue siendo de 48 px pero lo
   * que se ve es un círculo de 32 px con fondo, para no tapar la foto.
   */
  flotante?: boolean;
  /** Sin «⋯»: sólo el menú, abierto con `abrirEn` (íconos y lista del explorador). */
  sinBoton?: boolean;
  /** Van arriba, después de «Ver»/«Descargar», separadas del resto. */
  extras?: readonly ExtraDelMenu[];
}

export default function MenuDocumento({ nombre, estados, abrirEn, onCerrado, flotante = false, sinBoton = false, extras, ...a }: Props) {
  const [pos, setPos] = useState<PosicionMenu | null>(null);
  const [verEstados, setVerEstados] = useState(false);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const porPunto = useRef(false);
  /** Sin botón, el foco vuelve a lo que lo tenía (el ícono del clic derecho). */
  const focoPrevio = useRef<HTMLElement | null>(null);
  const abierto = pos !== null;
  const tokens = usePanelTokens(abierto);
  // En una ref: el dueño lo pasa como flecha nueva en cada render y, si fuera
  // dependencia, los efectos de abajo se re-armarían (y robarían el foco) en
  // cada render de la grilla.
  const onCerradoRef = useRef(onCerrado);
  useEffect(() => { onCerradoRef.current = onCerrado; }, [onCerrado]);

  const cerrar = useCallback((devolverFoco = false) => {
    setPos(null);
    setVerEstados(false);
    porPunto.current = false;
    onCerradoRef.current?.();
    if (devolverFoco) (botonRef.current ?? focoPrevio.current)?.focus({ preventScroll: true });
  }, []);

  // Clic derecho: el dueño manda el punto; otro documento con su punto me cierra.
  useEffect(() => {
    if (abrirEn) {
      porPunto.current = true;
      focoPrevio.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setVerEstados(false);
      setPos(ubicar(abrirEn.x, abrirEn.arriba ?? abrirEn.y, abrirEn.y));
    } else if (porPunto.current) {
      porPunto.current = false;
      setPos(null);
    }
  }, [abrirEn]);
  useMenuQueEntra(menuRef, pos, setPos);

  useEffect(() => {
    if (!abierto) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
    const alRedimensionar = () => cerrar();
    const afuera = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (botonRef.current?.contains(e.target as Node)) return;
      cerrar();
    };
    // Scrollear DENTRO del menú no lo cierra; la página de atrás, sí.
    const alScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      cerrar();
    };
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); cerrar(true); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      if (items.length === 0) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const sig = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[sig]?.focus();
    };
    window.addEventListener("pointerdown", afuera, true);
    window.addEventListener("scroll", alScroll, true);
    window.addEventListener("resize", alRedimensionar);
    window.addEventListener("keydown", alTeclado, true);
    return () => {
      window.removeEventListener("resize", alRedimensionar);
      window.removeEventListener("pointerdown", afuera, true);
      window.removeEventListener("scroll", alScroll, true);
      window.removeEventListener("keydown", alTeclado, true);
    };
  }, [abierto, cerrar]);

  const alternar = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (abierto) { cerrar(); return; }
    const r = botonRef.current?.getBoundingClientRect();
    if (!r) return;
    porPunto.current = false;
    setPos(ubicar(r.right - ANCHO_MENU, r.top, r.bottom));
  };

  const elegir = (accion: () => void) => (e: ReactMouseEvent) => {
    e.stopPropagation();
    cerrar();
    accion();
  };

  const item = (Icon: typeof Eye, label: string, accion: () => void, peligro = false) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      onClick={elegir(accion)}
      className={cn(
        "flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] focus-visible:outline-none",
        peligro ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-secondary)]",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden /> {label}
    </button>
  );

  const actual = estados.find((s) => s.clave === a.status);

  return (
    <>
      {!sinBoton && (
      <button
        ref={botonRef}
        type="button"
        onClick={alternar}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Acciones de ${nombre}`}
        title="Más acciones (también con clic derecho)"
        className={cn(
          "group/menu inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors",
          flotante
            ? "text-[var(--text-secondary)]"
            : cn("text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]", abierto && "bg-[var(--surface-sunken)] text-[var(--text-primary)]"),
        )}
      >
        {flotante ? (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-raised)]/90 shadow-[var(--shadow-sm)] backdrop-blur-sm transition-colors group-hover/menu:text-[var(--text-primary)]",
              abierto && "text-[var(--text-primary)] ring-2 ring-[var(--accent)]",
            )}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </span>
        ) : (
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        )}
      </button>
      )}
      {abierto && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Acciones de ${nombre}`}
          className="fixed z-modal-2 overflow-y-auto overscroll-contain rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-[var(--shadow-lg)]"
          style={{ ...tokens, top: pos.top, bottom: pos.bottom, left: pos.left, width: ANCHO_MENU, maxHeight: pos.maxHeight }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {item(Eye, "Ver", a.onPreview)}
          {item(Download, "Descargar", a.onDownload)}
          {item(MessageCircle, "Enviar por WhatsApp", a.onWhatsApp)}
          {item(Star, a.favorite ? "Quitar de favoritos" : "Marcar favorito", a.onToggleFav)}
          {extras?.map((x) => item(x.Icon, x.label, x.onSelect))}
          <div className="my-1 border-t border-[var(--rule-soft)]" />
          {item(Pencil, "Renombrar", a.onRename)}
          {item(FolderInput, "Mover a carpeta", a.onMove)}
          {item(Tag, "Etiquetar", a.onTag)}
          <button
            type="button"
            role="menuitem"
            aria-expanded={verEstados}
            onClick={(e) => { e.stopPropagation(); setVerEstados((v) => !v); }}
            className="flex min-h-11 w-full items-center gap-2.5 px-3 text-left text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] focus-visible:outline-none"
          >
            <span className={cn("ml-1 mr-0.5 h-2.5 w-2.5 shrink-0 rounded-full", actual ? actual.dot : "border border-[var(--text-tertiary)]")} aria-hidden />
            <span className="flex-1">Estado{actual ? `: ${actual.label}` : ""}</span>
            {verEstados ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          </button>
          {verEstados && (
            <div className="bg-[var(--surface-sunken)] py-1">
              {estados.map((s) => (
                <button
                  key={s.clave}
                  type="button"
                  role="menuitem"
                  onClick={elegir(() => a.onSetStatus(s.clave))}
                  className="flex min-h-10 w-full items-center gap-2.5 pl-9 pr-3 text-left text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] focus-visible:outline-none"
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.dot)} aria-hidden />
                  <span className="flex-1">{s.label}</span>
                  {a.status === s.clave && <Check className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />}
                </button>
              ))}
              {actual && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={elegir(() => a.onSetStatus("none"))}
                  className="flex min-h-10 w-full items-center pl-9 pr-3 text-left text-sm font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)] focus-visible:outline-none"
                >
                  Sin estado
                </button>
              )}
            </div>
          )}
          <div className="my-1 border-t border-[var(--rule-soft)]" />
          {item(Wand2, "Analizar con IA", a.onAnalyze)}
          {item(PenLine, "Solicitar firma", a.onSign)}
          {a.isPdf && item(Stamp, "Poner sello", a.onStamp)}
          {a.isPdf && item(RotateCw, "Rotar 90°", a.onRotate)}
          {a.isPdf && item(FileStack, "Editar páginas", a.onEditPages)}
          {a.isPdf && item(Scissors, "Dividir en páginas", a.onSplit)}
          <div className="my-1 border-t border-[var(--rule-soft)]" />
          {item(Trash2, "Eliminar", a.onDelete, true)}
        </div>,
        document.body,
      )}
    </>
  );
}
