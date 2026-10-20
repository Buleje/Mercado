"use client";

/**
 * PanelLateralAviso — el aviso de la agenda al costado derecho (Brandon, 20-10):
 * NO es un diálogo modal, así que la página de atrás se sigue usando: cambias de
 * pestaña, abres otras ventanas (que salen encima, `z-modal`) y el panel sigue.
 *
 * - `lateral`: flota a la derecha encima de la página.
 * - `fija`: la página se corre (`reglasAbierto`) para que el panel no tape
 *   nada, y vuelve al recargar hasta que la sueltes.
 * - Minimizado: queda una burbuja abajo a la derecha, al lado del «+» de
 *   acciones rápidas.
 * En el celular ocupa el ancho entero; minimizarlo devuelve la pantalla.
 */
import { useId, type ReactNode } from "react";
import { BellRing, Maximize2, Minimize2, Pin, PinOff, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import type { ModoAviso } from "@/lib/agenda/aviso-pantalla";
import { cn } from "@/lib/utils";

interface Props {
  modo: Exclude<ModoAviso, "ventana">;
  titulo: string;
  descripcion: string;
  /** Lo que falta (para la burbuja minimizada). */
  pendientes: number;
  minimizado: boolean;
  onMinimizar: (v: boolean) => void;
  onCambiarModo: (m: ModoAviso) => void;
  onCerrar: () => void;
  pie: ReactNode;
  children: ReactNode;
}

const ICONO = "size-5";
const ANCHO = "26rem";

/**
 * Mientras el panel está abierto: el «+» de acciones rápidas (`QuickActionsFab`,
 * `data-fab-rapido`) se corre a su izquierda (en el celular, donde el panel ocupa
 * todo, se esconde) y, si es fijo, la página se corre su ancho en pantallas
 * anchas. Van acá y no en globals.css: existen sólo con el panel abierto.
 */
function reglasAbierto(fija: boolean): string {
  const pagina = fija ? `@media (min-width:1024px){[data-admin-shell="true"]{padding-right:${ANCHO}}}` : "";
  return `${pagina}@media (min-width:640px){[data-fab-rapido]{right:calc(${ANCHO} + 1.5rem)!important}}@media (max-width:639.98px){[data-fab-rapido]{display:none!important}}`;
}

export function PanelLateralAviso({ modo, titulo, descripcion, pendientes, minimizado, onMinimizar, onCambiarModo, onCerrar, pie, children }: Props) {
  const tituloId = useId();
  const fija = modo === "fija";


  if (minimizado) {
    return (
      <button
        type="button"
        data-qa="aviso-burbuja"
        onClick={() => onMinimizar(false)}
        className="fixed bottom-7 right-24 z-dropdown inline-flex h-12 items-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] shadow-[var(--shadow-xl)] hover:border-[var(--accent)]"
        title="Abrir lo que te falta hacer"
      >
        <BellRing className="size-5 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden="true" />
        {pendientes > 0 ? `Te faltan ${pendientes}` : "Al día"}
      </button>
    );
  }

  return (
    <aside
      role="complementary"
      aria-labelledby={tituloId}
      data-qa="aviso-lateral"
      data-modo={modo}
      className="fixed inset-y-0 right-0 z-dropdown flex w-full flex-col border-l border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] sm:w-[26rem]"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !fija) onCerrar();
      }}
    >
      <style>{reglasAbierto(fija)}</style>
      <header className="flex items-start gap-2 border-b border-[var(--rule-soft)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <CardTitle as="h2" id={tituloId} className="truncate">
            {titulo}
          </CardTitle>
          <p className="truncate text-sm text-[var(--text-tertiary)]">{descripcion}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={() => onCambiarModo("ventana")} title="Abrir en una ventana al centro" aria-label="Abrir en ventana">
            <Maximize2 className={ICONO} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-qa="aviso-fijar"
            aria-pressed={fija}
            className={button({ variant: "ghost", size: "icon", className: cn(fija && "text-[var(--accent-ink)] dark:text-[var(--accent)]") })}
            onClick={() => onCambiarModo(fija ? "lateral" : "fija")}
            title={fija ? "Soltar: deja de correr la página y no vuelve al recargar" : "Fijar: sigue mientras trabajas, corre la página y vuelve al recargar"}
            aria-label={fija ? "Soltar del costado" : "Fijar al costado"}
          >
            {fija ? <PinOff className={ICONO} aria-hidden="true" /> : <Pin className={ICONO} aria-hidden="true" />}
          </button>
          <button type="button" data-qa="aviso-minimizar" className={button({ variant: "ghost", size: "icon" })} onClick={() => onMinimizar(true)} title="Minimizar a una burbuja" aria-label="Minimizar">
            <Minimize2 className={ICONO} aria-hidden="true" />
          </button>
          <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={onCerrar} title="Cerrar" aria-label="Cerrar">
            <X className={ICONO} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-lenis-prevent>
        {children}
      </div>
      <footer className="border-t border-[var(--rule-soft)] px-4 py-3">{pie}</footer>
    </aside>
  );
}
