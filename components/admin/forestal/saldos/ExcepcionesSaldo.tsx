"use client";

/**
 * ExcepcionesSaldo — todo lo que está mal, en un solo lugar y con nombre propio.
 *
 * Antes había un banner rojo arriba («1 especie tiene saldo negativo»), la misma
 * noticia otra vez a media página con otras palabras, y el stock de producto en
 * negativo sin aviso ninguno — sólo un número rojo en la fila 8 de una tabla.
 *
 * Dos decisiones que definen esta tarjeta:
 *  · **Dice CUÁL.** Un aviso que obliga a recorrer la tabla para saber qué
 *    especie está en rojo da trabajo en vez de ahorrarlo.
 *  · **Lleva a arreglarlo.** Cada excepción sabe en qué pestaña se corrige, así
 *    que el botón va acá y no en la cabeza del operador.
 *
 * Cuando no hay nada que avisar NO se dibuja un cartel verde de felicitación: se
 * dice en una línea y se sigue. El espacio es para los problemas.
 */

import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, AlertCircle, ArrowRight, CheckCircle2, Info } from "@buleje/design-system/icons";
import { nombresVisibles, type Excepcion, type TonoExcepcion } from "@/lib/forestal/ctp-saldos-excepciones";

/**
 * Cada tono con su ícono además del color: en dark el rojo y el ámbar se
 * acercan, y el ícono sigue distinguiéndolos sin depender de la vista.
 */
const TONO = {
  error: {
    Icono: AlertCircle,
    caja: "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-transparent",
    texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    chip: "bg-[var(--data-error-500)]",
  },
  warning: {
    Icono: AlertTriangle,
    caja: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-transparent",
    texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    chip: "bg-[var(--data-warning-500)]",
  },
  info: {
    Icono: Info,
    caja: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
    texto: "text-[var(--text-secondary)]",
    chip: "bg-[var(--data-info-500)]",
  },
} as const satisfies Record<TonoExcepcion, unknown>;

const DESTINO: Record<NonNullable<Excepcion["ir"]>, string> = {
  ingresos: "Ir a Ingresos",
  produccion: "Ir a Producción",
  despacho: "Ir a Despacho",
};

export default function ExcepcionesSaldo({
  excepciones,
  onIr,
}: {
  excepciones: readonly Excepcion[];
  /** Navega a la pestaña donde se corrige. Sin handler, el botón no se dibuja. */
  onIr?: (vista: NonNullable<Excepcion["ir"]>) => void;
}) {
  if (excepciones.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        Las existencias cuadran: sin saldos negativos, sin volumen sin validar y sin especies por agotarse.
      </p>
    );
  }

  const graves = excepciones.filter((e) => e.tono === "error").length;

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]" aria-label="Qué revisar">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Qué revisar ({excepciones.length})
        </CardTitle>
        <p className="text-xs text-[var(--text-tertiary)]">
          {graves > 0
            ? `${graves} ${graves === 1 ? "impide" : "impiden"} que el libro cuadre ante SERFOR.`
            : "Nada bloquea el cierre; son avisos para planificar."}
        </p>
      </div>

      <ul className="divide-y divide-[var(--rule-soft)]">
        {excepciones.map((e) => {
          const t = TONO[e.tono];
          const { visibles, resto } = nombresVisibles(e.items);
          return (
            <li key={e.clave} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <t.Icono className={`mt-0.5 h-5 w-5 shrink-0 ${t.texto}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${t.texto}`}>{e.titulo}</p>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{e.detalle}</p>
                {visibles.length > 0 && (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {visibles.map((nombre) => (
                      <li
                        key={nombre}
                        className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--text-primary)]"
                      >
                        {nombre}
                      </li>
                    ))}
                    {/* Lo que no entra se DICE. Cortar la lista en silencio hace
                        creer que el problema es más chico de lo que es. */}
                    {resto > 0 && (
                      <li className="px-1 py-0.5 text-xs text-[var(--text-tertiary)]">y {resto} más</li>
                    )}
                  </ul>
                )}
              </div>
              {e.ir && onIr && (
                <button
                  type="button"
                  onClick={() => onIr(e.ir!)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary hover:bg-primary/10"
                >
                  {DESTINO[e.ir]} <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
