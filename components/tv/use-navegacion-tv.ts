"use client";

/**
 * El control remoto (Modo TV): las flechas mueven el foco entre lo que tenga
 * `data-tv-foco`, OK (Enter) aprieta el botón con foco —nativo de `<button>`—
 * y «Atrás» llama a `onAtras`. También esconde el cursor a los 3 s sin mover
 * el mouse (los TV con puntero «aire» lo dejan flotando encima del video).
 */

import { useEffect, useRef, useState } from "react";
import { direccionDeTecla, esTeclaAtras, siguienteFoco, TV_CURSOR_MS, type Caja } from "./tv-ui";

const SELECTOR = "[data-tv-foco]";

const caja = (el: Element): Caja => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, ancho: r.width, alto: r.height };
};

/**
 * @param clave cambia cuando cambia la pantalla (código / mosaico / una cámara):
 *   al cambiar, el foco va a `[data-tv-inicial]` o al primero.
 */
export function useNavegacionTv(clave: string, onAtras?: () => void) {
  const atras = useRef(onAtras);
  useEffect(() => {
    atras.current = onAtras;
  }, [onAtras]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const inicial =
        document.querySelector<HTMLElement>(`${SELECTOR}[data-tv-inicial]`) ??
        document.querySelector<HTMLElement>(SELECTOR);
      inicial?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [clave]);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const dir = direccionDeTecla(e.key);
      if (dir) {
        const todos = [...document.querySelectorAll<HTMLElement>(SELECTOR)];
        if (todos.length === 0) return;
        e.preventDefault();
        const actual = document.activeElement as HTMLElement | null;
        if (!actual || !todos.includes(actual)) {
          todos[0].focus();
          return;
        }
        const otros = todos.filter((el) => el !== actual);
        const i = siguienteFoco(caja(actual), otros.map(caja), dir);
        if (i >= 0) otros[i].focus();
        return;
      }
      const enCampo = (e.target as HTMLElement | null)?.tagName === "INPUT";
      if (atras.current && !enCampo && esTeclaAtras(e.key, e.keyCode)) {
        e.preventDefault();
        atras.current();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, []);
}

/** `true` = esconder el cursor (pasaron 3 s sin mover el mouse). */
export function useCursorQuieto(): { quieto: boolean; alMover: () => void } {
  const [quieto, setQuieto] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alMover = () => {
    setQuieto(false);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setQuieto(true), TV_CURSOR_MS);
  };
  useEffect(() => {
    t.current = setTimeout(() => setQuieto(true), TV_CURSOR_MS);
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, []);
  return { quieto, alMover };
}

/**
 * Las de Hik-Connect se pausan tras `minutos` sin tocar el control (cada vivo
 * despierta la cámara solar y gasta datos del chip). Cualquier tecla las sigue.
 */
export function useInactividadTv(minutos: number): { pausado: boolean } {
  const [pausado, setPausado] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const reiniciar = () => {
      setPausado(false);
      if (t) clearTimeout(t);
      t = setTimeout(() => setPausado(true), minutos * 60_000);
    };
    reiniciar();
    document.addEventListener("keydown", reiniciar);
    document.addEventListener("pointerdown", reiniciar);
    return () => {
      if (t) clearTimeout(t);
      document.removeEventListener("keydown", reiniciar);
      document.removeEventListener("pointerdown", reiniciar);
    };
  }, [minutos]);
  return { pausado };
}
