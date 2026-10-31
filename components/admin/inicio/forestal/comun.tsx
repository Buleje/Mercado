"use client";

import type { ReactNode } from "react";
import { m, useReducedMotion } from "framer-motion";
import { DURATION, EASE } from "@/components/ui-system/motion";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Piezas chicas del tablero forestal del Inicio (2026-10-31): rutas, formato y
 * la barra que crece. Sin cifras propias: todo lo que se dibuja llega armado
 * de `GET /api/admin/inicio/forestal`.
 */

export const CTP = "/admin?tab=ctp-libro-operaciones";
export const LOTH = "/admin?tab=loth-libro-operaciones";

export const m3 = (n: number) => `${formatNumber(n, 2)} m³`;
export const plural = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;

/**
 * El camino de la madera, en los colores del Libro CTP (`.charts-forestal`,
 * fijados en claro y en oscuro): entra = pizarra, a la sierra = azul, se
 * produce = turquesa, sale = coral. No rotan con la posición de la tarjeta.
 */
export const TINTA = {
  entra: "var(--section-primary)",
  sierra: "var(--section-info)",
  producto: "var(--section-accent)",
  sale: "var(--section-amber)",
} as const;

/** Rampa de un solo tono (mayor → menor) para repartir el patio por especie. */
export const RAMPA_PATIO = [1, 2, 3, 4, 5, 6].map((i) => `var(--forestal-slice-${i})`);

/**
 * Una barra horizontal que crece desde la izquierda al aparecer (con
 * «reducir movimiento», ya dibujada). `marca` = una raya vertical (p. ej. el
 * tiempo corrido del permiso) sobre la misma pista.
 */
export function BarraCrece({
  pct,
  color,
  alto = "h-2.5",
  retraso = 0,
  marca,
  className,
}: {
  pct: number;
  color: string;
  alto?: string;
  retraso?: number;
  marca?: number | null;
  className?: string;
}) {
  const quieto = useReducedMotion();
  const ancho = Math.min(100, Math.max(0, pct));
  return (
    <div
      className={cn("relative overflow-hidden rounded-[var(--radius-xs)] bg-[var(--surface-sunken)]", alto, className)}
      aria-hidden
    >
      <m.div
        className="h-full origin-left rounded-[var(--radius-xs)]"
        style={{ width: `${ancho}%`, background: color }}
        initial={quieto ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: DURATION.deliberate, ease: EASE.editorial, delay: retraso }}
      />
      {marca != null && (
        <span
          className="absolute inset-y-0 w-0.5 bg-[var(--text-primary)]"
          style={{ left: `calc(${Math.min(100, Math.max(0, marca))}% - 1px)` }}
        />
      )}
    </div>
  );
}

/** Punto de color + texto, para las leyendas en línea. */
export function PuntoLeyenda({ color, texto, detalle }: { color: string; texto: string; detalle?: string }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="font-bold text-[var(--text-primary)]">{texto}</span>
      {detalle && <span className="text-[var(--text-tertiary)]">{detalle}</span>}
    </li>
  );
}

/**
 * Anillo de avance (el % talado de un permiso): la pista en el color de las
 * reglas y el arco en `color`, que se dibuja al aparecer. Lo de adentro
 * (`children`) es el texto; el anillo es decorado (el número va en el texto).
 */
export function Anillo({ pct, color, children }: { pct: number; color: string; children: ReactNode }) {
  const quieto = useReducedMotion();
  const valor = Math.min(100, Math.max(0, pct));
  // r = 100 / 2π: la circunferencia mide 100 y el `dashoffset` es el % que falta.
  const r = 15.9155;
  return (
    <div className="relative grid size-[4.75rem] shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" style={{ stroke: "var(--rule-base)" }} />
        {valor > 0 && (
          <m.circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="100 100"
            style={{ stroke: color }}
            initial={quieto ? false : { strokeDashoffset: 100 }}
            animate={{ strokeDashoffset: 100 - valor }}
            transition={{ duration: DURATION.theatrical, ease: EASE.editorial }}
          />
        )}
      </svg>
      <span className="relative text-center leading-tight">{children}</span>
    </div>
  );
}

/** El tono de `estadoVigencia` (el de la cabecera del plan en el Libro TH), en texto AA y punto. */
export const TONO_VIGENCIA = {
  ok: { texto: "text-[var(--data-success-ink)]", punto: "var(--data-success-500)" },
  warn: { texto: "text-[var(--data-warning-ink)]", punto: "var(--data-warning-500)" },
  danger: { texto: "text-[var(--data-error-ink)]", punto: "var(--data-error-500)" },
  neutral: { texto: "text-[var(--text-secondary)]", punto: "var(--text-tertiary)" },
} as const;
