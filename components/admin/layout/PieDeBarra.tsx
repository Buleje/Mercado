"use client";

/**
 * Pie de la barra lateral: Compactar + Configurar (solo ícono, Brandon
 * 2026-08-28).
 *
 * Brandon 2026-10-20: «compactar sidebar y configurar barra lateral quiero que
 * solo aparezcan al pasar el mouse sobre la barra lateral; en caso de estar en
 * el contenido que se oculten». Se apagan con un fundido y vuelven:
 *  - con el mouse sobre la barra (`group-hover/barra`, sólo donde hay mouse:
 *    Tailwind 4 ya envuelve el hover en `@media (hover:hover)`);
 *  - con el foco de TECLADO en cualquier parte de la barra (`:focus-visible`,
 *    no `:focus-within`: un clic con el mouse no los deja pegados).
 * En pantallas táctiles (sin hover) quedan siempre a la vista. El hueco se
 * conserva: aparecer no mueve el menú. Reducir movimiento = sin fundido.
 */
import * as React from "react";
import { PanelLeft, PanelLeftClose, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstiloBarra } from "@/components/admin/layout/sidebar-temas";

interface Props {
  estilo: EstiloBarra;
  compacto: boolean;
  /** Modo foco ya fuerza compacto: el botón de compactar no aplica. */
  focusMode: boolean;
  isCompact: boolean;
  onCompactar: () => void;
  onConfigurar: () => void;
  /** «Ver mi tienda» cuando está activo (hoy apagado por SHOW_MI_TIENDA_LINK). */
  enlaceTienda?: React.ReactNode;
}

export const REVELAR_CON_LA_BARRA =
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:translate-y-1 group-hover/barra:opacity-100 group-hover/barra:translate-y-0 group-has-[:focus-visible]/barra:opacity-100 group-has-[:focus-visible]/barra:translate-y-0 transition-[opacity,translate] duration-[var(--dur-base)] ease-[var(--ease-editorial)] motion-reduce:transition-none";

export function PieDeBarra({ estilo, compacto, focusMode, isCompact, onCompactar, onConfigurar, enlaceTienda }: Props) {
  const boton = cn("flex flex-1 items-center justify-center rounded-xl py-2.5 transition-all", estilo.text, estilo.hover);
  const rotuloCompactar = isCompact ? "Expandir barra lateral" : "Compactar barra lateral";
  return (
    <div
      data-pie-barra
      className={cn(
        "py-3 border-t space-y-0.5 shrink-0",
        estilo.headerBorder,
        compacto ? "px-1.5" : "px-2.5",
        REVELAR_CON_LA_BARRA,
      )}
    >
      {enlaceTienda && (
        <>
          {enlaceTienda}
          <div className={cn("my-1.5 border-t", estilo.border)} />
        </>
      )}
      <div className="flex items-center gap-1">
        {!focusMode && (
          <button type="button" onClick={onCompactar} title={rotuloCompactar} aria-label={rotuloCompactar} className={boton}>
            {isCompact ? (
              <PanelLeft className="h-[18px] w-[18px] shrink-0" />
            ) : (
              <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onConfigurar}
          title="Configurar barra lateral"
          aria-label="Configurar barra lateral"
          className={boton}
        >
          <SlidersHorizontal className="h-[18px] w-[18px] shrink-0" />
        </button>
      </div>
    </div>
  );
}
