"use client";

/**
 * resumen-vistas — la lectura del lote: lo que el número dice y no se ve en la
 * tabla, con su ícono y su tono.
 *
 * Acá vivía también `BarraComposicion` (las dos barras apiladas «Composición
 * por tipo / por especie» del encabezado). Se borró junto con su único uso
 * (Brandon, 2026-09-02: «quitalo porque confunde»): decían en porcentaje lo
 * mismo que la frase del hero y que la vista «Tablas».
 */
import type { Insight } from "@/lib/forestal/cubicacion-insights";
import { AlertTriangle, Lightbulb, Info } from "@buleje/design-system/icons";

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
