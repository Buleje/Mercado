"use client";

/**
 * El DIFERENCIADOR: cuánto falta por distribuir, contado como se cuenta en el
 * patio.
 *
 * La distribución ya decía «faltan 2.591 m³». Eso no alcanza para salir a
 * comprar troza ni para saber si el que falta es el producto que se vende: hay
 * que verlo en **piezas, pie tablar y m³, abierto por tipo**. Es la resta que el
 * operador hace a mano en el cuaderno —lo que salió menos lo que ya asigné— y la
 * que decide si hace falta otra troza o si sobra respaldo.
 */

import { DataTable } from "@buleje/design-system";
import type { Distribucion } from "@/lib/forestal/cubicacion-reparto";
import type { DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { fmtM3, fmtPct, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { TipoBadge } from "./tipo-badge";

interface FilaDif {
  tipo: string;
  piezas: number;
  pieTablar: number;
  m3: number;
  piezasFalta: number;
  ptFalta: number;
  m3Falta: number;
}

/**
 * Lo producido contra lo distribuido, por tipo.
 *
 * Se arma desde la MISMA distribución que dibuja la pantalla: si se recalculara
 * por otro lado, el diferenciador y las tablas dirían cosas distintas del mismo
 * lote.
 */
export function filasDeDiferencia(d: Distribucion): FilaDif[] {
  const mapa = new Map<string, FilaDif>();
  const fila = (tipo: string) => {
    const f = mapa.get(tipo) ?? { tipo, piezas: 0, pieTablar: 0, m3: 0, piezasFalta: 0, ptFalta: 0, m3Falta: 0 };
    mapa.set(tipo, f);
    return f;
  };
  for (const e of d.especies) {
    for (const b of e.bloques) {
      for (const g of b.asignado) {
        const f = fila(g.label);
        f.piezas += g.piezas;
        f.pieTablar += g.pieTablar;
        f.m3 += g.m3;
      }
    }
    for (const x of e.faltante) {
      const f = fila(x.label);
      f.piezasFalta += x.piezas;
      f.ptFalta += x.pieTablar;
      f.m3Falta += x.m3;
    }
  }
  return [...mapa.values()].sort((a, b) => b.m3 + b.m3Falta - (a.m3 + a.m3Falta));
}

const TH = "px-3 py-3 text-left align-bottom text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]";
const TD = "px-3 py-3 align-middle";
const NUM = "text-right font-mono tabular-nums";

export function DiferenciaDistribucion({ dist, dim }: { dist: Distribucion; dim?: DimensionResumen }) {
  const filas = filasDeDiferencia(dist);
  if (filas.length === 0) return null;

  const tot = filas.reduce(
    (a, f) => ({
      piezas: a.piezas + f.piezas,
      pt: a.pt + f.pieTablar,
      m3: a.m3 + f.m3,
      piezasFalta: a.piezasFalta + f.piezasFalta,
      ptFalta: a.ptFalta + f.ptFalta,
      m3Falta: a.m3Falta + f.m3Falta,
    }),
    { piezas: 0, pt: 0, m3: 0, piezasFalta: 0, ptFalta: 0, m3Falta: 0 },
  );
  const totalPiezas = tot.piezas + tot.piezasFalta;
  const pctDistribuido = totalPiezas > 0 ? (tot.piezas / totalPiezas) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* La barra dice de un vistazo cuánto del lote ya tiene respaldo. */}
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, pctDistribuido)}%` }} />
        </div>
        <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
          {fmtPct(pctDistribuido)}% distribuido
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        <DataTable className="w-full min-w-[680px] table-fixed text-base">
          <caption className="sr-only">Lo distribuido contra lo que falta, por tipo</caption>
          <thead className="border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            <tr>
              <th scope="col" className={TH}>Tipo</th>
              <th scope="col" className={`${TH} w-24 text-right`}>Piezas</th>
              <th scope="col" className={`${TH} w-28 text-right`}>Pie tablar</th>
              <th scope="col" className={`${TH} w-24 text-right`}>m³</th>
              <th scope="col" className={`${TH} w-28 text-right`} title="Lo que ningún bloque respalda todavía">Faltan pzas</th>
              <th scope="col" className={`${TH} w-28 text-right`}>Faltan PT</th>
              <th scope="col" className={`${TH} w-28 text-right`}>Faltan m³</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const falta = f.piezasFalta > 0 || f.m3Falta > 0.0001;
              return (
                <tr key={f.tipo} className="border-t border-[var(--rule-soft)] even:bg-[var(--surface-canvas)]/50">
                  <td className={`${TD} font-bold text-[var(--text-primary)]`}>
                    {dim === "tipo" ? <TipoBadge tipo={f.tipo as TipoComercial} /> : f.tipo}
                  </td>
                  <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>{fmtPiezas(f.piezas)}</td>
                  <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>{fmtPt(f.pieTablar)}</td>
                  <td className={`${TD} ${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(f.m3)}</td>
                  <td className={`${TD} ${NUM} ${falta ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"}`}>
                    {fmtPiezas(f.piezasFalta)}
                  </td>
                  <td className={`${TD} ${NUM} ${falta ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"}`}>
                    {fmtPt(f.ptFalta)}
                  </td>
                  <td className={`${TD} ${NUM} ${falta ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)]"}`}>
                    {fmtM3(f.m3Falta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 text-base font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <th scope="row" className={`${TD} text-left`}>Total</th>
              <td className={`${TD} ${NUM}`}>{fmtPiezas(tot.piezas)}</td>
              <td className={`${TD} ${NUM}`}>{fmtPt(tot.pt)}</td>
              <td className={`${TD} ${NUM}`}>{fmtM3(tot.m3)}</td>
              <td className={`${TD} ${NUM}`}>{fmtPiezas(tot.piezasFalta)}</td>
              <td className={`${TD} ${NUM}`}>{fmtPt(tot.ptFalta)}</td>
              <td className={`${TD} ${NUM}`}>{fmtM3(tot.m3Falta)}</td>
            </tr>
          </tfoot>
        </DataTable>
      </div>
    </div>
  );
}
