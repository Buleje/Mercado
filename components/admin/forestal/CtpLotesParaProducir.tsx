"use client";

/**
 * Los lotes que esperan la sierra, ELEGIBLES desde Producción (ADR-349).
 *
 * La corrida se declara desde un lote —así el libro sabe qué piezas entraron y
 * de qué guías salió el volumen— pero para elegirlo había que abrir el menú del
 * CTA. Un menú esconde: quien entra a Producción a registrar la jornada quiere
 * ver de una qué hay apartado y tocarlo, no descubrir que existe.
 *
 * Cada tarjeta es el lote con lo que le queda esperando (piezas, m³ y pies
 * tablares, que es como se habla en la sierra). Al tocarla se abre abajo su
 * panel con las trozas para tildar cuáles entran — el mismo que ya usa el CTA.
 */

import { ChevronRight, Layers, Loader2 } from "@buleje/design-system/icons";
import { pieTablarDe, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { Btn } from "./ctp-shared";

export interface LoteParaProducir {
  lote: LoteAserrio;
  /** Piezas del patio apartadas en este lote y todavía sin consumir. */
  piezas: number;
  volumenM3: number;
  /**
   * Cuántas de sus piezas YA entraron a una corrida (ADR-356).
   *
   * Con esto la tarjeta distingue un lote nuevo de **el resto de uno que se
   * aserró a medias**: son la misma tarjeta y la misma cifra, pero uno es
   * trabajo por empezar y el otro es trabajo por terminar.
   */
  consumidas?: number;
}

export default function CtpLotesParaProducir({
  lotes,
  cargando,
  elegido,
  onElegir,
  onIrALotes,
}: {
  lotes: LoteParaProducir[];
  cargando: boolean;
  /** Id del lote abierto abajo; su tarjeta se ve hundida. */
  elegido: string;
  onElegir: (id: string) => void;
  onIrALotes?: () => void;
}) {
  /* Silencioso mientras carga: una tira que aparece vacía y después se llena se
     lee como «no hay lotes» durante medio segundo. */
  if (cargando && lotes.length === 0) {
    return (
      <p className="flex items-center gap-2 px-1 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo los lotes del patio…
      </p>
    );
  }

  if (lotes.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <Layers className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          No hay lotes con madera esperando. En <b className="text-[var(--text-primary)]">Lotes de aserrío</b> se aparta
          lo que entra junto a la sierra: la corrida se declara eligiendo el lote, no tipeando el volumen.
        </p>
        {onIrALotes && (
          <Btn size="sm" variant="secondary" onClick={onIrALotes}>
            Armar un lote <ChevronRight className="h-4 w-4" />
          </Btn>
        )}
      </div>
    );
  }

  return (
    <section aria-label="Lotes listos para producir" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Elegí el lote que entra a la sierra
        </p>
        {onIrALotes && (
          <button
            type="button"
            onClick={onIrALotes}
            className="text-sm font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
          >
            Ver todos los lotes
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {lotes.map(({ lote, piezas, volumenM3, consumidas = 0 }) => {
          const activo = lote.id === elegido;
          /* Lo que quedó de una corrida anterior se dice: es trabajo por
             terminar, no un lote nuevo esperando. */
          const parcial = consumidas > 0;
          return (
            <button
              key={lote.id}
              type="button"
              aria-pressed={activo}
              onClick={() => onElegir(lote.id)}
              title={activo ? "Cerrar este lote" : `Abrir ${lote.code} y elegir sus trozas${parcial ? " (lo que quedó de una corrida anterior)" : ""}`}
              className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors ${
                activo
                  ? "border-[var(--accent)] bg-primary/10"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:bg-[var(--surface-canvas)]"
              }`}
            >
              <span
                aria-hidden
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  activo
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                }`}
              >
                <Layers className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <b className="truncate font-mono text-sm font-bold text-[var(--text-primary)]">{lote.code}</b>
                  <span className="truncate text-sm text-[var(--text-secondary)]">{lote.speciesCommon}</span>
                  {parcial && (
                    <span
                      title={`Ya entraron ${consumidas} pieza(s) de este lote a la sierra: esto es lo que quedó`}
                      className="shrink-0 rounded-full bg-[var(--data-warning-500)]/15 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                    >
                      Resto
                    </span>
                  )}
                </span>
                {/* Lo que de verdad se puede meter hoy: piezas libres del lote,
                    su volumen y el pie tablar, que es como se habla en la sierra. */}
                <span className="mt-0.5 block font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                  {piezas} pza · {volumenM3.toFixed(4)} m³ · {pieTablarDe(volumenM3).toLocaleString("es-PE")} pt
                  {parcial && ` · ${consumidas} ya aserrada${consumidas === 1 ? "" : "s"}`}
                </span>
              </span>
              <ChevronRight
                className={`h-4 w-4 shrink-0 transition-transform ${activo ? "rotate-90 text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
