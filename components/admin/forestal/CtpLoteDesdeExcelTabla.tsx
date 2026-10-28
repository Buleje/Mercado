"use client";

/**
 * Las trozas pegadas de UN lote del Excel del SNIFFS, fila por fila, con lo
 * que el libro dice de cada una (27-10). La columna «En el libro» es la
 * respuesta del servidor; mientras no llega, la fila se ve igual sin estado.
 * Va segunda y la guía y la especie viajan bajo el código: con nueve columnas
 * la respuesta quedaba fuera del modal a 1280 (prueba e2e 27-10).
 */

import { DataTable } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { FilaLoteExcel } from "@/lib/forestal/lote-desde-excel";
import type { EstadoFilaLote, FilaCruzada } from "@/lib/forestal/lote-desde-excel-cruce";

const OK =
  "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
const MAL =
  "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const AVISO =
  "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

const ESTADO: Record<EstadoFilaLote, { texto: string; clase: string }> = {
  entra: { texto: "Entra", clase: OK },
  "ya-en-el-lote": { texto: "Ya en este lote", clase: OK },
  "no-entra": { texto: "No entra", clase: MAL },
  "no-encontrada": { texto: "No está", clase: MAL },
  ambigua: { texto: "Ambigua", clase: AVISO },
  repetida: { texto: "Repetida", clase: AVISO },
};

const NUM = "whitespace-nowrap text-right font-mono tabular-nums";

/** Una punta: la del Excel; si completa una vacía del libro, marcada. */
function Punta({ excel, completa }: { excel: number | null; completa: number | null }) {
  if (completa != null) {
    return (
      <span
        className="font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
        title="El libro no la tenía: se completa con la del Excel"
      >
        +{completa}
      </span>
    );
  }
  return <span className="text-[var(--text-tertiary)]">{excel ?? "—"}</span>;
}

export default function CtpLoteDesdeExcelTabla({
  filas,
  cruzadas,
}: {
  filas: readonly FilaLoteExcel[];
  cruzadas: readonly FilaCruzada[] | null;
}) {
  const porFila = new Map((cruzadas ?? []).map((c) => [c.fila, c]));
  return (
    <div className="max-h-80 overflow-auto rounded-xl border border-[var(--rule-base)]">
      <DataTable className="w-full min-w-[520px]">
        <caption className="sr-only">Las trozas pegadas y si entran al lote</caption>
        <thead>
          <tr>
            <th scope="col">Troza</th>
            <th scope="col">En el libro</th>
            <th scope="col" className="text-right">
              D1 · D2
            </th>
            <th scope="col" className="text-right">
              Largo
            </th>
            <th scope="col" className="text-right">
              m³
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const c = porFila.get(f.fila);
            const e = c ? ESTADO[c.estado] : null;
            return (
              <tr key={f.fila}>
                <td>
                  <span className="block font-mono font-bold text-[var(--text-primary)]">
                    {f.codigoPlanta ?? f.codigoTroza ?? "—"}
                  </span>
                  <span className="block text-xs text-[var(--text-secondary)]">
                    fila {f.fila} ·{" "}
                    <span className="font-mono">{c?.gtf ?? f.gtf ?? "sin guía"}</span>
                    {(c?.especie ?? f.especie) ? ` · ${c?.especie ?? f.especie}` : ""}
                  </span>
                </td>
                <td>
                  {e && (
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${e.clase}`}
                    >
                      {e.texto}
                    </span>
                  )}
                  {c?.motivo && (
                    <span className="block text-xs text-[var(--text-secondary)]">{c.motivo}</span>
                  )}
                  {f.estado && !/consum/i.test(f.estado) && (
                    <span className="block text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      SNIFFS: {f.estado}
                    </span>
                  )}
                </td>
                <td className={NUM}>
                  <Punta excel={f.d1Cm} completa={c?.completaD1 ?? null} /> ·{" "}
                  <Punta excel={f.d2Cm} completa={c?.completaD2 ?? null} />
                </td>
                <td className={NUM}>{f.largoM ?? "—"}</td>
                <td className={NUM}>
                  {f.volumenM3 != null ? fmtM3(f.volumenM3) : "—"}
                  {c?.volumenDistinto && c.volumenLibro != null && (
                    <span
                      className="block text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                      title="Se consume el volumen del libro (el de la guía)"
                    >
                      libro {fmtM3(c.volumenLibro)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
