"use client";

/**
 * Arrastrar la burbuja del mosaico minimizado (2026-10-07): se suelta y se
 * pega al borde más cercano (imán), y la posición queda recordada en este
 * navegador. Un toque NO es un arrastre: recién a los 6 px cuenta como tal, y
 * el clic que llega al soltar un arrastre se descarta (si no, abría el mosaico).
 *
 * Siempre se posiciona con `left/top` calculados: así el imán se anima con una
 * transición de CSS en vez de saltar de `left` a `right`. La transición vive
 * SÓLO al soltar (`iman`): al achicar la ventana la burbuja tiene que estar ya
 * en su lugar, no viajando desde el borde de antes (medido a 400 px: quedaba
 * medio afuera de la pantalla en la captura).
 */

import { useCallback, useEffect, useState, useRef } from "react";
import type { MouseEvent as EventoMouse, PointerEvent as EventoPuntero } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";

export type Lado = "izq" | "der";
interface Posicion {
  lado: Lado;
  /** Distancia del borde de abajo de la ventana al de la burbuja, en px. */
  abajo: number;
}

/** h-14 = 56 px, como el «+». */
export const TAMANO_BURBUJA = 56;
const MARGEN = 16;
const UMBRAL_ARRASTRE = 6;
/** Arriba va la cabecera del panel. */
const TOPE_ARRIBA = 72;
/**
 * Lo que la burbuja no tapa: a la derecha, el «+» (bottom 24 + 56) y la
 * burbuja del chat (bottom 96 + 56); a la izquierda, la barra del celular.
 */
const PISO_DERECHA = 168;
const PISO_IZQUIERDA = 80;
const POR_DEFECTO: Posicion = { lado: "der", abajo: PISO_DERECHA };
const CLAVE = "camaras-mosaico-burbuja";

const vista = () => ({ ancho: document.documentElement.clientWidth, alto: window.innerHeight });
const entre = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

function acotarAbajo(lado: Lado, abajo: number, alto: number): number {
  const piso = lado === "der" ? PISO_DERECHA : PISO_IZQUIERDA;
  return entre(abajo, piso, Math.max(piso, alto - TOPE_ARRIBA - TAMANO_BURBUJA));
}

export function useBurbujaArrastre() {
  const [guardada, setGuardada] = useLocalStorage<Posicion>(CLAVE, POR_DEFECTO);
  const [ventana, setVentana] = useState(vista);
  const [arrastre, setArrastre] = useState<{ x: number; y: number } | null>(null);
  const [iman, setIman] = useState(false);
  const descartarClic = useRef(false);

  useEffect(() => {
    if (!iman) return;
    const t = window.setTimeout(() => setIman(false), 400);
    return () => window.clearTimeout(t);
  }, [iman]);

  useEffect(() => {
    const medir = () => setVentana(vista());
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  /* Lo guardado puede venir de otra versión o de otra pantalla: se acota siempre. */
  const lado: Lado = guardada?.lado === "izq" ? "izq" : "der";
  const abajo = acotarAbajo(lado, Number(guardada?.abajo) || POR_DEFECTO.abajo, ventana.alto);
  const x = lado === "der" ? ventana.ancho - MARGEN - TAMANO_BURBUJA : MARGEN;
  const y = ventana.alto - abajo - TAMANO_BURBUJA;

  const onPointerDown = useCallback(
    (e: EventoPuntero<HTMLElement>) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("[data-sin-arrastre]")) return;
      const ini = { px: e.clientX, py: e.clientY, movido: false };
      const donde = (ev: PointerEvent) => {
        const v = vista();
        return {
          x: entre(x + ev.clientX - ini.px, 0, v.ancho - TAMANO_BURBUJA),
          y: entre(y + ev.clientY - ini.py, 0, v.alto - TAMANO_BURBUJA),
        };
      };
      const mover = (ev: PointerEvent) => {
        if (!ini.movido && Math.hypot(ev.clientX - ini.px, ev.clientY - ini.py) < UMBRAL_ARRASTRE) return;
        ini.movido = true;
        setArrastre(donde(ev));
      };
      const terminar = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", terminar);
        window.removeEventListener("pointercancel", terminar);
        setArrastre(null);
        if (!ini.movido) return;
        descartarClic.current = true;
        window.setTimeout(() => {
          descartarClic.current = false;
        }, 0);
        if (ev.type === "pointercancel") return;
        const v = vista();
        const p = donde(ev);
        const nuevo: Lado = p.x + TAMANO_BURBUJA / 2 < v.ancho / 2 ? "izq" : "der";
        setIman(true);
        setGuardada({ lado: nuevo, abajo: acotarAbajo(nuevo, v.alto - p.y - TAMANO_BURBUJA, v.alto) });
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", terminar);
      window.addEventListener("pointercancel", terminar);
    },
    [x, y, setGuardada],
  );

  /** En fase de captura: el clic de soltar un arrastre no llega al botón. */
  const onClickCapture = useCallback((e: EventoMouse<HTMLElement>) => {
    if (!descartarClic.current) return;
    descartarClic.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    lado,
    arrastrando: arrastre !== null,
    /** Recién soltada: se anima el viaje hasta el borde. */
    iman,
    estilo: { left: arrastre?.x ?? x, top: arrastre?.y ?? y },
    onPointerDown,
    onClickCapture,
  };
}
