"use client";

/**
 * resumen-vistas — las piezas visuales de la pestaña Resúmenes: la barra de
 * composición y la lectura del lote.
 *
 * Por qué una barra y no un chart: la pregunta es "¿en qué se me fue el
 * volumen?", y para eso una barra apilada con los 4-6 grupos que importan se
 * lee de un vistazo, imprime bien y no arrastra una librería.
 */
import type { GrupoResumen } from "@/lib/forestal/cubicacion-resumen";
import { fmtPct } from "@/lib/forestal/cubicacion-formato";
import type { Insight } from "@/lib/forestal/cubicacion-insights";
import { AlertTriangle, Lightbulb, Info } from "@buleje/design-system/icons";

/** Tonos de la barra: el DS ya define la escala de datos, se rota sobre ella. */
const TONOS = [
  "var(--accent)",
  "var(--data-info-500)",
  "var(--data-success-500)",
  "var(--data-warning-500)",
  "var(--data-error-500)",
  "var(--text-tertiary)",
];

/**
 * Composición del lote en una sola barra: cada grupo ocupa su % del pie tablar.
 * Los grupos chicos se juntan en "otros" para que la barra siga siendo legible.
 */
export function BarraComposicion({ grupos, titulo }: { grupos: GrupoResumen[]; titulo: string }) {
  const visibles = grupos.slice(0, 5);
  const resto = grupos.slice(5);
  const restoPct = resto.reduce((a, g) => a + g.pctPt, 0);
  const items = [
    ...visibles.map((g, i) => ({ label: g.label, pct: g.pctPt, tono: TONOS[i] })),
    ...(resto.length > 0 ? [{ label: `otros ${resto.length}`, pct: restoPct, tono: TONOS[5] }] : []),
  ].filter((i) => i.pct > 0);

  return (
    <div>
      <div className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{titulo}</div>
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--rule-soft)]" role="img" aria-label={items.map((i) => `${i.label} ${Math.round(i.pct)}%`).join(", ")}>
        {items.map((i) => (
          <div key={i.label} className="border-r border-[var(--surface-raised)] last:border-r-0" style={{ width: `${i.pct}%`, background: i.tono }} title={`${i.label} · ${fmtPct(i.pct)}%`} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {items.map((i) => (
          <li key={i.label} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.tono }} />
            <span className="font-bold text-[var(--text-primary)]">{i.label}</span>
            <span className="font-mono tabular-nums text-[var(--text-tertiary)]">{fmtPct(i.pct)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ICONO = { alerta: AlertTriangle, oportunidad: Lightbulb, info: Info } as const;
const TONO_CLS = {
  alerta: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  // Mismo patrón anti-tint que la alerta: en dark el tint -50 se vuelve alpha del
  // -500 y el texto sube al -500. Con --accent-soft/--accent-dark medía 2,29:1.
  oportunidad: "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  info: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
} as const;

/** Lectura del lote: lo que el maderero calcularía de cabeza, con su número. */
export function LecturaDelLote({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {insights.map((i) => {
        const Icono = ICONO[i.nivel];
        return (
          <li key={i.texto} className={`flex items-start gap-2 rounded-xl border-2 px-3 py-2 ${TONO_CLS[i.nivel]}`}>
            <Icono className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-snug">{i.texto}</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums opacity-80">{i.dato}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
