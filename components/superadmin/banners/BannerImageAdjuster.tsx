"use client";

/**
 * BannerImageAdjuster — controles de encuadre de la imagen del banner.
 *
 * Combina 3 mecanismos para ajustar `imageAdjust`:
 *  1. Drag-to-pan: el usuario arrastra el preview con el mouse/dedo y mueve
 *     la imagen dentro del slot (cambia position.x|y).
 *  2. Botones laterales (8 direcciones + zoom): incrementos finos de 5%.
 *  3. Slider de zoom (50–200%) y switch fit cover/contain.
 *
 * El componente es controlado: recibe `value` y emite `onChange(next)`. El
 * preview en sí se renderiza por el caller (típicamente el renderer real),
 * para garantizar que lo que se ve mientras se ajusta = lo que se publicará.
 */

import { useCallback, useRef, useState } from "react";
import {
  Maximize2,
  Minimize2,
  Target,
  RotateCcw,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { ImageAdjust } from "@/lib/promo-banners";

const DEFAULT: ImageAdjust = {
  position: { x: 50, y: 50 },
  scale: 100,
  fit: "cover",
};

const NUDGE_PCT = 5;
const ZOOM_STEP = 10;
const ZOOM_MIN = 50;
const ZOOM_MAX = 250;

interface Props {
  value: ImageAdjust | undefined;
  onChange: (next: ImageAdjust) => void;
  /** El nodo del preview encima del cual se hace drag. Recibe pointerdown del padre. */
  previewRef?: React.RefObject<HTMLElement | null>;
  /** Si false oculta los botones laterales (modo compacto). */
  showSideButtons?: boolean;
  className?: string;
}

export default function BannerImageAdjuster({
  value,
  onChange,
  previewRef,
  showSideButtons = true,
  className,
}: Props) {
  const adj = value ?? DEFAULT;

  // ── Drag state ─────────────────────────────────────────────────────────────
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
    rect: DOMRect;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const node = previewRef?.current;
      if (!node) return;
      node.setPointerCapture(e.pointerId);
      const rect = node.getBoundingClientRect();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPos: { ...adj.position },
        rect,
      };
      setDragging(true);
    },
    [adj.position, previewRef],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      const { startX, startY, startPos, rect } = dragRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      // Inversión: arrastrar a la derecha → la imagen se mueve a la derecha,
      // entonces position.x baja (el "anchor" se mueve a la izquierda).
      const nextX = clamp(startPos.x - (dx / rect.width) * 100, 0, 100);
      const nextY = clamp(startPos.y - (dy / rect.height) * 100, 0, 100);
      onChange({ ...adj, position: { x: round(nextX), y: round(nextY) } });
    },
    [adj, onChange],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // ── Operations ─────────────────────────────────────────────────────────────
  const nudge = (dx: number, dy: number) => {
    onChange({
      ...adj,
      position: {
        x: clamp(adj.position.x + dx, 0, 100),
        y: clamp(adj.position.y + dy, 0, 100),
      },
    });
  };

  const setScale = (next: number) => {
    onChange({ ...adj, scale: clamp(next, ZOOM_MIN, ZOOM_MAX) });
  };

  const reset = () => onChange(DEFAULT);

  // ── Wire pointer handlers cuando hay previewRef ────────────────────────────
  // Usado por el caller via {...adjusterPointerProps}.
  const pointerProps = previewRef
    ? {
        onPointerDown,
        onPointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onPointerLeave: endDrag,
      }
    : {};

  return (
    <div className={cn("space-y-3", className)}>
      {/* ── Header con resumen ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <ImageIcon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">Encuadre de la imagen</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-tight tabular-nums">
              X {adj.position.x}% · Y {adj.position.y}% · Zoom {adj.scale}% · {adj.fit === "cover" ? "Llenar" : "Contener"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-colors"
          title="Restablecer encuadre"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {/* ── Botones de nudge en grid 3x3 ───────────────────────────────── */}
      {showSideButtons && (
        <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Posición fina
          </p>
          <div className="grid grid-cols-3 gap-1.5 max-w-[180px] mx-auto">
            <NudgeBtn label="↖" onClick={() => nudge(-NUDGE_PCT, -NUDGE_PCT)} />
            <NudgeBtn icon={<ChevronUp className="h-3.5 w-3.5" />} onClick={() => nudge(0, -NUDGE_PCT)} title="Subir" />
            <NudgeBtn label="↗" onClick={() => nudge(NUDGE_PCT, -NUDGE_PCT)} />
            <NudgeBtn icon={<ChevronLeft className="h-3.5 w-3.5" />} onClick={() => nudge(-NUDGE_PCT, 0)} title="Izquierda" />
            <NudgeBtn icon={<Target className="h-3.5 w-3.5" />} onClick={() => onChange({ ...adj, position: { x: 50, y: 50 } })} title="Centrar" />
            <NudgeBtn icon={<ChevronRight className="h-3.5 w-3.5" />} onClick={() => nudge(NUDGE_PCT, 0)} title="Derecha" />
            <NudgeBtn label="↙" onClick={() => nudge(-NUDGE_PCT, NUDGE_PCT)} />
            <NudgeBtn icon={<ChevronDown className="h-3.5 w-3.5" />} onClick={() => nudge(0, NUDGE_PCT)} title="Bajar" />
            <NudgeBtn label="↘" onClick={() => nudge(NUDGE_PCT, NUDGE_PCT)} />
          </div>
        </div>
      )}

      {/* ── Zoom slider + botones ─────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            Zoom
          </p>
          <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums">{adj.scale}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScale(adj.scale - ZOOM_STEP)}
            disabled={adj.scale <= ZOOM_MIN}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Reducir"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={5}
            value={adj.scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="flex-1 accent-[var(--accent)]"
            aria-label="Zoom de la imagen"
          />
          <button
            type="button"
            onClick={() => setScale(adj.scale + ZOOM_STEP)}
            disabled={adj.scale >= ZOOM_MAX}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Ampliar"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Fit toggle ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          Modo de ajuste
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <FitBtn
            active={adj.fit === "cover"}
            onClick={() => onChange({ ...adj, fit: "cover" })}
            label="Llenar"
            hint="Recorta para cubrir todo el espacio"
          />
          <FitBtn
            active={adj.fit === "contain"}
            onClick={() => onChange({ ...adj, fit: "contain" })}
            label="Contener"
            hint="Muestra la imagen entera (puede haber franjas)"
          />
        </div>
      </div>

      {dragging && (
        <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] text-center">
          Arrastrando — soltá para fijar la posición
        </p>
      )}

      {/* Spread these on the preview node so drag funciona allí */}
      <DragSpreader pointerProps={pointerProps} previewRef={previewRef} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round(v: number): number {
  return Math.round(v * 10) / 10;
}

function NudgeBtn({
  icon,
  label,
  onClick,
  title,
}: {
  icon?: React.ReactNode;
  label?: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 active:scale-95 transition-all"
    >
      {icon ?? <span className="text-base font-bold leading-none">{label}</span>}
    </button>
  );
}

function FitBtn({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border-2 px-3 py-2 text-left transition-all",
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40",
      )}
    >
      <p className={cn("text-xs font-extrabold", active ? "text-[var(--accent)]" : "text-[var(--text-primary)]")}>
        {label}
      </p>
      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-snug mt-0.5">{hint}</p>
    </button>
  );
}

