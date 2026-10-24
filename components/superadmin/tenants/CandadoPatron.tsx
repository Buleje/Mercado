"use client";

import { useRef, useState } from "react";
import { PATRON_MIN } from "@/lib/superadmin/candado-reglas";

/**
 * Patrón de 3×3 para el candado de credenciales.
 *
 * Con el dedo o el mouse: se aprieta un punto y se arrastra pasando por otros
 * (pointer events con captura: el trazo sigue aunque el dedo salga del punto).
 * Con el teclado: flechas mueven el foco entre los puntos, Espacio/Enter suma el
 * punto enfocado, los números 1-9 suman esa casilla, Retroceso quita el último
 * y Enter con el trazo armado lo entrega.
 *
 * El patrón sale como los números de las casillas en orden («1475»).
 */

const PUNTOS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
/** Centro de cada casilla en un lienzo de 300×300 (las líneas del trazo). */
const centro = (n: number) => ({ x: (((n - 1) % 3) + 0.5) * 100, y: (Math.floor((n - 1) / 3) + 0.5) * 100 });

export function CandadoPatron({
  onListo,
  ocupado = false,
  etiqueta,
}: {
  onListo: (patron: string) => void;
  ocupado?: boolean;
  etiqueta: string;
}) {
  const [trazo, setTrazo] = useState<number[]>([]);
  const [dibujando, setDibujando] = useState(false);
  const [foco, setFoco] = useState(5);
  const cajaRef = useRef<HTMLDivElement>(null);

  const sumar = (n: number) => setTrazo((t) => (t.includes(n) ? t : [...t, n]));

  /** La casilla bajo el puntero (radio de toque generoso: 38 % de la casilla). */
  const puntoEn = (clientX: number, clientY: number): number | null => {
    const r = cajaRef.current?.getBoundingClientRect();
    if (!r) return null;
    const col = Math.floor(((clientX - r.left) / r.width) * 3);
    const fila = Math.floor(((clientY - r.top) / r.height) * 3);
    if (col < 0 || col > 2 || fila < 0 || fila > 2) return null;
    const n = fila * 3 + col + 1;
    const c = centro(n);
    const dx = ((clientX - r.left) / r.width) * 300 - c.x;
    const dy = ((clientY - r.top) / r.height) * 300 - c.y;
    return Math.hypot(dx, dy) <= 38 ? n : null;
  };

  const entregar = (t: number[]) => {
    if (t.length >= PATRON_MIN) onListo(t.join(""));
  };

  const alSoltar = () => {
    if (!dibujando) return;
    setDibujando(false);
    if (trazo.length >= PATRON_MIN) entregar(trazo);
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (ocupado) return;
    const mover: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    if (e.key in mover) {
      e.preventDefault();
      const d = mover[e.key];
      const sig = foco + d;
      const mismaFila = Math.abs(d) === 1 ? Math.floor((sig - 1) / 3) === Math.floor((foco - 1) / 3) : true;
      if (sig >= 1 && sig <= 9 && mismaFila) setFoco(sig);
    } else if (e.key === " ") {
      e.preventDefault();
      sumar(foco);
    } else if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      sumar(Number(e.key));
      setFoco(Number(e.key));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      setTrazo((t) => t.slice(0, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (trazo.length >= PATRON_MIN) entregar(trazo);
      else sumar(foco);
    } else if (e.key === "Escape" && trazo.length > 0) {
      e.stopPropagation();
      setTrazo([]);
    }
  };

  const puntosTrazo = trazo.map(centro);

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={cajaRef}
        role="group"
        tabIndex={0}
        aria-label={`${etiqueta}. Flechas para moverte, Espacio para sumar el punto, números del 1 al 9 para tocar una casilla, Retroceso para quitar el último y Enter para confirmar.`}
        onKeyDown={alTeclear}
        onPointerDown={(e) => {
          if (ocupado) return;
          const n = puntoEn(e.clientX, e.clientY);
          if (n == null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setTrazo([n]);
          setDibujando(true);
        }}
        onPointerMove={(e) => {
          if (!dibujando) return;
          const n = puntoEn(e.clientX, e.clientY);
          if (n != null) sumar(n);
        }}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        className="relative h-60 w-60 touch-none select-none rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {puntosTrazo.length > 1 && (
            <polyline
              points={puntosTrazo.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={8}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.6}
            />
          )}
          {PUNTOS.map((n) => {
            const c = centro(n);
            const marcado = trazo.includes(n);
            return (
              <g key={n}>
                {foco === n && <circle cx={c.x} cy={c.y} r={30} fill="none" stroke="var(--rule-strong, var(--rule-base))" strokeWidth={2} strokeDasharray="4 4" />}
                <circle cx={c.x} cy={c.y} r={marcado ? 16 : 10} fill={marcado ? "var(--accent)" : "var(--text-tertiary)"} />
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-[var(--text-tertiary)]" aria-live="polite">
        {trazo.length === 0
          ? `Une al menos ${PATRON_MIN} puntos`
          : `${trazo.length} punto${trazo.length === 1 ? "" : "s"}${trazo.length < PATRON_MIN ? ` · faltan ${PATRON_MIN - trazo.length}` : ""}`}
      </p>
      {trazo.length > 0 && !dibujando && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTrazo([])}
            className="h-9 rounded-lg px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            Borrar
          </button>
          {trazo.length >= PATRON_MIN && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => entregar(trazo)}
              className="h-9 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white disabled:opacity-50"
            >
              Usar este patrón
            </button>
          )}
        </div>
      )}
    </div>
  );
}
