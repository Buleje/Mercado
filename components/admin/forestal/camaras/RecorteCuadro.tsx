"use client";

/**
 * Marcar sobre el último cuadro del puente qué parte es la cámara.
 *
 * La captura de BlueStacks trae la app entera: la barra de Hik-Connect, los
 * botones de abajo, y a veces la vista de 4 cámaras. Lo que la IA tiene que
 * leer es sólo el video. Se arrastra un rectángulo sobre la imagen (o se toca
 * un cuadrante, que también sirve con el teclado) y el servidor recorta así
 * cada cuadro antes de compararlo y guardarlo.
 *
 * La imagen se pide cada 4 s: lo justo para ver si el recorte sigue cayendo
 * sobre la cámara, sin bajar un cuadro por segundo mientras se configura.
 *
 * El cuadro llega YA recortado con lo guardado (`base`): lo que se marca acá
 * recorta ESE cuadro y se lleva a la captura entera con `componerRecorte`.
 */

import { useRef, useState, type PointerEvent } from "react";
import { Crop, Loader2, Maximize } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  componerRecorte,
  CUADRANTES,
  estiloRecorte,
  fraccionEnCaja,
  mismoRecorte,
  recorteDeArrastre,
  relativoA,
  tamanoRecorte,
  textoSenal,
  type Recorte,
} from "./puente-pc";
import { useCuadroPuente } from "./use-puente-pc";

const BOTON =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]";
const BOTON_ACTIVO = "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]";

interface Props {
  camaraId: string;
  /** El recorte guardado: el que el servidor ya aplicó al cuadro que se ve. */
  base: Recorte | null;
  /** El que se va a guardar, en fracciones de la captura entera. */
  recorte: Recorte | null;
  onCambiar: (recorte: Recorte | null) => void;
}

export default function RecorteCuadro({ camaraId, base, recorte, onCambiar }: Props) {
  const cuadro = useCuadroPuente(camaraId, { activo: true, modo: "imagen", ritmoMs: 4000 });
  const imgRef = useRef<HTMLImageElement>(null);
  const [tam, setTam] = useState<{ ancho: number; alto: number } | null>(null);
  const [arrastre, setArrastre] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  /* La esquina de inicio va en un ref: un arrastre muy rápido (o un toque)
     llega al `pointerup` antes de que React pinte el `pointerdown`, y con el
     estado solo, el recorte se perdía. */
  const inicioRef = useRef<{ x: number; y: number } | null>(null);

  const punto = (e: PointerEvent<HTMLDivElement>) => {
    const caja = (imgRef.current ?? e.currentTarget).getBoundingClientRect();
    return fraccionEnCaja(e.clientX, e.clientY, caja);
  };

  const alBajar = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Sin captura (puntero sintético o ya soltado) el arrastre igual anda dentro de la caja. */
    }
    const p = punto(e);
    inicioRef.current = p;
    setArrastre({ a: p, b: p });
  };
  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const a = inicioRef.current;
    if (a) setArrastre({ a, b: punto(e) });
  };
  const alSoltar = (e: PointerEvent<HTMLDivElement>) => {
    const a = inicioRef.current;
    if (!a) return;
    inicioRef.current = null;
    const r = recorteDeArrastre(a, punto(e));
    setArrastre(null);
    if (r) onCambiar(componerRecorte(base, r));
  };

  /* El recorte a guardar, visto sobre el cuadro que llega (ya recortado con `base`). */
  const rel = relativoA(base, recorte);
  /* Mientras se arrastra se ve el rectángulo que se está armando; si no, el elegido. */
  const visible = arrastre ? recorteDeArrastre(arrastre.a, arrastre.b, 0) : rel;
  const cambiado = !mismoRecorte(recorte, base);

  return (
    <div className="space-y-2">
      <div className="flex justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
        <div
          role="presentation"
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={() => {
            inicioRef.current = null;
            setArrastre(null);
          }}
          className={cn(
            "relative max-w-full cursor-crosshair touch-none select-none overflow-hidden rounded-lg",
            cuadro.src ? "inline-block" : "aspect-video w-full",
          )}
        >
          {cuadro.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- cuadro en vivo del puente (blob local), tamaño desconocido
            <img
              ref={imgRef}
              src={cuadro.src}
              alt="Último cuadro que mandó la PC"
              draggable={false}
              onLoad={(e) => setTam({ ancho: e.currentTarget.naturalWidth, alto: e.currentTarget.naturalHeight })}
              className="block max-h-[50vh] max-w-full"
            />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center gap-2 px-4 text-center text-sm text-[var(--text-tertiary)]">
              {cuadro.senal === "esperando" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando el último cuadro…
                </>
              ) : (
                "Arranca el script en la PC: el primer cuadro aparece acá para recortarlo."
              )}
            </p>
          )}
          {visible && (
            <span
              aria-hidden
              style={estiloRecorte(visible)}
              className="pointer-events-none absolute rounded-sm border-2 border-[var(--accent)] shadow-[0_0_0_9999px_rgb(0_0_0/0.5)]"
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-auto inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]" aria-live="polite">
          <Crop className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          {recorte
            ? `Recorte ${tam && rel ? tamanoRecorte(rel, tam.ancho, tam.alto) : "marcado"}`
            : "Toda la imagen"}
          {cambiado && <span className="font-normal text-[var(--text-tertiary)]">(se aplica al guardar)</span>}
          {cuadro.src && <span className="font-normal text-[var(--text-tertiary)]">· {textoSenal(cuadro.senal, cuadro.edadMs)}</span>}
        </span>
        {CUADRANTES.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onCambiar(componerRecorte(base, q.recorte))}
            aria-pressed={mismoRecorte(rel, q.recorte)}
            className={cn(BOTON, mismoRecorte(rel, q.recorte) && BOTON_ACTIVO)}
          >
            {q.etiqueta}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onCambiar(null)}
          aria-pressed={!recorte}
          className={cn(BOTON, !recorte && BOTON_ACTIVO)}
        >
          <Maximize className="h-3.5 w-3.5" aria-hidden /> Toda la imagen
        </button>
      </div>
      {base && (
        <p className="text-xs text-[var(--text-tertiary)]">
          {recorte
            ? "El cuadro ya llega recortado: lo que marques recorta un poco más."
            : "Al guardar, los próximos cuadros llegan completos para marcar de nuevo."}
        </p>
      )}
    </div>
  );
}
