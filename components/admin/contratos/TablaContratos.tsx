"use client";

import type { ReactNode } from "react";
import { DataTable } from "@buleje/design-system";
import { SinCoincidenciasFila, type FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { ThColumna, type OrdenDeColumnas } from "@/components/admin/shared/th-columna";
import { cn } from "@/lib/utils";
import { ESTADO_VISIBLE_LABELS, estadoVisible, TIPO_LABELS, type DbContract } from "@/lib/types/contracts";
import { enlaceDeContraparte } from "./enlace-contraparte";
import { ESTADO_STYLES, formatDatePeru, formatMoney } from "./formato-contratos";

interface Props {
  /** Los contratos tras la barra (búsqueda, tipo, estado), antes de los embudos de columna. */
  filtrados: readonly DbContract[];
  /** Lo que queda tras los embudos y el orden de columna. */
  visibles: readonly DbContract[];
  /** La página que se dibuja. */
  paginados: readonly DbContract[];
  fCols: FiltrosTabla<DbContract>;
  ordCols: OrdenDeColumnas;
  onAbrir: (c: DbContract) => void;
  onQuitarFiltros: () => void;
  menuDe: (c: DbContract) => ReactNode;
}

/** Lo que sigue en pie: la misma regla de «Monto vigente» de las cifras de arriba (sin anulados ni vencidos). */
const EN_PIE = new Set(["VIGENTE", "POR_VENCER", "PENDIENTE_FIRMA"]);

/** Suma de lo que se ve, por moneda y sin lo que ya no cuenta. */
function totalesVisibles(visibles: readonly DbContract[]): { pen: number; usd: number } {
  let pen = 0;
  let usd = 0;
  for (const c of visibles) {
    if (!EN_PIE.has(estadoVisible(c))) continue;
    if (c.moneda === "USD") usd += c.monto || 0;
    else pen += c.monto || 0;
  }
  return { pen, usd };
}

/** La lista de contratos en tabla (escritorio). Las tarjetas del celular siguen en el módulo. */
export function TablaContratos({ filtrados, visibles, paginados, fCols, ordCols, onAbrir, onQuitarFiltros, menuDe }: Props) {
  const tot = totalesVisibles(visibles);
  return (
    <DataTable>
        <thead>
          <tr>
            <ThColumna label="N.o" ids={["numero"]} f={fCols} orden={ordCols} ordenId="numero" />
            <ThColumna label="Cliente" ids={["cliente"]} f={fCols} orden={ordCols} ordenId="cliente" />
            <ThColumna label="Tipo" f={fCols} orden={ordCols} ordenId="tipo" className="hidden align-top sm:table-cell" />
            <ThColumna label="Monto" ids={["monto"]} f={fCols} derecha orden={ordCols} ordenId="monto" />
            <ThColumna label="Fecha" ids={["fecha"]} f={fCols} orden={ordCols} ordenId="fecha" className="hidden md:table-cell" />
            <ThColumna label="Estado" className="align-top" f={fCols} orden={ordCols} ordenId="estado" />
            <th><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {filtrados.length > 0 && visibles.length === 0 && <SinCoincidenciasFila colSpan={7} />}
          {filtrados.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center">
                <p className="text-sm font-semibold text-[var(--text-secondary)]">Ningún contrato coincide con el filtro.</p>
                <button type="button" onClick={onQuitarFiltros} className="mt-2 h-12 rounded-xl px-4 text-sm font-bold text-[var(--accent-ink)] hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]">Quitar filtros</button>
              </td>
            </tr>
          )}
          {paginados.map(c => {
            const estado = estadoVisible(c);
            return (
              <tr
                key={c.id}
                onClick={() => onAbrir(c)}
                tabIndex={0}
                role="button"
                aria-label={`Ver contrato ${c.numero}`}
                onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(c); } }}
                className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <td className="font-mono text-[var(--text-secondary)]">{c.numero}</td>
                <td>
                  {/* Un div: en las tarjetas del celular la celda es flex y partía nombre y documento en dos columnas. */}
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] truncate"><EnlacePanel {...enlaceDeContraparte(c)}>{c.clienteNombre}</EnlacePanel></p>
                    <p className="text-sm text-[var(--text-tertiary)]">{c.clienteDoc}</p>
                  </div>
                </td>
                <td className="hidden sm:table-cell">
                  <span className="text-sm text-[var(--text-secondary)]">{TIPO_LABELS[c.tipo] || c.tipo}</span>
                </td>
                <td className="text-right font-bold">{formatMoney(c.monto, c.moneda)}</td>
                <td className="text-[var(--text-secondary)] hidden md:table-cell">{formatDatePeru(c.fechaInicio || c.createdAt)}</td>
                <td>
                  <span className={cn("inline-flex whitespace-nowrap px-2.5 py-0.5 rounded-full text-sm font-bold", ESTADO_STYLES[estado])}>{ESTADO_VISIBLE_LABELS[estado]}</span>
                </td>
                <td className="w-14 text-right">{menuDe(c)}</td>
              </tr>
            );
          })}
        </tbody>
        {visibles.length > 0 && (
          <tfoot className="hidden sm:table-footer-group" data-qa="contratos-total">
            <tr className="font-bold">
              <td colSpan={3} className="text-right">Total de lo que se ve (sin anulados ni vencidos)</td>
              <td className="text-right">
                {formatMoney(tot.pen)}
                {tot.usd > 0 && <span className="block">{formatMoney(tot.usd, "USD")}</span>}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </DataTable>
  );
}
