"use client";

/**
 * LothMapaCercanos — la respuesta a «¿Qué árbol tengo cerca?»: el árbol en pie
 * más cercano en una frase que se lee de un vistazo en el monte («a 18 m al
 * noreste · árbol 22 · Catahua»), con su «Registrar tala» al lado, y la lista
 * de los cinco más cercanos para elegir otro con el pulgar.
 *
 * Se actualiza mientras caminas (el GPS sigue prendido). Para el lector de
 * pantalla sólo se anuncia cuando CAMBIA el árbol más cercano, no cada metro.
 */

import { AlertTriangle, ChevronRight, Loader2, RotateCcw } from "@buleje/design-system/icons";
import { formatMeters, toUtm } from "@/lib/forestal/loth-utm";
import { claseDelArbol, GPS_IMPRECISO_M, rumboCardinal, textoDistancia } from "@/lib/forestal/loth-mapa-arboles";
import LothMapaArbolSimbolo from "./LothMapaArbolSimbolo";
import LothMapaRegistrarTala from "./LothMapaRegistrarTala";
import type { LothMapaArboles } from "./hooks/use-loth-mapa-arboles";
import type { CensoTree } from "./loth-mapa-shared";

const FILA =
  "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--data-info-500)]";
const BTN_SECUNDARIO =
  "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]";

const nombre = (t: CensoTree) => `${t.species}${t.speciesNative ? ` · ${t.speciesNative}` : ""}`;

export default function LothMapaCercanos({ arb, filtrando }: { arb: LothMapaArboles; filtrando: string | null }) {
  const { posicion, errorGps, cercanos } = arb;
  const primero = cercanos[0];
  const utm = posicion ? toUtm(posicion.lat, posicion.lng) : null;
  const impreciso = posicion != null && posicion.accuracy > GPS_IMPRECISO_M;

  return (
    <section aria-label="Árboles más cercanos a ti" data-cercanos className="space-y-2 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-3">
      {errorGps && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--surface-raised)] px-3 py-2">
          <AlertTriangle className="h-4 w-4 flex-none text-[var(--data-error-ink)]" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{errorGps}</p>
          <button type="button" onClick={arb.buscarCerca} className={BTN_SECUNDARIO}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reintentar
          </button>
        </div>
      )}

      {!posicion && !errorGps && (
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Buscando tu ubicación…
        </p>
      )}

      {posicion && !primero && (
        <p className="text-sm font-semibold text-[var(--text-secondary)]" role="status">
          {filtrando ? `No hay árboles en pie de ${filtrando}.` : "No hay árboles en pie en el censo."}
        </p>
      )}

      {posicion && primero && (
        <>
          <div className="rounded-xl border border-[var(--data-info-500)]/50 bg-[var(--surface-raised)] p-3">
            <p className="sr-only" aria-live="polite">
              Más cerca: árbol {primero.arbol.code}, {primero.arbol.species}
            </p>
            <p className="text-2xl font-black tabular-nums leading-tight text-[var(--text-primary)]" data-cercano-frase>
              a {textoDistancia(primero.distanciaM)} {rumboCardinal(primero.rumboDeg).largo}
            </p>
            <p className="mt-0.5 text-base font-bold text-[var(--text-primary)]">
              Árbol {primero.arbol.code} · {nombre(primero.arbol)}
            </p>
            {impreciso && (
              <p className="mt-1 text-xs font-bold text-[var(--data-warning-ink)]">
                Tu GPS está impreciso (±{Math.round(posicion.accuracy)} m): espera unos segundos a cielo abierto.
              </p>
            )}
            <div className="mt-2.5 grid grid-cols-2 gap-2 max-sm:grid-cols-1">
              <button type="button" onClick={() => arb.elegirYMostrar(primero.arbol)} className={BTN_SECUNDARIO}>
                Ver su ficha
              </button>
              <LothMapaRegistrarTala arbol={primero.arbol} />
            </div>
          </div>

          <div>
            <p className="px-1 text-xs font-bold text-[var(--text-secondary)]">
              {cercanos.length === 1 ? "El único en pie" : `Los ${cercanos.length} más cercanos en pie`}
              {filtrando ? ` · ${filtrando}` : ""}
            </p>
            <ol className="mt-1 space-y-0.5">
              {cercanos.map((c, i) => (
                <li key={c.arbol.id}>
                  <button
                    type="button"
                    onClick={() => arb.elegirYMostrar(c.arbol)}
                    aria-current={arb.elegido?.id === c.arbol.id ? "true" : undefined}
                    className={`${FILA} ${arb.elegido?.id === c.arbol.id ? "bg-[var(--surface-raised)]" : ""}`}
                  >
                    <span className="w-4 text-right text-xs font-bold tabular-nums text-[var(--text-tertiary)]">{i + 1}</span>
                    <LothMapaArbolSimbolo clase={claseDelArbol(c.arbol)} estado={c.arbol.estado} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
                        {c.arbol.code} · {c.arbol.species}
                      </span>
                      {c.arbol.speciesNative && <span className="block truncate text-xs text-[var(--text-secondary)]">{c.arbol.speciesNative}</span>}
                    </span>
                    <span className="text-right text-sm font-bold tabular-nums text-[var(--text-primary)]">
                      {textoDistancia(c.distanciaM)}
                      <span className="block text-xs font-semibold text-[var(--text-tertiary)]">{rumboCardinal(c.rumboDeg).corto}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 flex-none text-[var(--text-tertiary)]" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {utm && posicion && (
        <p className="px-1 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
          Tú: {utm.zone}
          {utm.band} · E {formatMeters(utm.easting, 0)} · N {formatMeters(utm.northing, 0)} · ±{Math.round(posicion.accuracy)} m
        </p>
      )}
    </section>
  );
}
