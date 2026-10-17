"use client";

/**
 * Fichas de una PILA (la guía entera) y de una TROZA separada.
 *
 * La pila se ubica entera por defecto; desde acá se separa una troza por el
 * código pintado en la madera y se pone en otra zona (manda sobre la pila).
 * Volverla a la pila = quitarle su ubicación propia. La troza muestra su
 * historia con las fechas del Libro.
 */

import { useMemo, useState } from "react";
import { MousePointer, Scissors, Undo2, X, History, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import {
  codigoTroza, especieDe, estaSeparada, EVENTO_LABEL, fmtFechaEvento, fmtMedidaCorta, medidaDeItem, medidaDeTroza,
  type Medida, type PilaEnZona,
} from "@/lib/forestal/planta-croquis";
import { claveTroza, type Item, type PlantaZona, type TrozaUbicable, type UbicacionPlanta } from "@/lib/forestal/planta-zona-types";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import { useTrozaHistoria } from "./hooks/use-troza-historia";
import type { SeleccionCroquis } from "./hooks/use-croquis-leaflet";

const MINI = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50";
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function Medidas({ m }: { m: Medida }) {
  return (
    <p className="flex flex-wrap gap-x-3 text-sm tabular-nums">
      <span><strong className="text-[var(--text-primary)]">{m.pt != null ? formatNumber(m.pt, { max: 0 }) : "—"}</strong> <span className="text-[var(--text-tertiary)]">pt</span></span>
      <span><strong className="text-[var(--text-primary)]">{m.m3 != null ? formatNumber(m.m3, { max: 3 }) : "—"}</strong> <span className="text-[var(--text-tertiary)]">m³</span></span>
      <span><strong className="text-[var(--text-primary)]">{m.piezas ?? "—"}</strong> <span className="text-[var(--text-tertiary)]">{m.piezas === 1 ? "pieza" : "piezas"}</span></span>
    </p>
  );
}

function Dato({ label, valor, falta }: { label: string; valor: string | null | undefined; falta: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className={`min-w-0 truncate text-right ${valor ? "font-semibold text-[var(--text-primary)]" : "italic text-[var(--text-tertiary)]"}`}>{valor || falta}</span>
    </div>
  );
}

export function CtpPlantaCroquisFichaPila({ item, enZona, zona, ubicaciones, zonaById, onSeparar, onVolver, onAbrir, onMover, onQuitar }: {
  item: Item;
  enZona: PilaEnZona | undefined;
  zona: PlantaZona | null;
  ubicaciones: Record<string, UbicacionPlanta>;
  zonaById: Map<string, PlantaZona>;
  onSeparar: (t: TrozaUbicable) => void;
  onVolver: (trozaId: string) => void;
  onAbrir: (s: SeleccionCroquis) => void;
  onMover: () => void;
  onQuitar: () => void;
}) {
  const [q, setQ] = useState("");
  const trozas = useMemo(() => item.trozas ?? [], [item.trozas]);
  const visibles = useMemo(() => {
    const t = norm(q.trim());
    return t ? trozas.filter((x) => norm(codigoTroza(x)).includes(t)) : trozas;
  }, [trozas, q]);

  return (
    <div className="space-y-3">
      <Medidas m={enZona?.medida ?? medidaDeItem(item)} />
      <div className="space-y-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
        <Dato label="Zona" valor={zona ? `${zona.codigo}${zona.nombre ? ` · ${zona.nombre}` : ""}` : null} falta="Sin ubicar" />
        <Dato label="Especie" valor={especieDe(item)} falta="Sin especie" />
        <Dato label="Permiso" valor={item.permiso} falta="Sin permiso" />
        <Dato label="Dueño" valor={item.dueno} falta="Sin cargar" />
      </div>

      {trozas.length > 0 ? (
        <section>
          <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Trozas de la pila ({trozas.length - (enZona?.separadas ?? trozas.filter((t) => estaSeparada(ubicaciones, t.id)).length)} de {trozas.length})
            <InfoTip title="Separar una troza" what="Elige la troza por el código pintado en la madera y toca la zona donde la pusieron: deja de contar en esta pila." affects="Solo la ubicación; no cambia stock ni consumo." example="A-12 se fue al coche: Separar → toca la zona del coche." />
          </p>
          {trozas.length > 10 && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código pintado…" aria-label="Buscar troza por código" className="mb-1.5 h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
          )}
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {visibles.map((t) => {
              const zSep = zonaById.get(ubicaciones[claveTroza(t.id)]?.zonaId ?? "");
              const separada = estaSeparada(ubicaciones, t.id);
              return (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-[var(--surface-sunken)]">
                  <button type="button" onClick={() => onAbrir({ tipo: "troza", id: t.id })} className="min-w-0 text-left">
                    <span className="block truncate font-mono text-sm font-semibold text-[var(--text-primary)]">{codigoTroza(t)}</span>
                    <span className="block truncate text-xs text-[var(--text-tertiary)]">{fmtMedidaCorta(medidaDeTroza(t)) ?? "—"}{separada ? ` · en ${zSep?.codigo ?? "otro plano"}` : ""}</span>
                  </button>
                  {separada
                    ? <button type="button" onClick={() => onVolver(t.id)} className={MINI} title="Vuelve a contar en su pila"><Undo2 className="h-3.5 w-3.5" />A la pila</button>
                    : <button type="button" onClick={() => onSeparar(t)} className={MINI} title="Tómala y toca la zona donde está"><Scissors className="h-3.5 w-3.5" />Separar</button>}
                </li>
              );
            })}
          </ul>
        </section>
      ) : item.kind === "troza" ? (
        <p className="text-xs text-[var(--text-tertiary)]">Esta guía no trae el detalle de sus trozas: se ubica entera.</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onMover} className={BOTON_SECUNDARIO}><MousePointer className="h-4 w-4" /> {zona ? "Mover" : "Ubicar"}</button>
        {zona && <button type="button" onClick={onQuitar} className={BOTON_SECUNDARIO}><X className="h-4 w-4" /> Quitar del plano</button>}
      </div>
    </div>
  );
}

export function CtpPlantaCroquisFichaTroza({ troza, pila, zona, onVolver, onMover, onAbrir }: {
  troza: TrozaUbicable;
  pila: Item;
  zona: PlantaZona | null;
  onVolver: () => void;
  onMover: () => void;
  onAbrir: (s: SeleccionCroquis) => void;
}) {
  const { eventos, error, cargando } = useTrozaHistoria(troza.id);
  return (
    <div className="space-y-3">
      <Medidas m={medidaDeTroza(troza)} />
      <div className="space-y-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
        <Dato label="Zona" valor={zona ? `${zona.codigo}${zona.nombre ? ` · ${zona.nombre}` : ""}` : null} falta="En su pila" />
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-[var(--text-tertiary)]">Pila</span>
          <button type="button" onClick={() => onAbrir({ tipo: "pila", id: pila.id })} className="min-w-0 truncate font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]">{pila.label}</button>
        </div>
        <Dato label="Dueño" valor={pila.dueno} falta="Sin cargar" />
      </div>

      <section>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]"><History className="h-3.5 w-3.5" /> Historia</p>
        {cargando && <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>}
        {error && <p className="text-sm text-[var(--text-secondary)]">{error}</p>}
        {eventos && eventos.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">El Libro no registra movimientos de esta troza.</p>}
        {eventos && eventos.length > 0 && (
          <ol className="relative ml-1.5 space-y-2 border-l-2 border-[var(--rule-base)] pl-4">
            {eventos.map((ev, i) => (
              <li key={`${ev.tipo}-${ev.fecha}-${i}`} className="relative">
                <span aria-hidden className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface-raised)]" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">{EVENTO_LABEL[ev.tipo] ?? ev.tipo}{ev.ref ? <span className="ml-1 font-mono text-xs text-[var(--text-secondary)]">{ev.ref}</span> : null}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{fmtFechaEvento(ev.fecha)}{ev.detalle ? ` · ${ev.detalle}` : ""}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onMover} className={BOTON_SECUNDARIO}><MousePointer className="h-4 w-4" /> Mover</button>
        {zona && <button type="button" onClick={onVolver} className={BOTON_SECUNDARIO}><Undo2 className="h-4 w-4" /> Volver a la pila</button>}
      </div>
    </div>
  );
}
