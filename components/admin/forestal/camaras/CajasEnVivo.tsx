"use client";

/**
 * Las cajas del detector sobre el video en vivo de un cuadro del mosaico
 * (Brandon 2026-10-08: «que detecte el movimiento de las personas, las marque,
 * les ponga la etiqueta y avise»). Hasta hoy el detector sólo contaba en la
 * pastilla; ahora cada persona lleva su recuadro coral —el mismo token de las
 * cajas de las fotos guardadas— con «Persona 2 · 87 %», y cada zona con
 * movimiento, un recuadro punteado celeste sin etiqueta.
 *
 * Las cajas vienen en fracciones del CUADRO (0-1), no del marco: en pantalla
 * completa EZUIKit dibuja el video 16:9 centrado con franjas a los lados y un
 * `inset-0` corría las cajas hacia las franjas. Por eso la capa se calca sobre
 * el rectángulo real del `<canvas>`/`<video>` (ResizeObserver + MutationObserver:
 * el lienzo aparece DESPUÉS del montaje y cambia de tamaño al girar el celular).
 *
 * Las personas salen chicas (10-20 px en un cuadro de 768×432): la etiqueta va
 * FUERA de la caja —arriba; abajo si la caja toca el borde de arriba; adentro
 * sólo si no entra ni arriba ni abajo— y nunca la tapa. El «recién apareció»
 * es un punto que late DENTRO de la etiqueta, no en la esquina de la caja: en
 * una caja de 12 px un punto de 10 px se la comía.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { CajaFraccion, PersonaEnVivo } from "@/lib/camaras/vigia";
import { cn } from "@/lib/utils";
import { fuenteDelVideo } from "./reproductor-nube";

interface Props {
  personas: readonly PersonaEnVivo[];
  movimiento: readonly CajaFraccion[];
  /** El `div` donde pinta EZUIKit: de ahí sale el `<canvas>`/`<video>` a calcar. */
  contenedorId: string;
}

/** Alto de una etiqueta `text-xs` y ancho de «Persona 12 · 100 %», con aire (px). */
const ETIQUETA_ALTO_PX = 20;
const ETIQUETA_ANCHO_PX = 124;

/* Texto negro sobre coral/celeste: 7,6:1 en claro y más en oscuro (el video
   es el mismo en los dos temas; `--text-primary` en oscuro es casi blanco y
   sobre el coral quedaba en 2,2:1). */
const ETIQUETA =
  "absolute flex items-center gap-1 whitespace-nowrap rounded-sm px-1 py-px text-xs font-bold leading-tight tabular-nums text-black shadow-[var(--shadow-sm)]";

type Vertical = "arriba" | "abajo" | "dentro";
const POSICION: Record<Vertical, string> = {
  arriba: "bottom-full mb-px",
  abajo: "top-full mt-px",
  dentro: "top-0",
};

interface Lugar {
  vertical: Vertical;
  /** Pegada al borde derecho de la caja (si a la izquierda se saldría del cuadro). */
  derecha: boolean;
}

interface Recto {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function CajasEnVivo({ personas, movimiento, contenedorId }: Props) {
  const capa = useRef<HTMLDivElement>(null);
  const recto = useRectoDelVideo(contenedorId, capa);
  const ancho = recto?.width ?? 0;
  const alto = recto?.height ?? 0;

  /* La capa se dibuja siempre (vacía también): el efecto que la calca necesita su `ref`. */
  return (
    <div
      ref={capa}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={recto ? { ...recto, right: "auto", bottom: "auto" } : undefined}
      data-cajas-en-vivo={personas.length}
    >
      {movimiento.map((c, i) => (
        <div key={i} className="absolute" style={estiloCaja(c)} data-movimiento-caja>
          {/* Sin etiqueta (medido 08-10 con cuadros reales: 8 «Movimiento»
              encimados tapaban a las personas). El punteado celeste ya dice
              «algo se movió acá»; la etiqueta queda para las personas. */}
          <span className="absolute inset-0 border border-dashed border-[var(--data-info-500)]" />
        </div>
      ))}
      {personas.map((p) => (
        <div
          key={p.id}
          className={cn(
            "absolute transition-[left,top,width,height] duration-[var(--dur-base)] ease-out",
            p.estimada && "opacity-60",
          )}
          style={estiloCaja(p)}
          data-persona-caja={p.id}
        >
          {/* Anillo negro finito por fuera: el coral solo se perdía sobre tierra al sol. */}
          <span
            className={cn(
              "absolute inset-0 border-[var(--data-warning-500)] ring-1 ring-black/40",
              p.nueva ? "border-[3px]" : "border-2",
              p.estimada && "border-dashed",
            )}
          />
          <Etiqueta lugar={lugarEtiqueta(p, ancho, alto)} className="bg-[var(--data-warning-500)]">
            {p.nueva && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
              </span>
            )}
            Persona {p.id} · {Math.round(p.confianza * 100)} %
          </Etiqueta>
        </div>
      ))}
    </div>
  );
}

