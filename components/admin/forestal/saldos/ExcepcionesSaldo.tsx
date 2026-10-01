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

import { useId } from "react";
import { CardTitle } from "@buleje/design-system";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Info,
} from "@buleje/design-system/icons";
import {
  nombresVisibles,
  type DestinoExcepcion,
  type Excepcion,
  type SeccionExcepcion,
  type TonoExcepcion,
} from "@/lib/forestal/ctp-saldos-excepciones";

/**
 * Cada tono con su ícono además del color: en dark el rojo y el ámbar se
 * acercan, y el ícono sigue distinguiéndolos sin depender de la vista.
 */
const TONO = {
  error: {
    Icono: AlertCircle,
    caja: "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-transparent",
    texto: "text-[var(--data-error-ink)]",
    chip: "bg-[var(--data-error-500)]",
  },
  warning: {
    Icono: AlertTriangle,
    caja: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-transparent",
    texto: "text-[var(--data-warning-ink)]",
    chip: "bg-[var(--data-warning-500)]",
  },
  info: {
    Icono: Info,
    caja: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
    texto: "text-[var(--text-secondary)]",
    chip: "bg-[var(--data-info-500)]",
  },
} as const satisfies Record<TonoExcepcion, unknown>;

const BOTON =
  "ml-auto inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary hover:bg-primary/10";

const DESTINO: Record<DestinoExcepcion, string> = {
  ingresos: "Ir a Ingresos",
  produccion: "Ir a Producción",
  despacho: "Ir a Despacho",
  lotes: "Ir a Lotes de aserrío",
  consumos: "Ir a Consumos",
  rentabilidad: "Cargar costos",
};

/** Cuando el bloque que lo explica está en esta misma pantalla. */
const EN_SECCION: Record<SeccionExcepcion, string> = {
  estado: "Ver en «Cómo está hoy»",
  capacidad: "Ver en «Qué puede salir»",
};

export default function ExcepcionesSaldo({
  excepciones,
  onIr,
  onSeccion,
}: {
  excepciones: readonly Excepcion[];
  /** Navega a la pestaña donde se corrige. Sin handler, el botón no se dibuja. */
  onIr?: (vista: DestinoExcepcion, filtro?: Excepcion["filtro"]) => void;
  /** Cambia de sección dentro de Saldos. */
  onSeccion?: (s: SeccionExcepcion) => void;
}) {
  /* Con los cuatro avisos de operación la lista llegó a ocupar la primera
     pantalla entera (5 avisos · 435 px a 1280, 24-09). Plegada muestra cada
     aviso en UNA fila —el titular con su cifra y el botón que lo corrige—; el
     detalle se abre a pedido y se recuerda. `null` = nunca se tocó: se abre
     sola sólo si hay algo que impide cuadrar ante SERFOR. */
  const [guardado, setGuardado] = useLocalStorage<boolean | null>(
    "saldos-que-revisar-abierto",
    null,
  );
  const idLista = useId();

  if (excepciones.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--data-success-ink)]">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
        Las existencias cuadran: sin saldos negativos, sin volumen sin validar, sin madera varada ni
        lotes vencidos.
      </p>
    );
  }

  const graves = excepciones.filter((e) => e.tono === "error").length;
  const abierto = guardado ?? graves > 0;

  return (
    <section
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
      aria-label="Qué revisar"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
          Qué revisar ({excepciones.length})
        </CardTitle>
        {/* En angosto la frase baja a su propio renglón: apretada entre el
            título y el botón quedaba en una columna de cuatro palabras. */}
        <p className="min-w-0 text-sm text-[var(--text-secondary)] max-sm:order-last max-sm:basis-full sm:flex-1">
          {graves > 0
            ? `${graves} ${graves === 1 ? "impide" : "impiden"} que el libro cuadre ante SERFOR.`
            : "Nada bloquea el cierre; son avisos para planificar."}
        </p>
        <button
          type="button"
          onClick={() => setGuardado(!abierto)}
          aria-expanded={abierto}
          aria-controls={idLista}
          className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
        >
          {abierto ? "Ocultar el detalle" : "Ver el detalle"}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      <ul id={idLista} className="divide-y divide-[var(--rule-soft)]">
        {excepciones.map((e) => {
          const t = TONO[e.tono];
          const { visibles, resto } = nombresVisibles(e.items);
          return (
            <li
              key={e.clave}
              className={`flex flex-wrap gap-x-3 gap-y-2 px-4 ${abierto ? "items-start py-3" : "items-center py-2"}`}
            >
              <t.Icono
                className={`h-5 w-5 shrink-0 ${abierto ? "mt-0.5" : ""} ${t.texto}`}
                aria-hidden
              />
              {/* `grow basis-56`, no `flex-1`: con base 0 el texto nunca pide
                  renglón y a 400 px quedaba en una columna de dos palabras al
                  lado del botón. Así el botón baja cuando no entran los dos. */}
              <div className="min-w-0 grow basis-56">
                <p className={`text-sm font-bold ${t.texto}`}>{e.titulo}</p>
                {abierto && (
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{e.detalle}</p>
                )}
                {abierto && visibles.length > 0 && (
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
                      <li className="px-1 py-0.5 text-xs text-[var(--text-tertiary)]">
                        y {resto} más
                      </li>
                    )}
                  </ul>
                )}
              </div>
              {e.ir && onIr ? (
                <button type="button" onClick={() => onIr(e.ir!, e.filtro)} className={BOTON}>
                  {DESTINO[e.ir]} <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              ) : e.seccion && onSeccion ? (
                <button type="button" onClick={() => onSeccion(e.seccion!)} className={BOTON}>
                  {EN_SECCION[e.seccion]} <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
