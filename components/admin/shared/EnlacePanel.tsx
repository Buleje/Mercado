"use client";

/**
 * EnlacePanel — el nombre de una cosa como enlace a su ficha.
 *
 *   <EnlacePanel cosa="troza" id={t.id}>{t.codigo}</EnlacePanel>
 *   <EnlacePanel href={rutaArmadaAMano}>Ver en el Drive</EnlacePanel>
 *
 * Es un `<a href>` de verdad: ctrl/cmd + clic, clic con la rueda y «abrir en
 * otra pestaña» funcionan solos. El clic normal navega SIN recargar
 * (`irAEnlace`): el panel no se remonta y el video de las cámaras sigue.
 *
 * Si la cosa no abre su ficha todavía (`abre: false` en
 * `lib/admin/enlaces-panel.ts`) o falta el id, se dibuja el texto tal cual: un
 * enlace que no abre nada es peor que nada.
 *
 * El clic no sube al padre: en una fila clicable, el nombre lleva a SU ficha y
 * no abre además la de la fila. Si el contenedor tiene que enterarse (un menú
 * que se cierra), que pase su `onClick`: corre antes de navegar.
 */

import type { AnchorHTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hrefDe, type CosaDelPanel } from "@/lib/admin/enlaces-panel";
import { irAEnlace } from "./ir-a-enlace";

/** El enlace del panel: acento legible en los dos temas, subrayado al pasar. */
export const CLASE_ENLACE_PANEL =
  "rounded-sm font-semibold text-[var(--accent-ink)] underline decoration-[var(--accent)]/40 underline-offset-2 transition-colors hover:decoration-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/** Para títulos o celdas con su propio estilo: hereda color y peso, sólo marca el hover y el foco. */
export const CLASE_ENLACE_HEREDADO =
  "rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

type Apariencia = "enlace" | "heredada";

/** `id` es el de la COSA (no el atributo `id` del DOM, que este enlace no necesita). */
export interface EnlacePanelProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "id"> {
  children: ReactNode;
  /** Qué cosa nombra; el destino sale de la tabla `hrefDe`. */
  cosa?: CosaDelPanel;
  /** Su id (el que pide la tabla: el teléfono para un cliente, el código para un árbol). */
  id?: string | null;
  /** Destino armado a mano (ruta del panel). Gana sobre `cosa` + `id`. */
  href?: string | null;
  /** `heredada` = sin color propio (títulos, celdas con estilo). Por defecto, `enlace`. */
  apariencia?: Apariencia;
}

/** ¿Clic que el navegador tiene que manejar solo? (otra pestaña, ventana, descarga, botón no principal). */
function esClicDelNavegador(e: MouseEvent<HTMLAnchorElement>, target?: string): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (!!target && target !== "_self");
}

export function EnlacePanel({
  children,
  cosa,
  id,
  href,
  apariencia = "enlace",
  className,
  onClick,
  onKeyDown,
  target,
  ...resto
}: EnlacePanelProps) {
  const destino = href ?? (cosa ? hrefDe(cosa, id) : null);
  if (!destino) return className ? <span className={className}>{children}</span> : <>{children}</>;

  const alClic = (e: MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    onClick?.(e);
    if (e.defaultPrevented || esClicDelNavegador(e, target)) return;
    e.preventDefault();
    irAEnlace(destino);
  };
  /* Enter en el enlace dispara su clic; que no abra además la fila que lo contiene. */
  const alTecla = (e: KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === "Enter") e.stopPropagation();
    onKeyDown?.(e);
  };

  return (
    <a
      {...resto}
      href={destino}
      target={target}
      onClick={alClic}
      onKeyDown={alTecla}
      className={cn(apariencia === "enlace" ? CLASE_ENLACE_PANEL : CLASE_ENLACE_HEREDADO, className)}
    >
      {children}
    </a>
  );
}

export default EnlacePanel;
