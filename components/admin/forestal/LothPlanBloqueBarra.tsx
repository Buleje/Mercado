/**
 * Las piezas de dibujo de «Por bloque o zona» (Brandon 26-10): la insignia del
 * bloque con su tono, la barra apilada autorizado = usado + preliminar + saldo
 * (+ lo que se pasa, en rojo y pasado el tope), su leyenda ÚNICA de arriba y
 * las cifras en una línea con la misma muestra de color que su tramo.
 *
 * Sólo tokens del DS: el tono del bloque llega como `var(--data-*)` (ver
 * `loth-plan-bloque-visual.ts`) y se usa por la variable `--bloque`.
 */

import type { CSSProperties, ReactNode } from "react";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { TramosDeBarra } from "./loth-plan-bloque-visual";

const NUM = "font-mono tabular-nums";

/** El tono del bloque como variable CSS: lo leen la insignia, la franja y el tramo «usado». */
export const varDeTono = (tono: string): CSSProperties => ({ ["--bloque" as string]: tono }) as CSSProperties;

/** Rayado del preliminar: se distingue del usado aun sin ver el color. */
const RAYADO_PRELIMINAR =
  "repeating-linear-gradient(135deg, var(--data-warning-500) 0 4px, color-mix(in oklab, var(--data-warning-500) 40%, transparent) 4px 8px)";
const FONDO_USADO = "var(--bloque, var(--text-secondary))";
const FONDO_PASA = "var(--data-error-500)";
const FONDO_LIBRE = "color-mix(in oklab, var(--text-primary) 9%, transparent)";

/** La insignia: el número (o las iniciales) del bloque en un cuadro de su tono. Sólido y oscurecido: letra clara en los dos temas. */
export function InsigniaDelBloque({ texto, tono, grande = false, className = "" }: { texto: string; tono: string; grande?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ ...varDeTono(tono), background: "color-mix(in oklab, var(--bloque) 72%, black)" }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-bold leading-none text-[var(--text-inverse)] shadow-[var(--shadow-sm)] dark:text-[var(--text-primary)] ${
        grande ? "h-11 min-w-11 px-1.5 text-lg" : "h-7 min-w-7 px-1 text-sm"
      } ${className}`}
    >
      {texto}
    </span>
  );
}

/** La insignia de «Sin bloque asignado»: gris, punteada, con «?». */
export function InsigniaSinBloque() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-[var(--rule-strong)] text-lg font-bold leading-none text-[var(--text-tertiary)]"
    >
      ?
    </span>
  );
}

/**
 * La barra: usado (tono del bloque) · preliminar (rayado coral) · saldo libre
 * (vacío) · y, si se pasa, el tramo rojo después de una raya en el tope.
 */
export function BarraDeTramos({ t, etiqueta, alto = "h-3" }: { t: TramosDeBarra; etiqueta: string; alto?: string }) {
  const tramos: { k: string; v: number; fondo: string }[] = [
    { k: "usado", v: t.usado, fondo: FONDO_USADO },
    { k: "preliminar", v: t.preliminar, fondo: RAYADO_PRELIMINAR },
    { k: "libre", v: t.libre, fondo: FONDO_LIBRE },
    { k: "pasa", v: t.pasa, fondo: FONDO_PASA },
  ];
  return (
    <div role="img" aria-label={etiqueta} className={`relative ${alto}`}>
      <div className="flex h-full w-full gap-px overflow-hidden rounded-full" style={{ background: FONDO_LIBRE }}>
        {tramos.map((x) =>
          /* Crece en proporción a sus m³ (no `width: %`): así la raya de 1 px entre tramos no empuja el último fuera. */
          x.v > 0 ? <span key={x.k} data-tramo={x.k} className="h-full min-w-0.5" style={{ flex: `${x.v} 1 0%`, background: x.fondo }} /> : null,
        )}
      </div>
      {t.pasa > 0 && (
        /* El tope: hasta acá llega lo autorizado. */
        <span
          aria-hidden="true"
          data-tope
          className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-[var(--text-primary)]"
          style={{ left: `${t.tope * 100}%` }}
        />
      )}
    </div>
  );
}

/** La muestra de color de un tramo (la misma en la leyenda y en las cifras). */
export function Muestra({ tramo, tonos }: { tramo: "usado" | "preliminar" | "libre" | "pasa"; tonos?: readonly string[] }) {
  const fondo =
    tramo === "usado"
      ? tonos && tonos.length > 1
        ? `linear-gradient(90deg, ${tonos.map((c, i) => `${c} ${(i / tonos.length) * 100}% ${((i + 1) / tonos.length) * 100}%`).join(", ")})`
        : (tonos?.[0] ?? FONDO_USADO)
      : tramo === "preliminar"
        ? RAYADO_PRELIMINAR
        : tramo === "pasa"
          ? FONDO_PASA
          : FONDO_LIBRE;
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 w-4 shrink-0 rounded-sm ${tramo === "libre" ? "ring-1 ring-inset ring-[var(--rule-strong)]" : ""}`}
      style={{ background: fondo }}
    />
  );
}

