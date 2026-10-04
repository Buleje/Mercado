"use client";

/**
 * Las dos listas de «Trozas del bloque» (panel «Lotes», 03-10):
 *  · `TrozasParaElegir` — piezas libres del patio con casilla, buscador por
 *    código o guía y m³ por troza. Las que no se pueden elegir se ven en gris
 *    con su motivo (una pieza que el operario sabe que está y no aparece se
 *    lee como un bug).
 *  · `TrozasEnElLote` — las piezas libres que ya tiene el lote, con «Quitar».
 */

import { Loader2, Minus, Search } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { piezasLibres, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { codigoDeTroza, type OpcionDeTroza } from "@/lib/forestal/panel-lotes-reparto";
import { CAMPO } from "./reparto-panel-lotes-ui";

/** Más de esto no se dibuja: se busca por código. */
const TOPE_FILAS = 300;

export function TrozasParaElegir({ opciones, seleccion, onSeleccion, busqueda, onBusqueda, disabled }: {
  opciones: OpcionDeTroza[];
  seleccion: ReadonlySet<string>;
  onSeleccion: (next: Set<string>) => void;
  busqueda: string;
  onBusqueda: (q: string) => void;
  disabled?: boolean;
}) {
  const elegibles = opciones.filter((o) => !o.motivo);
  const todas = elegibles.length > 0 && elegibles.every((o) => seleccion.has(o.id));
  const visibles = opciones.slice(0, TOPE_FILAS);
  const alternar = (id: string) => {
    const next = new Set(seleccion);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSeleccion(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar troza por código o guía</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            placeholder="Código o guía"
            className={`${CAMPO} w-full pl-9`}
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={todas}
            disabled={disabled || elegibles.length === 0}
            onChange={() => {
              const next = new Set(seleccion);
              for (const o of elegibles) {
                if (todas) next.delete(o.id);
                else next.add(o.id);
              }
              onSeleccion(next);
            }}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Todas las que se pueden ({elegibles.length})
        </label>
      </div>
      {opciones.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{busqueda ? "Ninguna troza coincide con la búsqueda." : "No hay trozas libres de esta especie en el patio."}</p>
      ) : (
        <ul className="max-h-[22rem] divide-y divide-[var(--rule-soft)] overflow-auto rounded-xl border border-[var(--rule-base)]" aria-label="Trozas libres del patio">
          {visibles.map((o) => (
            <li key={o.id}>
              <label className={`flex items-center gap-3 px-3 py-2 ${o.motivo ? "opacity-60" : "cursor-pointer hover:bg-[var(--surface-sunken)]"}`}>
                <input
                  type="checkbox"
                  checked={seleccion.has(o.id)}
                  disabled={disabled || Boolean(o.motivo)}
                  onChange={() => alternar(o.id)}
                  aria-label={`Elegir la troza ${o.codigo}`}
                  className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[var(--text-primary)]">{o.codigo}</span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]">{o.motivo ?? (o.gtf ? `Guía ${o.gtf}` : "Sin guía")}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-[var(--text-primary)]">{fmtM3(o.m3)} m³</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {opciones.length > TOPE_FILAS && (
        <p className="text-xs text-[var(--text-tertiary)]">Se muestran {TOPE_FILAS} de {opciones.length}: busca por código para ver las demás.</p>
      )}
    </div>
  );
}

export function TrozasEnElLote({ lote, onQuitar, quitando }: {
  lote: LoteAserrio;
  onQuitar: (trozaId: string) => void;
  /** La troza que se está sacando ahora (una a la vez). */
  quitando: string | null;
}) {
  const libres = piezasLibres(lote);
  const ultima = libres.length === 1;
  if (libres.length === 0) return <p className="text-sm text-[var(--text-secondary)]">El lote no tiene trozas libres.</p>;
  return (
    <ul className="max-h-[14rem] divide-y divide-[var(--rule-soft)] overflow-auto rounded-xl border border-[var(--rule-base)]" aria-label={`Trozas del lote ${lote.code}`}>
      {libres.map((t) => (
        <li key={t.id} className="flex items-center gap-3 px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-[var(--text-primary)]">{codigoDeTroza(t)}</span>
            {t.gtfNumber && <span className="block truncate text-xs text-[var(--text-tertiary)]">Guía {t.gtfNumber}</span>}
          </span>
          <span className="shrink-0 text-sm tabular-nums text-[var(--text-primary)]">{fmtM3(Number(t.volumenM3) || 0)} m³</span>
          <button
            type="button"
            onClick={() => onQuitar(t.id)}
            disabled={ultima || quitando !== null}
            title={ultima ? "Es la última troza: un lote no queda vacío (para soltarlo, deshazlo en Lotes)" : `Sacar ${codigoDeTroza(t)} del lote`}
            aria-label={`Quitar la troza ${codigoDeTroza(t)} del lote`}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            {quitando === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />} Quitar
          </button>
        </li>
      ))}
    </ul>
  );
}
