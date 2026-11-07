"use client";

/**
 * El teclado del explorador del Archivo, como el de Windows. Sólo actúa con el
 * foco dentro del explorador y nunca mientras escribes en un campo; los atajos
 * del panel (Alt+1…9, Alt+L, Ctrl+Shift+…) siguen siendo del panel.
 *
 * Enter abre · Retroceso o Alt+↑ sube · Alt+←/→ atrás y adelante · F2 cambia
 * el nombre · Supr elimina · Ctrl+A / X / V / Z · Alt+Entrar propiedades ·
 * Esc suelta la selección · flechas (con Shift amplía) · una letra salta al
 * primero que empieza con ella.
 */

import { useRef, type KeyboardEvent } from "react";
import { puntoDeElemento, type PuntoDeMenu } from "./ubicar-menu";
import type { Mods } from "./use-seleccion-explorador";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** El primero (desde el de después del actual) cuyo nombre empieza con `buscado`. */
export function saltarA(nombres: readonly { clave: string; nombre: string }[], buscado: string, actual: string | null): string | null {
  const q = sinTildes(buscado);
  if (!q) return null;
  const i = actual ? nombres.findIndex((n) => n.clave === actual) : -1;
  // Repetir la misma letra pasa al siguiente que empieza igual (como Windows).
  const desde = q.length === 1 ? i + 1 : Math.max(i, 0);
  for (let k = 0; k < nombres.length; k++) {
    const n = nombres[(desde + k) % nombres.length];
    if (sinTildes(n.nombre).startsWith(q)) return n.clave;
  }
  return null;
}

/** El elemento de la fila de arriba/abajo más cercano en horizontal. */
function vecinoVertical(todos: HTMLElement[], actual: HTMLElement, abajo: boolean): HTMLElement | undefined {
  const r = actual.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const candidatos = todos
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r: o }) => (abajo ? o.top >= r.bottom - 2 : o.bottom <= r.top + 2));
  if (candidatos.length === 0) return undefined;
  const filaY = abajo ? Math.min(...candidatos.map((c) => c.r.top)) : Math.max(...candidatos.map((c) => c.r.top));
  const fila = candidatos.filter((c) => Math.abs(c.r.top - filaY) < 4);
  fila.sort((a, b) => Math.abs(a.r.left + a.r.width / 2 - cx) - Math.abs(b.r.left + b.r.width / 2 - cx));
  return fila[0]?.el;
}

export interface TecladoExplorador {
  nombres: readonly { clave: string; nombre: string }[];
  marcado: string | null;
  hayAlgoQueSoltar: boolean;
  clic: (clave: string, m?: Mods) => void;
  abrir: (clave: string) => void;
  /** `null` = el menú del fondo. */
  menu: (clave: string | null, punto: PuntoDeMenu) => void;
  renombrar: () => void;
  eliminar: () => void;
  todo: () => void;
  cortar: () => void;
  pegar: () => void;
  deshacer: () => void;
  propiedades: () => void;
  soltar: () => void;
  atras: () => void;
  adelante: () => void;
  subir: () => void;
}

const esCampo = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function useTecladoExplorador(t: TecladoExplorador) {
  const buffer = useRef({ texto: "", hasta: 0 });

  return (e: KeyboardEvent<HTMLElement>) => {
    if (esCampo(e.target) || e.nativeEvent.isComposing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const hecho = (fn: () => void) => { e.preventDefault(); e.stopPropagation(); fn(); };
    const k = e.key;

    if (e.altKey && !ctrl && !e.shiftKey) {
      if (k === "ArrowLeft") return hecho(t.atras);
      if (k === "ArrowRight") return hecho(t.adelante);
      if (k === "ArrowUp") return hecho(t.subir);
      if (k === "Enter") return hecho(t.propiedades);
      return; // Alt+1…9, Alt+L: del panel.
    }
    if (ctrl) {
      // Ctrl+Shift+… (Ctrl+Shift+C, Ctrl+Shift+P) es del panel: no se toca.
      if (e.shiftKey || e.altKey) return;
      const letra = k.toLowerCase();
      if (letra === "a") return hecho(t.todo);
      if (letra === "x") return hecho(t.cortar);
      if (letra === "v") return hecho(t.pegar);
      if (letra === "z") return hecho(t.deshacer);
      return;
    }
    if (k === "Backspace") return hecho(t.subir);
    if (k === "F2") return hecho(t.renombrar);
    if (k === "Delete") return hecho(t.eliminar);
    if (k === "Escape") {
      // Sin nada que soltar, Escape sigue su camino (cierra lo de arriba).
      if (t.hayAlgoQueSoltar) hecho(t.soltar);
      return;
    }

    const contenedor = e.currentTarget;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-clave]");
    const clave = el?.dataset.clave ?? null;
    if (k === "ContextMenu" || (e.shiftKey && k === "F10")) {
      return hecho(() => t.menu(clave, el ? puntoDeElemento(el) : puntoDeElemento(contenedor)));
    }
    if (k === "Enter") { if (clave) hecho(() => t.abrir(clave)); return; }
    if (k === " ") { if (clave) hecho(() => t.clic(clave, { ctrl: true })); return; }

    const todos = [...contenedor.querySelectorAll<HTMLElement>("[data-clave]")];
    if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(k)) {
      const i = el ? todos.indexOf(el) : -1;
      let sig: HTMLElement | undefined;
      if (!el) sig = todos[0];
      else if (k === "ArrowRight") sig = todos[i + 1];
      else if (k === "ArrowLeft") sig = todos[i - 1];
      else if (k === "Home") sig = todos[0];
      else if (k === "End") sig = todos[todos.length - 1];
      else sig = vecinoVertical(todos, el, k === "ArrowDown");
      e.preventDefault();
      if (sig?.dataset.clave) {
        sig.focus();
        t.clic(sig.dataset.clave, { shift: e.shiftKey });
      }
      return;
    }

    // Una letra o número: salta al primero que empieza así (700 ms para seguir escribiendo).
    if (k.length === 1 && k !== " ") {
      const ahora = Date.now();
      const b = buffer.current;
      b.texto = ahora < b.hasta ? b.texto + k : k;
      b.hasta = ahora + 700;
      // Misma letra repetida («aaa») = ir pasando entre los que empiezan con «a».
      const buscado = /^(.)\1+$/.test(b.texto) ? k : b.texto;
      const destino = saltarA(t.nombres, buscado, t.marcado);
      // preventDefault: si no, la «N» abre la campana del panel.
      e.preventDefault();
      if (!destino) return;
      t.clic(destino);
      contenedor.querySelector<HTMLElement>(`[data-clave="${CSS.escape(destino)}"]`)?.focus();
    }
  };
}