/** Imperative side-effect helper: registra los pointer handlers en el ref del caller. */
function DragSpreader({
  pointerProps,
  previewRef,
}: {
  pointerProps: Record<string, ((e: React.PointerEvent<HTMLElement>) => void) | undefined>;
  previewRef?: React.RefObject<HTMLElement | null>;
}) {
  // No JSX: lo importante es que el caller lea las props vía useEffect en el ref.
  // En la práctica el caller debe usar BannerPreviewWithDrag (abajo) que ya integra
  // el ref + handlers.
  if (!previewRef) return null;
  // Ver hook useDragHandlers exportado abajo si querés cablear vos mismo.
  return null;
}

/** Hook auxiliar — devuelve handlers pointer y el estado de drag. */
export function useImageAdjustDrag(
  value: ImageAdjust | undefined,
  onChange: (next: ImageAdjust) => void,
  previewRef: React.RefObject<HTMLElement | null>,
) {
  const adj = value ?? DEFAULT;
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
    rect: DOMRect;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const node = previewRef.current;
    if (!node) return;
    node.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPos: { ...adj.position },
      rect: node.getBoundingClientRect(),
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    const { startX, startY, startPos, rect } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nextX = clamp(startPos.x - (dx / rect.width) * 100, 0, 100);
    const nextY = clamp(startPos.y - (dy / rect.height) * 100, 0, 100);
    onChange({ ...adj, position: { x: round(nextX), y: round(nextY) } });
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return {
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onPointerLeave: endDrag,
    },
  };
}
