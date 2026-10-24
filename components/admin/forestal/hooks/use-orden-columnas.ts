"use client";

/**
 * El orden de las columnas de una tabla, guardado por tenant, y el arrastre
 * de su cabecera para cambiarlo (Brandon, 2026-10-03: «con solo mover o
 * sostener las columnas poder moverlas y cambiarlas de posición»).
 *
 * Arrastrar va con Pointer Events y no con el drag & drop de HTML5: éste no
 * anda con el dedo en la tablet y dibuja un fantasma que tapa la tabla.
 *  - Mouse/lápiz: se mantiene apretado y se mueve más de 6 px → arrastra.
 *  - Dedo: se SOSTIENE 300 ms quieto → arrastra. Moverse antes es scrollear
 *    la tabla, como siempre: sin esto, tocar un título bloquearía el scroll.
 * Al soltar sobre una cabecera, la columna queda ANTES de ésa (después de la
 * última si se suelta pasando el final). El clic que el navegador dispara al
 * soltar se traga: si no, soltar sobre «m³» marcaría la columna entera.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { desplazarColumna, esOrdenDeFabrica, moverColumna, normalizarOrden } from "@/lib/forestal/cubicador-orden-columnas";

const UMBRAL_MOUSE_PX = 6;
const UMBRAL_DEDO_PX = 10;
const SOSTENER_MS = 300;
const BORDE_SCROLL_PX = 48;
const PASO_SCROLL_PX = 16;
/** Atributo que marca una cabecera movible: el destino se busca por él. */
const ATTR = "data-col-orden";

export interface PropsThArrastrable {
  "data-col-orden": string;
  onPointerDown: (e: React.PointerEvent<HTMLTableCellElement>) => void;
  title: string;
}

export interface ArrastreColumna<K extends string> {
  clave: K;
  /** Antes de cuál va a quedar al soltar (`null` = al final). */
  antesDe: K | null;
}

function leer<K extends string>(clave: string, porDefecto: readonly K[]): K[] {
  if (typeof window === "undefined") return [...porDefecto];
  try {
    const raw = localStorage.getItem(clave);
    return normalizarOrden(raw ? (JSON.parse(raw) as unknown) : null, porDefecto);
  } catch {
    return [...porDefecto];
  }
}

/** El contenedor que scrollea en horizontal (el de `DataTable`). */
function scrollerDe(el: Element | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX;
    if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth) return n;
  }
  return null;
}

export function useOrdenColumnas<K extends string>(claveGuardado: string, porDefecto: readonly K[]) {
  const [orden, setOrden] = useState<K[]>(() => leer(claveGuardado, porDefecto));
  useEffect(() => {
    try {
      if (esOrdenDeFabrica(orden, porDefecto)) localStorage.removeItem(claveGuardado);
      else localStorage.setItem(claveGuardado, JSON.stringify(orden));
    } catch { /* quota */ }
  }, [orden, claveGuardado, porDefecto]);

  const mover = useCallback((clave: K, antesDe: K | null) => setOrden((o) => moverColumna(o, clave, antesDe)), []);
  const desplazar = useCallback(
    (clave: K, dir: -1 | 1, cuenta?: (k: K) => boolean) => setOrden((o) => desplazarColumna(o, clave, dir, cuenta)),
    [],
  );
  const restablecer = useCallback(() => setOrden([...porDefecto]), [porDefecto]);
  return { orden, mover, desplazar, restablecer, deFabrica: esOrdenDeFabrica(orden, porDefecto) };
}

/**
 * El gesto de arrastrar la cabecera. `onSoltar` recibe la columna y antes de
 * cuál queda; no se llama si se suelta en el mismo lugar.
 */
