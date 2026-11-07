"use client";

/**
 * Las piezas sueltas de la Historia del lote: los cuatro pasos del recorrido
 * (tarjetas del panel plegable), el pie del rendimiento contra el referencial
 * SERFOR y las frases de cuánto tardó entre etapa y etapa. Salieron de
 * `CtpHistoriaLoteView` (compactación 17-10) para que la vista no pase de 300
 * líneas; sólo las usa ella.
 */

import type { ReactNode } from "react";
import type { useHistoriaLote } from "@/hooks/use-historia-lote";
import { evaluarRendimiento } from "@/lib/forestal/ctp-rendimiento";
import { COLOR_ETAPA } from "./EtapasDelLote";

/** Cada etapa del recorrido como tarjeta suelta del panel plegable. */
export function PasoTarjeta({ children }: { children: ReactNode }) {
  return <dl className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">{children}</dl>;
}

/**
 * Un paso del recorrido. Lleva el MISMO color que su etapa de abajo: la tira de
 * arriba y la línea de tiempo son dos vistas de lo mismo, y sin el color
 * compartido hay que leer las dos para saber cuál corresponde a cuál.
 */
export function Paso({ n, termino, valor, pie }: { n: 1 | 2 | 3 | 4; termino: string; valor: string; pie: string }) {
  return (
    <div className="border-t border-[var(--rule-soft)] px-4 py-3 first:border-t-0 sm:border-t-0">
      <dt className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_ETAPA[n] }} aria-hidden />
        {termino}
      </dt>
      <dd className="font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</dd>
      <p className="text-xs text-[var(--text-tertiary)]">{pie}</p>
    </div>
  );
}

/**
 * El pie del rendimiento, contra el referencial SERFOR del producto.
 *
 * Un 47 % suelto no dice nada: contra el referencial de la madera aserrada dice
 * si la sierra anduvo bien o si alguien declaró de más. Se usa `evaluarRendimiento`,
 * el mismo que ya juzga las corridas en Producción y en el score — no una
 * segunda regla que se desincronice.
 */
export function pieRendimiento(h: NonNullable<ReturnType<typeof useHistoriaLote>["historia"]>): string {
  const pct = h.produccion.rendimientoPct;
  if (pct == null) return "sin rendimiento que calcular";
  const producto = h.produccion.corridas.find((c) => c.producto)?.producto ?? null;
  const { estado, ref } = evaluarRendimiento(producto, pct);
  const base = `${Number(pct).toFixed(2)} % de rendimiento`;
  if (ref == null) return `${base} · sin referencial para este producto`;
  return estado === "alto"
    ? `${base} · SOBRE el referencial SERFOR (${ref} %)`
    : `${base} · referencial SERFOR ${ref} %`;
}

/** Las frases de tiempo que SÍ tienen dato, en orden del flujo. */
export function frasesDeTiempo(t: { esperaEnPatio: number | null; hastaLaSalida: number | null; edad: number | null }) {
  return [
    t.esperaEnPatio != null && {
      clave: "espera",
      antes: "Esperó ",
      dias: t.esperaEnPatio,
      despues: " en el patio antes de la sierra",
    },
    t.hastaLaSalida != null && { clave: "salida", antes: "Tardó ", dias: t.hastaLaSalida, despues: " en salir" },
    t.edad != null && {
      clave: "edad",
      antes: "Lleva ",
      dias: t.edad,
      despues: " desde que se armó, con madera todavía adentro",
    },
  ].filter((x): x is { clave: string; antes: string; dias: number; despues: string } => Boolean(x));
}
