"use client";

/**
 * PanelLateralAviso — el aviso de la agenda como barra al costado derecho
 * (Brandon, 20-10): NO es un diálogo modal ni flota encima. Ocupa su lugar: la
 * página se achica para hacerle espacio (en pantallas de 1024 px o más) y se
 * sigue usando entera; cambias de pestaña, abres otras ventanas (salen encima,
 * `z-modal`) y la barra sigue.
 *
 * - El borde izquierdo se arrastra para ensanchar o angostar la barra (o con
 *   ← → desde el teclado; doble clic vuelve al ancho de fábrica).
 * - `lateral` se cierra con la X o Escape; `fija` además vuelve al recargar.
 * - Minimizado: queda una burbuja abajo a la derecha y la página vuelve entera.
 * En el celular ocupa el ancho entero; minimizarla devuelve la pantalla.
 */
import { useEffect, useId, useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from "react";
import { BellRing, Maximize2, Minimize2, Pin, PinOff, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { button } from "@/components/ui-system/button-variants";
import { ANCHO_PANEL, anchoPanel, type ModoAviso } from "@/lib/agenda/aviso-pantalla";
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
  /** Ancho guardado en px (`null` = de fábrica) y dónde guardarlo al soltar el borde. */
  ancho: number | null;
  onAncho: (px: number | null) => void;
  pie: ReactNode;
  children: ReactNode;
}

const ICONO = "size-5";
const PASO_TECLADO = 32;

/**
 * Mientras la barra está abierta: la página se achica su ancho (≥1024 px), la
 * barra toma ese ancho (≥640 px; abajo ocupa todo) y el «+» de acciones rápidas
 * (`QuickActionsFab`, `data-fab-rapido`) se corre a su izquierda (en el celular
 * se esconde). Van acá y no en globals.css: existen sólo con la barra abierta.
 */
function reglasAbierto(px: number): string {
  return [
    `@media (min-width:640px){[data-qa="aviso-lateral"]{width:${px}px}[data-fab-rapido]{right:${px + 24}px!important}}`,
    `@media (min-width:1024px){[data-admin-shell="true"]{padding-right:${px}px}}`,
    `@media (max-width:639.98px){[data-fab-rapido]{display:none!important}}`,
  ].join("");
}

/** El ancho que se ve: el guardado (o el que se está arrastrando) dentro de lo que deja la pantalla. */
function useAnchoVisible(pedido: number | null): number {
  const [ventana, setVentana] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const alCambiar = () => setVentana(window.innerWidth);
    window.addEventListener("resize", alCambiar);
    return () => window.removeEventListener("resize", alCambiar);
  }, []);
  return anchoPanel(pedido, ventana);
}

export function PanelLateralAviso({ modo, titulo, descripcion, pendientes, minimizado, onMinimizar, onCambiarModo, onCerrar, ancho, onAncho, pie, children }: Props) {
  const tituloId = useId();
  const fija = modo === "fija";
  /* Mientras arrastras, el ancho vive acá (se ve al instante); al soltar se guarda una vez. */
  const [arrastre, setArrastre] = useState<number | null>(null);
  const visible = useAnchoVisible(arrastre ?? ancho);
  const inicio = useRef<{ x: number; ancho: number } | null>(null);

  const empezar = (e: EventoPuntero<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* puntero sintético (pruebas): se arrastra igual sin captura */
    }
    inicio.current = { x: e.clientX, ancho: visible };
    document.body.style.userSelect = "none";
  };
  const mover = (e: EventoPuntero<HTMLDivElement>) => {
    if (!inicio.current) return;
    /* El borde está a la izquierda: ir a la izquierda ensancha. */
    setArrastre(anchoPanel(inicio.current.ancho + (inicio.current.x - e.clientX), window.innerWidth));
  };
  const soltar = () => {
    if (!inicio.current) return;
    inicio.current = null;
    document.body.style.userSelect = "";
    if (arrastre !== null) onAncho(arrastre);
    setArrastre(null);
  };

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
      className="fixed inset-y-0 right-0 z-dropdown flex w-full flex-col border-l border-[var(--rule-base)] bg-[var(--surface-raised)]"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !fija) onCerrar();
      }}
    >
      <style>{reglasAbierto(visible)}</style>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ancho de la barra: arrastra o usa las flechas"
        aria-valuemin={ANCHO_PANEL.min}
        aria-valuemax={ANCHO_PANEL.max}
        aria-valuenow={visible}
        tabIndex={0}
        data-qa="aviso-borde"
        title="Arrastra para cambiar el ancho · doble clic: ancho de fábrica"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onDoubleClick={() => onAncho(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          onAncho(anchoPanel(visible + (e.key === "ArrowLeft" ? PASO_TECLADO : -PASO_TECLADO), window.innerWidth));
        }}
        className={cn(
          "absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none sm:block",
          "after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-transparent after:transition-colors",
          "hover:after:bg-[var(--accent)] focus-visible:outline-none focus-visible:after:bg-[var(--accent)]",
          arrastre !== null && "after:bg-[var(--accent)]",
        )}
      />
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
            title={fija ? "Soltar: ya no vuelve al recargar" : "Fijar: sigue mientras trabajas y vuelve al recargar"}
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
