"use client";

import { useRef, useState } from "react";
import { moverTirador, tiradores, type Cuadrilatero as Quad } from "@/lib/documentos/escaner/geometria";

/**
 * Recorte tipo CamScanner: la foto con un cuadrilátero y 8 tiradores (4
 * esquinas + 4 medios de lado = «3 arriba, 3 abajo, 2 a los costados») que se
 * arrastran con mouse o con el dedo. Coordenadas normalizadas 0..1.
 */
export function Cuadrilatero({
  src,
  ancho,
  alto,
  quad,
  onCambio,
}: {
  src: string;
  ancho: number;
  alto: number;
  quad: Quad;
  onCambio: (q: Quad) => void;
}) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);

  const puntos = tiradores(quad);
  const poligono = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");

  const normalizar = (clientX: number, clientY: number) => {
    const r = cajaRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  };

  const alMover = (e: React.PointerEvent) => {
    if (arrastrando === null) return;
    const pos = normalizar(e.clientX, e.clientY);
    if (pos) onCambio(moverTirador(quad, arrastrando, pos));
  };

  return (
    <div
      ref={cajaRef}
      className="relative mx-auto max-h-[52vh] w-full touch-none select-none overflow-hidden rounded-xl bg-[var(--surface-sunken)]"
      style={{ aspectRatio: `${ancho} / ${alto}` }}
      onPointerMove={alMover}
      onPointerUp={() => setArrastrando(null)}
      onPointerCancel={() => setArrastrando(null)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Página a recortar" className="pointer-events-none h-full w-full object-contain" draggable={false} />

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <polygon
          points={poligono}
          fill="var(--accent-muted)"
          stroke="var(--accent)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {puntos.map((p, i) => {
        const esEsquina = i < 4;
        return (
          <button
            key={i}
            type="button"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setArrastrando(i);
            }}
            className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, touchAction: "none" }}
            aria-label={esEsquina ? `Esquina ${i + 1}` : `Lado ${i - 3}`}
          >
            <span
              className={`block rounded-full border-2 border-white bg-[var(--accent)] shadow-md ${
                esEsquina ? "h-5 w-5" : "h-4 w-4"
              } ${arrastrando === i ? "ring-2 ring-[var(--accent-glow)]" : ""}`}
            />
          </button>
        );
      })}
    </div>
  );
}
