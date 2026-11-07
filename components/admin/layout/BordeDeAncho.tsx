"use client";

/**
 * El borde izquierdo de una barra de la columna derecha, que se arrastra para
 * ensanchar o angostar la barra (o con ← → desde el teclado; doble clic vuelve
 * al ancho de fábrica). Lo usan el aviso de la agenda (`PanelLateralAviso`) y
 * el panel de Esenciales: los dos lo tenían que hacer igual.
 *
 * Mientras arrastras, el ancho nuevo sale por `onArrastre` (se ve al instante);
 * al soltar se guarda una sola vez con `onAncho`. Va dentro de un padre
 * `relative` (se ubica en su borde izquierdo).
 */
import { useRef, useState, type PointerEvent as EventoPuntero } from "react";
import { cn } from "@/lib/utils";

const PASO_TECLADO = 32;

interface Props {
  /** El ancho que se ve ahora, en px. */
  valor: number;
  min: number;
  max: number;
  /** Lleva un ancho pedido a lo que entra en la pantalla. */
  acotar: (px: number) => number;
  /** El ancho mientras arrastras (`null` = soltaste). */
  onArrastre: (px: number | null) => void;
  /** Guardar: px al soltar o con las flechas; `null` = el de fábrica (doble clic). */
  onAncho: (px: number | null) => void;
  etiqueta: string;
  dataQa?: string;
  className?: string;
}

export function BordeDeAncho({ valor, min, max, acotar, onArrastre, onAncho, etiqueta, dataQa, className }: Props) {
  const inicio = useRef<{ x: number; ancho: number; ultimo: number | null } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const empezar = (e: EventoPuntero<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* puntero sintético (pruebas): se arrastra igual sin captura */
    }
    inicio.current = { x: e.clientX, ancho: valor, ultimo: null };
    setArrastrando(true);
    document.body.style.userSelect = "none";
  };
  const mover = (e: EventoPuntero<HTMLDivElement>) => {
    const a = inicio.current;
    if (!a) return;
    /* El borde está a la izquierda: ir a la izquierda ensancha. */
    a.ultimo = acotar(a.ancho + (a.x - e.clientX));
    onArrastre(a.ultimo);
  };
  const soltar = () => {
    const a = inicio.current;
    if (!a) return;
    inicio.current = null;
    setArrastrando(false);
    document.body.style.userSelect = "";
    if (a.ultimo !== null) onAncho(a.ultimo);
    onArrastre(null);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={etiqueta}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={valor}
      tabIndex={0}
      data-qa={dataQa}
      title="Arrastra para cambiar el ancho · doble clic: ancho de fábrica"
      onPointerDown={empezar}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onDoubleClick={() => onAncho(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onAncho(acotar(valor + (e.key === "ArrowLeft" ? PASO_TECLADO : -PASO_TECLADO)));
      }}
      className={cn(
        "absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize touch-none",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-transparent after:transition-colors",
        "hover:after:bg-[var(--accent)] focus-visible:outline-none focus-visible:after:bg-[var(--accent)]",
        arrastrando && "after:bg-[var(--accent)]",
        className,
      )}
    />
  );
}
