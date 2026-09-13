"use client";

/**
 * «Traés un reproceso sugerido» — la banda que recibe el pase de la
 * distribución en Productos disponibles (ADR-404 → ADR-316).
 *
 * La distribución ya calculó QUÉ conviene reprocesar y CUÁNTO; lo que no puede
 * saber es **de qué corrida sale**, porque trabaja con bloques del cubicador
 * (una GTF, un saldo) y el Libro se declara contra una corrida de producción
 * con saldo. Así que la banda dice lo que trae y deja que el operario elija la
 * corrida: adivinarla sería inventar de qué asiento salió la madera.
 *
 * Se descarta sola al declarar y con el botón «Ya no» — un pase viejo colgado
 * arriba de la pantalla es peor que ninguno.
 *
 * Desde 2026-09-09 el pase puede ser una COLA (los tildados en la
 * distribución): la banda dice «1 de 3» y al declarar o descartar aparece el
 * siguiente. «Ya no» descarta SÓLO el que se ve; para tirar la tanda entera
 * está «descartar los 3».
 */

import { RefreshCw, X } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { BorradorDeReproceso } from "@/lib/forestal/reproceso-borrador";

const CHIP =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide";

export default function ReprocesoSugeridoBanda({
  borrador,
  candidatas,
  pendientes = 1,
  onUsar,
  onDescartar,
  onDescartarTodos,
}: {
  borrador: BorradorDeReproceso;
  /** Corridas con saldo cuyo producto coincide con el tipo de origen sugerido. */
  candidatas: { id: string; lineNo: number | null; disponible: number }[];
  /** Cuántos pases quedan contando este — para decir «1 de 3». */
  pendientes?: number;
  /** Abre el reproceso con esa corrida y el destino ya puesto. */
  onUsar: (corridaId: string) => void;
  /** Descarta SÓLO este y muestra el siguiente. */
  onDescartar: () => void;
  /** Tira la cola entera. Sólo se ofrece cuando hay más de uno. */
  onDescartarTodos?: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--accent)]/40 bg-primary/5 px-3 py-2">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)]">
        <RefreshCw className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        <b className="text-[var(--text-primary)]">
          {pendientes > 1 ? "Traés reprocesos sugeridos:" : "Traés un reproceso sugerido:"}
        </b>
        {pendientes > 1 && (
          <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">
            quedan {pendientes}
          </span>
        )}
        <span className={`${CHIP} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
          {borrador.desdeTipo}
        </span>
        <span role="img" aria-label="a">→</span>
        <span className={`${CHIP} bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]`}>
          {borrador.haciaTipo}
        </span>
        <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
          {fmtM3(borrador.m3)} m³
        </span>
        {borrador.especie && <span className="text-xs text-[var(--text-tertiary)]">· {borrador.especie}</span>}
        {borrador.etiqueta && (
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            · del bloque {borrador.etiqueta}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onDescartar}
            title={pendientes > 1 ? "Saltar este y pasar al siguiente" : "Descartar la sugerencia"}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-bold text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> {pendientes > 1 ? "Saltar" : "Ya no"}
          </button>
          {onDescartarTodos && (
            <button
              type="button"
              onClick={onDescartarTodos}
              className="rounded-lg px-1.5 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] underline transition-colors hover:text-[var(--text-primary)]"
            >
              descartar los {pendientes}
            </button>
          )}
        </span>
      </p>

      {candidatas.length > 0 ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
          <span>
            Elegí de qué corrida sale — {candidatas.length}{" "}
            {candidatas.length === 1 ? "tiene" : "tienen"} ese producto con saldo:
          </span>
          {candidatas.slice(0, 6).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onUsar(c.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--surface-canvas)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] transition-colors hover:brightness-95 dark:text-[var(--accent)]"
            >
              N° {c.lineNo ?? "—"}
              <span className="font-mono font-normal opacity-80">{fmtM3(c.disponible)} m³</span>
            </button>
          ))}
          {candidatas.length > 6 && (
            <span className="text-[var(--text-tertiary)]">+{candidatas.length - 6} más en la tabla</span>
          )}
        </p>
      ) : (
        /* Sin candidata no se inventa una: el reproceso se declara contra una
           corrida que existe y tiene saldo, o no se declara. */
        <p className="mt-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-secondary)]">
          Ninguna corrida con saldo declara <b>{borrador.desdeTipo}</b>. Reprocesá desde la corrida
          que corresponda —el botón de la fila— y el producto que sale ya viene puesto; si esa madera
          no está en el Libro, primero hay que declarar su producción.
        </p>
      )}
    </div>
  );
}
