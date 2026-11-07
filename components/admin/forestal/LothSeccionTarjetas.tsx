"use client";

/**
 * LothSeccionTarjetas — la sección del libro en el celular (≤639 px): una
 * tarjeta de ~110 px por línea en vez de la fila-tarjeta de la tabla (un
 * rótulo por columna, ~330 px). Mismos datos, mismas acciones y la misma
 * elección de columnas que `LothSeccionTabla`, que sigue en pantallas más
 * anchas. Se muestran 8 y «Ver más» abre las siguientes: nada se esconde.
 */

import { useState } from "react";
import { Casilla } from "@/components/ui-system/Casilla";
import { Button } from "@/components/ui-system/Button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { estaFueraDePlazo, type LothEntryDTO, type LothSection } from "@/lib/forestal/loth-constants";
import { totalesDe } from "@/lib/forestal/loth-seccion";
import LothLineaAcciones from "./LothLineaAcciones";
import { ObservacionesDeLinea, type ColDef } from "./loth-seccion-celdas";
import { textoTotal } from "./loth-seccion-cifras";

const DE_A_POCO = 8;
/** Lo que va en el renglón de arriba (el código) y en el de la especie y la cifra. */
const PRINCIPALES = new Set(["esp", "vol", "qty"]);

export default function LothSeccionTarjetas({
  section,
  entries,
  filasTotal,
  cols,
  orden,
  seleccion,
  onSeleccionar,
  onSeleccionarTodo,
  corregidaPor,
  mesCerrado,
  onDetalle,
  onCadena,
  onDuplicar,
  onCorregir,
  onAnular,
}: {
  section: LothSection;
  entries: LothEntryDTO[];
  filasTotal?: readonly LothEntryDTO[];
  cols: ColDef[];
  /** Las columnas visibles, en el orden elegido (`useOrdenSeccion`). */
  orden: readonly string[];
  seleccion: Set<string>;
  onSeleccionar: (id: string) => void;
  onSeleccionarTodo: () => void;
  corregidaPor: Map<number, number>;
  mesCerrado: boolean;
  onDetalle: (e: LothEntryDTO) => void;
  onCadena: (code: string) => void;
  onDuplicar: (e: LothEntryDTO) => void;
  onCorregir: (e: LothEntryDTO) => void;
  onAnular: (e: LothEntryDTO) => void;
}) {
  const [mostradas, setMostradas] = useState(DE_A_POCO);
  if (entries.length === 0) return null;
  const visibles = cols.filter((c) => orden.includes(c.key));
  const primera = cols[0];
  const esp = visibles.find((c) => c.key === "esp");
  const cifra = visibles.find((c) => c.key === "vol" || c.key === "qty");
  const resto = visibles.filter((c) => c.key !== primera?.key && !PRINCIPALES.has(c.key));
  const todasElegidas = entries.every((e) => seleccion.has(e.id));
  const totales = totalesDe([...(filasTotal ?? entries)]);
  const total = textoTotal(section, totales);
  const lista = entries.slice(0, mostradas);

  return (
    <div className="rounded-2xl bg-[var(--surface-raised)]" data-seccion-tarjetas={section}>
      <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] px-3 py-2 text-sm">
        <Casilla checked={todasElegidas} onChange={onSeleccionarTodo} aria-label="Seleccionar todas las líneas de la página" />
        <span className="font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Total · {totales.lineas} línea{totales.lineas === 1 ? "" : "s"}
        </span>
        {total && <span className="ml-auto font-mono font-black tabular-nums text-[var(--text-primary)]">{total}</span>}
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {lista.map((e) => {
          const elegida = seleccion.has(e.id);
          const anulada = e.status === "anulado";
          const corregida = corregidaPor.get(e.lineNo);
          const conNota =
            e.discarded || anulada || corregida != null || e.correctsLineNo != null || e.observations || e.annulledReason || (!anulada && fueraDePlazo(e));
          return (
            <li key={e.id} className={cn("space-y-1 px-3 py-2", anulada && "opacity-60", elegida && "bg-[var(--data-info-500)]/10")}>
              <div className="flex items-center gap-2">
                <Casilla checked={elegida} onChange={() => onSeleccionar(e.id)} aria-label={`Seleccionar la línea ${e.lineNo}`} />
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate", anulada && "line-through")}>{primera?.render(e)}</div>
                  <div className="text-xs tabular-nums text-[var(--text-tertiary)]">
                    N° {e.lineNo} · {formatDate(e.entryDate, { soloFecha: true })}
                  </div>
                </div>
                <LothLineaAcciones
                  e={e}
                  mesCerrado={mesCerrado}
                  onDetalle={onDetalle}
                  onCadena={onCadena}
                  onDuplicar={onDuplicar}
                  onCorregir={onCorregir}
                  onAnular={onAnular}
                />
              </div>
              {(esp || cifra) && (
                <div className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">{esp?.render(e)}</div>
                  <div className="shrink-0 text-right">{cifra?.render(e)}</div>
                </div>
              )}
              {resto.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
                  {resto.map((c) => (
                    <span key={c.key} className="inline-flex items-center gap-1">
                      {c.label && <span className="text-[var(--text-tertiary)]">{c.label}</span>}
                      {c.render(e)}
                    </span>
                  ))}
                </div>
              )}
              {conNota && <ObservacionesDeLinea e={e} corregida={corregida} />}
            </li>
          );
        })}
      </ul>
      {entries.length > mostradas && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setMostradas((n) => n + DE_A_POCO)}
          className="w-full rounded-t-none rounded-b-2xl border-t border-[var(--rule-soft)]"
        >
          Ver {Math.min(DE_A_POCO, entries.length - mostradas)} más · quedan {entries.length - mostradas}
        </Button>
      )}
    </div>
  );
}

function fueraDePlazo(e: LothEntryDTO): boolean {
  return estaFueraDePlazo(e.entryDate, e.createdAt);
}