/** La leyenda, UNA vez arriba de las tarjetas. «Usado» lleva los tonos de los bloques que hay. */
export function LeyendaDeBarras({ tonos, conPasa }: { tonos: readonly string[]; conPasa: boolean }) {
  const items: { k: "usado" | "preliminar" | "libre" | "pasa"; t: string }[] = [
    { k: "usado", t: "Usado" },
    { k: "preliminar", t: "Preliminar" },
    { k: "libre", t: "Libre" },
    ...(conPasa ? [{ k: "pasa" as const, t: "Se pasa" }] : []),
  ];
  return (
    <ul aria-label="Cómo se lee la barra" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
      {items.map((i) => (
        <li key={i.k} className="inline-flex items-center gap-1.5">
          <Muestra tramo={i.k} tonos={i.k === "usado" ? tonos : undefined} />
          {i.t}
        </li>
      ))}
      {conPasa && (
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-4 w-0.5 rounded-full bg-[var(--text-primary)]" />
          Tope del bloque
        </li>
      )}
    </ul>
  );
}

/** Una cifra con su muestra: «▮ Usado 2.761». */
export interface CifraEnLinea {
  k: string;
  t: string;
  v: number;
  tramo?: "usado" | "preliminar" | "libre" | "pasa";
  rojo?: boolean;
  fuerte?: boolean;
}

const ROJO = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

/** Lo que llena la barra: «Usado» y «Preliminar». En cero no dicen nada que la barra no diga. */
const LLENA = new Set<CifraEnLinea["tramo"]>(["usado", "preliminar"]);
const esCero = (v: number) => Math.abs(v) < 0.0005;

/**
 * Las cifras de una barra en una línea que se parte sola (a 400 px baja a dos).
 * Sin nada usado ni preliminar, la línea entera sobra («Libre 30 de 30» y la
 * barra vacía ya lo dicen: siete especies en cero eran siete «Usado 0.000 ·
 * Preliminar 0.000»); con algo, se dice sólo lo que no es cero.
 */
export function CifrasEnLinea({ items, tono, extra }: { items: readonly CifraEnLinea[]; tono?: string; extra?: ReactNode }) {
  const llenan = items.filter((i) => LLENA.has(i.tramo));
  if (llenan.length > 0 && llenan.every((i) => esCero(i.v)) && !extra) return null;
  const visibles = items.filter((i) => !(LLENA.has(i.tramo) && esCero(i.v)));
  return (
    <dl className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm" style={tono ? varDeTono(tono) : undefined}>
      {visibles.map((i) => (
        <div key={i.k} className="inline-flex items-baseline gap-1.5">
          {i.tramo && (
            <span className="self-center">
              <Muestra tramo={i.tramo} />
            </span>
          )}
          <dt className="text-[var(--text-tertiary)]">{i.t}</dt>
          <dd className={`${NUM} ${i.fuerte ? "font-bold" : "font-medium"} ${i.rojo ? ROJO : "text-[var(--text-primary)]"}`}>{fmtM3(i.v)}</dd>
        </div>
      ))}
      {extra}
    </dl>
  );
}

/** Una cifra grande de la cabecera (m³ autorizados, hectáreas, disponible). El fondo toma el tono del bloque (`--bloque`). */
export function CifraGrande({ t, v, unidad, rojo = false, testid, nota }: { t: string; v: string; unidad: string; rojo?: boolean; testid?: string; nota?: string }) {
  return (
    <div data-testid={testid} className="min-w-0 rounded-lg px-2.5 py-2" style={{ background: "color-mix(in oklab, var(--bloque) 9%, var(--surface-canvas))" }}>
      <dt className="text-xs font-medium text-[var(--text-tertiary)]">{t}</dt>
      <dd className={`${NUM} text-xl font-bold leading-tight ${rojo ? ROJO : "text-[var(--text-primary)]"}`}>
        {v} <span className={`text-sm font-medium ${rojo ? "" : "text-[var(--text-secondary)]"}`}>{unidad}</span>
      </dd>
      {nota && <dd className={`truncate text-xs font-semibold ${ROJO}`}>{nota}</dd>}
    </div>
  );
}
