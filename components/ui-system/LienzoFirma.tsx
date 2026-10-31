"use client";

/**
 * Lienzo para firmar a mano: dedo en el celular, mouse o lápiz en la PC.
 *
 * Sin librería: canvas + pointer events alcanzan, y una dependencia por un
 * lienzo era sumar peso a todo el panel. Lo que lo hace usable con el dedo:
 *   · `touch-action: none` — sin esto el celular hacía scroll del modal en
 *     vez de dibujar.
 *   · Captura del puntero — salir del lienzo con el dedo no corta el trazo.
 *   · `getCoalescedEvents` — los puntos que el navegador junta entre cuadro y
 *     cuadro; sin ellos una firma rápida sale en rectas.
 *   · Pintado a la resolución real de la pantalla (devicePixelRatio).
 *
 * Controlado: los trazos (vector, `lib/firma/trazos.ts`) los tiene el padre, que
 * decide qué hacer con ellos. Se pintan con el color de texto del tema; el
 * papel los exporta aparte, en negro sobre blanco.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Undo2 } from "@buleje/design-system/icons";
import { RELACION_LIENZO, pintarTrazos, type Punto, type Trazo } from "@/lib/firma/trazos";

/** Distancia mínima entre puntos (en anchos de lienzo): menos es ruido que pesa. */
const PASO_MINIMO = 0.0015;

const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export default function LienzoFirma({
  trazos,
  onCambio,
  etiqueta,
  ayuda = "Firma aquí con el dedo",
  deshabilitado = false,
}: {
  trazos: Trazo[];
  onCambio: (trazos: Trazo[]) => void;
  /** Para lectores de pantalla: «Firma de Juan Pérez». */
  etiqueta: string;
  ayuda?: string;
  deshabilitado?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** El trazo que se está dibujando: en un ref para no re-renderizar por punto. */
  const actual = useRef<Trazo | null>(null);
  const trazosRef = useRef(trazos);
  const cuadro = useRef(0);
  const [dibujando, setDibujando] = useState(false);

  const pintar = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const lista = actual.current ? [...trazosRef.current, actual.current] : trazosRef.current;
    /* El color sale del token del tema (`text-[var(--text-primary)]` del canvas). */
    pintarTrazos(ctx, lista, { encuadre: { escala: w, dx: 0, dy: 0 }, tinta: getComputedStyle(c).color, grosor: 2.6 * dpr });
  }, []);

  const programar = useCallback(() => {
    if (cuadro.current) return;
    cuadro.current = requestAnimationFrame(() => {
      cuadro.current = 0;
      pintar();
    });
  }, [pintar]);

  useEffect(() => {
    trazosRef.current = trazos;
    pintar();
  }, [trazos, pintar]);

  /* Girar el celular cambia el tamaño; cambiar de tema, el color de la tinta. */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => pintar());
    ro.observe(c);
    const mo = new MutationObserver(() => pintar());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(cuadro.current);
    };
  }, [pintar]);

  const punto = (e: { clientX: number; clientY: number }): Punto => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return { x: 0, y: 0 };
    return {
      x: acotar((e.clientX - r.left) / r.width, 0, 1),
      y: acotar((e.clientY - r.top) / r.width, 0, 1 / RELACION_LIENZO),
    };
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (deshabilitado || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Un puntero que ya se soltó no se captura: el trazo sigue igual dentro del lienzo. */
    }
    actual.current = [punto(e)];
    setDibujando(true);
    programar();
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const t = actual.current;
    if (!t) return;
    const nativo = e.nativeEvent;
    const juntos = typeof nativo.getCoalescedEvents === "function" ? nativo.getCoalescedEvents() : [];
    for (const ev of juntos.length ? juntos : [nativo]) {
      const p = punto(ev);
      const ultimo = t[t.length - 1];
      if (Math.hypot(p.x - ultimo.x, p.y - ultimo.y) >= PASO_MINIMO) t.push(p);
    }
    programar();
  };

  const cambiar = (nuevos: Trazo[]) => {
    trazosRef.current = nuevos;
    onCambio(nuevos);
  };

  const terminar = () => {
    const t = actual.current;
    if (!t) return;
    actual.current = null;
    setDibujando(false);
    /* El ref se pone al día YA: dos trazos seguidos antes del próximo render
       (firma rápida) pisaban el primero con `[...viejos, segundo]`. */
    cambiar([...trazosRef.current, t]);
  };


  const vacio = trazos.length === 0 && !dibujando;
  const boton =
    "inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl border border-dashed border-[var(--rule-strong)] bg-[var(--surface-sunken)]">
        {/* La línea y la «×» de un papel: dicen dónde firmar sin leer nada. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-[6%] bottom-[24%] border-b border-[var(--rule-strong)]" />
        <span aria-hidden className="pointer-events-none absolute bottom-[25%] left-[6%] text-xl font-bold text-[var(--text-tertiary)]">
          ×
        </span>
        {vacio && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-[30%] text-center text-base font-semibold text-[var(--text-tertiary)]">
            {ayuda}
          </span>
        )}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={trazos.length ? `${etiqueta}: firmado` : `${etiqueta}: sin firmar`}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onLostPointerCapture={terminar}
          data-lienzo-firma
          className={`absolute inset-0 h-full w-full touch-none select-none text-[var(--text-primary)] ${deshabilitado ? "cursor-not-allowed" : "cursor-crosshair"}`}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => cambiar(trazos.slice(0, -1))} disabled={deshabilitado || trazos.length === 0} className={boton}>
          <Undo2 className="h-4 w-4" aria-hidden /> Deshacer trazo
        </button>
        <button type="button" onClick={() => cambiar([])} disabled={deshabilitado || trazos.length === 0} className={boton}>
          <Eraser className="h-4 w-4" aria-hidden /> Borrar y rehacer
        </button>
      </div>
    </div>
  );
}
