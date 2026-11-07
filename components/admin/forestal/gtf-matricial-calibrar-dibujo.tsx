"use client";

/**
 * Lo que se mide en «Calibrar con regla» (16-10): la hoja dibujada a ojo (no a
 * escala: a escala las cruces a 10 mm del borde no se verían) con las dos
 * cruces y sus cuatro cotas A-D desde el borde IZQUIERDO (turquesa) y el de
 * ARRIBA (coral), y el casillero grande donde se escribe cada una.
 */

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { CampoMedida } from "@/lib/forestal/gtf-matricial-calibrar";

/** Horizontal (desde la izquierda) en turquesa; vertical (desde arriba) en coral. */
const COLOR = { h: "var(--accent-ink)", v: "var(--data-warning-ink)" } as const;
export const LETRA: Record<CampoMedida, { letra: string; color: string }> = {
  "arribaIzq.x": { letra: "A", color: COLOR.h },
  "arribaIzq.y": { letra: "B", color: COLOR.v },
  "abajoDer.x": { letra: "C", color: COLOR.h },
  "abajoDer.y": { letra: "D", color: COLOR.v },
};

/* La hoja a ojo: 100 × 140 con las cruces a 30 de su esquina. Cada cota corre
   paralela a su borde, a un costado de la cruz (A y C debajo, B y D a la
   derecha), con una línea de trazos que la une al centro: así las cuatro
   letras no se pisan. */
const W = 100;
const H = 140;
const M = 30;
/** Separación entre la cruz y su cota. */
const S = 12;

export function DibujoCruces() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const cruz = (x: number, y: number) => (
    <g stroke="var(--text-primary)" strokeWidth={1.4} fill="none">
      <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
      <line x1={x} y1={y - 7} x2={x} y2={y + 7} />
      <circle cx={x} cy={y} r={2.4} />
    </g>
  );
  /** Cota desde el borde (izquierdo si `eje` = h, de arriba si v) hasta la cruz en (x, y). */
  const cota = (eje: "h" | "v", x: number, y: number, campo: CampoMedida) => {
    const color = COLOR[eje];
    const marca = `url(#${id}-${eje})`;
    const linea =
      eje === "h"
        ? { x1: 1, y1: y + S, x2: x, y2: y + S, ex: { x2: x, y2: y + S }, l: { x: x / 2, y: y + S + 9 } }
        : { x1: x + S, y1: 1, x2: x + S, y2: y, ex: { x2: x + S, y2: y }, l: { x: x + S + 8, y: y / 2 } };
    return (
      <g>
        <line x1={x} y1={y} x2={linea.ex.x2} y2={linea.ex.y2} stroke={color} strokeWidth={1} strokeDasharray="2 2" />
        <line x1={linea.x1} y1={linea.y1} x2={linea.x2} y2={linea.y2} stroke={color} strokeWidth={1.6} markerStart={marca} markerEnd={marca} />
        <text x={linea.l.x} y={linea.l.y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={800} fill={color}>
          {LETRA[campo].letra}
        </text>
      </g>
    );
  };
  return (
    <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} className="mx-auto block h-auto w-full max-w-[9rem]" role="img" aria-label="Qué medir: A y C desde el borde izquierdo, B y D desde el borde de arriba, hasta el centro de cada cruz">
      <defs>
        {(["h", "v"] as const).map((k) => (
          <marker key={k} id={`${id}-${k}`} viewBox="0 0 6 6" refX={3} refY={3} markerWidth={4} markerHeight={4} orient="auto-start-reverse">
            <path d="M0,0 L6,3 L0,6 z" fill={COLOR[k]} />
          </marker>
        ))}
      </defs>
      <rect x={0} y={0} width={W} height={H} rx={2} fill="var(--surface-raised)" stroke="var(--rule-strong)" strokeWidth={1} />
      {/* Los dos bordes desde los que se mide, marcados. */}
      <line x1={0} y1={0} x2={0} y2={H} stroke={COLOR.h} strokeWidth={3.5} />
      <line x1={0} y1={0} x2={W} y2={0} stroke={COLOR.v} strokeWidth={3.5} />
      {cruz(M, M)}
      {cruz(W - M, H - M)}
      {cota("h", M, M, "arribaIzq.x")}
      {cota("v", M, M, "arribaIzq.y")}
      {cota("h", W - M, H - M, "abajoDer.x")}
      {cota("v", W - M, H - M, "abajoDer.y")}
    </svg>
  );
}

/** Un casillero de medida: grande (48 px, letra de 18), con la letra de su cota y lo que debería dar. */
export function MedidaMm({
  campo,
  label,
  value,
  onChange,
  deberia,
  invalido,
}: {
  campo: CampoMedida;
  label: string;
  value: string;
  onChange: (v: string) => void;
  deberia: string;
  invalido: boolean;
}) {
  const id = useId();
  const { letra, color } = LETRA[campo];
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] text-xs font-extrabold" style={{ color, borderColor: color }}>
          {letra}
        </span>
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <span className="relative">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={deberia}
          aria-invalid={invalido || undefined}
          data-qa={`medida-${campo}`}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-12 w-full rounded-xl border-[1.5px] bg-[var(--surface-raised)] pl-3.5 pr-11 font-mono text-lg tabular-nums text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-tertiary)] focus:ring-2 focus:ring-[var(--accent-muted)]",
            invalido ? "border-[var(--data-warning-500)] focus:border-[var(--data-warning-500)]" : "border-[var(--rule-base)] focus:border-[var(--accent)]",
          )}
        />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--text-tertiary)]">
          mm
        </span>
      </span>
    </label>
  );
}