export function useArrastreColumnas<K extends string>(visibles: readonly K[], onSoltar: (clave: K, antesDe: K | null) => void) {
  const [arrastre, setArrastre] = useState<ArrastreColumna<K> | null>(null);
  const limpiarRef = useRef<(() => void) | null>(null);
  const visiblesRef = useRef(visibles);
  const onSoltarRef = useRef(onSoltar);
  useEffect(() => {
    visiblesRef.current = visibles;
    onSoltarRef.current = onSoltar;
  });
  useEffect(() => () => limpiarRef.current?.(), []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLTableCellElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const th = e.currentTarget;
    const clave = th.getAttribute(ATTR) as K | null;
    const fila = th.closest("tr");
    if (!clave || !fila) return;
    limpiarRef.current?.();

    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    const dedo = e.pointerType === "touch";
    let activo = false;
    let antesDe: K | null = null;
    let reloj: ReturnType<typeof setTimeout> | null = null;
    const scroller = scrollerDe(fila.closest("table"));

    const destinoEn = (x: number): K | null => {
      const ths = [...fila.querySelectorAll<HTMLTableCellElement>(`th[${ATTR}]`)];
      for (const t of ths) {
        const r = t.getBoundingClientRect();
        if (x < r.left + r.width / 2) return t.getAttribute(ATTR) as K;
      }
      return null;
    };
    const activar = () => {
      activo = true;
      antesDe = destinoEn(x0);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      setArrastre({ clave, antesDe });
    };
    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!activo) {
        if (dedo) {
          // Moverse antes de cumplir el «sostener» es scrollear: se suelta el gesto.
          if (Math.hypot(dx, dy) > UMBRAL_DEDO_PX) fin();
          return;
        }
        if (Math.abs(dx) < UMBRAL_MOUSE_PX) return;
        activar();
      }
      if (scroller) {
        const r = scroller.getBoundingClientRect();
        if (ev.clientX < r.left + BORDE_SCROLL_PX) scroller.scrollLeft -= PASO_SCROLL_PX;
        else if (ev.clientX > r.right - BORDE_SCROLL_PX) scroller.scrollLeft += PASO_SCROLL_PX;
      }
      const nuevo = destinoEn(ev.clientX);
      if (nuevo !== antesDe) {
        antesDe = nuevo;
        setArrastre({ clave, antesDe });
      }
    };
    const tragarClic = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
    const soltar = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (activo) {
        const vis = visiblesRef.current;
        const iClave = vis.indexOf(clave);
        const iDestino = antesDe == null ? vis.length : vis.indexOf(antesDe);
        // Soltar sobre sí misma o sobre la de al lado (a su derecha) no mueve nada.
        if (iDestino !== iClave && iDestino !== iClave + 1) onSoltarRef.current(clave, antesDe);
        window.addEventListener("click", tragarClic, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", tragarClic, { capture: true }), 0);
      }
      fin();
    };
    const sinScroll = (ev: TouchEvent) => { if (activo) ev.preventDefault(); };
    function fin() {
      if (reloj) clearTimeout(reloj);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      window.removeEventListener("touchmove", sinScroll);
      if (activo) {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
      activo = false;
      limpiarRef.current = null;
      setArrastre(null);
    }
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    if (dedo) {
      window.addEventListener("touchmove", sinScroll, { passive: false });
      reloj = setTimeout(activar, SOSTENER_MS);
    }
    limpiarRef.current = fin;
  }, []);

  /** Props de la `<th>` movible. */
  const propsTh = useCallback(
    (clave: K): PropsThArrastrable => ({ "data-col-orden": clave, onPointerDown, title: "Mantén apretado y arrastra para mover la columna" }),
    [onPointerDown],
  );

  /** Clases de la `<th>`: la que se arrastra se apaga y la raya marca dónde cae. */
  const claseTh = useCallback(
    (clave: K): string => {
      const base = "group/th relative cursor-grab select-none";
      if (!arrastre) return base;
      const ultima = visibles[visibles.length - 1];
      const raya =
        arrastre.antesDe === clave ? " shadow-[inset_3px_0_0_var(--accent)]"
        : arrastre.antesDe == null && clave === ultima ? " shadow-[inset_-3px_0_0_var(--accent)]"
        : "";
      return `${base}${arrastre.clave === clave ? " bg-[var(--accent-muted)] opacity-60" : ""}${raya}`;
    },
    [arrastre, visibles],
  );

  return { arrastre, propsTh, claseTh };
}
