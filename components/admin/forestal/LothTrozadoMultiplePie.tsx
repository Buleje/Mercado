"use client";

/**
 * El pie de «Trozar un árbol»: cuánto se va a asentar (o por qué todavía no)
 * y los botones.
 *
 * Asentar espera a que el libro responda: los códigos (E, F, G…) salen de las
 * trozas ya asentadas, y sin leerlas se propondrían A y B otra vez — T3 las
 * rechazaría una por una al guardar.
 *
 * Al lector de pantalla sólo le llega el AVISO (se pasa, a medias), no el
 * total que cambia en cada tecla.
 */

import { AlertTriangle, Loader2, Scissors } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { RestanteDeLote } from "@/lib/forestal/loth-trozado-multiple";

const TONO_AVISO = "font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";

export default function LothTrozadoMultiplePie({
  hayResultado,
  hayArbol,
  libro,
  resto,
  aMedias,
  listas,
  totalM3,
  guardando,
  onCerrar,
  onAsentar,
}: {
  hayResultado: boolean;
  hayArbol: boolean;
  libro: { leido: boolean; error: string | null };
  resto: RestanteDeLote | null;
  /** Los códigos de las trozas tipeadas a medias. */
  aMedias: string[];
  listas: number;
  totalM3: number;
  guardando: boolean;
  onCerrar: () => void;
  onAsentar: () => void;
}) {
  const pasa = resto?.excede && resto.restanteM3 != null ? -resto.restanteM3 : null;
  const aviso =
    pasa != null
      ? `Se pasa de lo talado por ${fmtM3(pasa)} m³`
      : aMedias.length > 0
        ? `${aMedias.join(", ")} a medias: no se ${aMedias.length === 1 ? "asienta" : "asientan"}`
        : null;
  const rendimiento = resto?.taladoM3 ? (resto.trozadoM3 / resto.taladoM3) * 100 : null;
  const puede = hayArbol && libro.leido && listas > 0 && !guardando;

  return (
    <footer className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-[var(--rule-base)] px-4 py-3 sm:px-5">
      <span className="sr-only" aria-live="polite">
        {hayResultado ? "" : (aviso ?? "")}
      </span>
      {!hayResultado && hayArbol && (
        <p className="mr-auto flex min-w-0 items-center gap-1.5 text-sm">
          {!libro.leido ? (
            <span className={libro.error ? TONO_AVISO : "text-[var(--text-secondary)]"}>
              {libro.error ? "No se pudo leer el libro: reintenta en la ficha." : "Leyendo el libro…"}
            </span>
          ) : aviso ? (
            <span className={`flex items-center gap-1.5 ${TONO_AVISO}`}>
              {pasa != null && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {aviso}
            </span>
          ) : (
            <span className="text-[var(--text-secondary)]">
              {listas} troza{listas === 1 ? "" : "s"} · <span className="font-mono tabular-nums">{fmtM3(totalM3)} m³</span>
              {rendimiento != null && <span className="font-mono tabular-nums"> · {rendimiento.toFixed(1)} % de lo talado</span>}
            </span>
          )}
        </p>
      )}
      <button
        type="button"
        onClick={onCerrar}
        className="inline-flex h-11 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)]"
      >
        {hayResultado ? "Cerrar" : "Cancelar"}
      </button>
      {!hayResultado && (
        <button
          type="button"
          onClick={onAsentar}
          disabled={!puede}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
          {guardando ? "Asentando…" : `Asentar ${listas} troza${listas === 1 ? "" : "s"}`}
        </button>
      )}
    </footer>
  );
}