function Etiqueta({
  lugar,
  className,
  children,
}: {
  lugar: Lugar;
  className: string;
  children: ReactNode;
}) {
  return (
    <span className={cn(ETIQUETA, POSICION[lugar.vertical], lugar.derecha ? "right-0" : "left-0", className)}>
      {children}
    </span>
  );
}

const fraccion = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const pct = (n: number) => `${(fraccion(n) * 100).toFixed(2)}%`;

function estiloCaja(c: CajaFraccion): CSSProperties {
  const x = fraccion(c.x);
  const y = fraccion(c.y);
  return { left: pct(x), top: pct(y), width: pct(Math.min(c.ancho, 1 - x)), height: pct(Math.min(c.alto, 1 - y)) };
}

/** Dónde cabe la etiqueta sin tapar la caja ni salirse del cuadro (sin medidas: 10 % / 30 %). */
function lugarEtiqueta(c: CajaFraccion, anchoPx: number, altoPx: number): Lugar {
  const umbralY = altoPx > 0 ? ETIQUETA_ALTO_PX / altoPx : 0.1;
  const umbralX = anchoPx > 0 ? ETIQUETA_ANCHO_PX / anchoPx : 0.3;
  const vertical: Vertical = c.y >= umbralY ? "arriba" : c.y + c.alto <= 1 - umbralY ? "abajo" : "dentro";
  return { vertical, derecha: c.x + umbralX > 1 && c.x + c.ancho >= umbralX };
}

/**
 * El rectángulo del video dentro del padre de la capa, en px. Sin lienzo
 * todavía, el padre entero (el marco 16:9 fuera de pantalla completa).
 */
function useRectoDelVideo(contenedorId: string, capa: RefObject<HTMLDivElement | null>): Recto | null {
  const [recto, setRecto] = useState<Recto | null>(null);
  useEffect(() => {
    const caja = document.getElementById(contenedorId);
    const padre = capa.current?.parentElement;
    if (!caja || !padre || typeof ResizeObserver === "undefined") return;
    let fuente: Element | null = null;
    const medir = () => {
      const f = fuenteDelVideo(caja);
      if (f !== fuente) {
        if (fuente) tamano.unobserve(fuente);
        if (f) tamano.observe(f);
        fuente = f;
      }
      const r = rectoVisible(f, padre);
      setRecto((prev) =>
        prev && prev.left === r.left && prev.top === r.top && prev.width === r.width && prev.height === r.height
          ? prev
          : r,
      );
    };
    const tamano = new ResizeObserver(medir);
    const hijos = new MutationObserver(medir);
    tamano.observe(padre);
    hijos.observe(caja, { childList: true, subtree: true });
    medir();
    return () => {
      tamano.disconnect();
      hijos.disconnect();
    };
  }, [contenedorId, capa]);
  return recto;
}

function rectoVisible(fuente: Element | null, padre: HTMLElement): Recto {
  const entero = { left: 0, top: 0, width: padre.clientWidth, height: padre.clientHeight };
  if (!fuente) return entero;
  const p = padre.getBoundingClientRect();
  const r = fuente.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return entero;
  let left = r.left - p.left - padre.clientLeft;
  let top = r.top - p.top - padre.clientTop;
  let width = r.width;
  let height = r.height;
  /* Un `<video>` pinta el cuadro «contain» dentro de su caja: las franjas no son cuadro. */
  if (fuente instanceof HTMLVideoElement && fuente.videoWidth > 0 && fuente.videoHeight > 0) {
    const escala = Math.min(width / fuente.videoWidth, height / fuente.videoHeight);
    const w = fuente.videoWidth * escala;
    const h = fuente.videoHeight * escala;
    left += (width - w) / 2;
    top += (height - h) / 2;
    width = w;
    height = h;
  }
  return { left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) };
}
