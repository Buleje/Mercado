"use client";

import { DataTable } from "@buleje/design-system";
import { Eye } from "@buleje/design-system/icons";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { FiltroColumnaRango, FiltroColumnaTexto } from "@/components/admin/shared/filtros-columna";
import { ThColumna, type OrdenDeColumnas } from "@/components/admin/shared/th-columna";
import type { FiltrosComprobantes } from "./filtros-comprobantes";
import type { ColumnaOrden } from "@/lib/comprobantes/orden";
import { cn } from "@/lib/utils";
import { fmt, STATUS_META, TYPE_META, type EDocument } from "./tipos";

interface Props {
  docs: readonly EDocument[];
  orden: { orden: readonly string[]; refCabecera: (el: HTMLTableSectionElement | null) => void };
  onVer: (d: EDocument) => void;
  /** El alcance: serie, cliente y total se filtran desde el encabezado y se resuelven en la base. */
  filtros: FiltrosComprobantes;
  onCambiar: (f: FiltrosComprobantes) => void;
}

/** La tabla de comprobantes. Tipo y Estado se filtran desde la fila de arriba (una sola vez, también en el celular). */
export function TablaComprobantes({ docs, orden, onVer, filtros, onCambiar }: Props) {
  /* La lista es paginada en el servidor: el orden vive en los filtros y se pide a la base. */
  const actual = filtros.orden;
  const ordenCol: OrdenDeColumnas = {
    activa: actual?.columna ?? null,
    direccion: actual?.dir ?? "desc",
    alternar: (id) => {
      const columna = id as ColumnaOrden;
      const dir = actual?.columna === columna ? (actual.dir === "asc" ? "desc" : "asc") : columna === "cliente" || columna === "serie" ? "asc" : "desc";
      onCambiar({ ...filtros, orden: { columna, dir } });
    },
    ariaSort: (id) => (actual?.columna === id ? (actual.dir === "asc" ? "ascending" : "descending") : "none"),
  };
  return (
    <DataTable className="min-w-[640px]">
      <thead ref={orden.refCabecera}>
        <tr>
          <EnOrden
            orden={orden.orden}
            celdas={{
              serieNro: (
                <ThColumna label="Serie-Nro" dataCol="serieNro" orden={ordenCol} ordenId="serie">
                  <FiltroColumnaTexto label="Serie-Nro" placeholder="Buscar" value={filtros.serie} onChange={(serie) => onCambiar({ ...filtros, serie })} />
                </ThColumna>
              ),
              fecha: <ThColumna label="Fecha" dataCol="fecha" orden={ordenCol} ordenId="fecha" />,
              tipo: <th data-col="tipo">Tipo</th>,
              cliente: (
                <ThColumna label="Cliente" dataCol="cliente" orden={ordenCol} ordenId="cliente">
                  <FiltroColumnaTexto label="Cliente" placeholder="Nombre o RUC" value={filtros.cliente} onChange={(cliente) => onCambiar({ ...filtros, cliente })} />
                </ThColumna>
              ),
              total: (
                <ThColumna label="Total" dataCol="total" orden={ordenCol} ordenId="total">
                  <FiltroColumnaRango
                    label="Total"
                    unidad="S/"
                    paso={1}
                    compacto
                    valor={{ min: filtros.montoMin, max: filtros.montoMax }}
                    onChange={(r) => onCambiar({ ...filtros, montoMin: (r.min as number | null) ?? null, montoMax: (r.max as number | null) ?? null })}
                  />
                </ThColumna>
              ),
              estado: <ThColumna label="Estado" dataCol="estado" orden={ordenCol} ordenId="estado" />,
            }}
          />
          <th></th>
        </tr>
      </thead>
      <tbody>
        {docs.length === 0 && (
          <tr>
            <td colSpan={7} className="py-8 text-center text-sm font-semibold text-[var(--text-tertiary)]" data-qa="comprobantes-sin-coincidencias">
              Ningún comprobante con esos filtros de columna.
            </td>
          </tr>
        )}
        {docs.map(d => {
          const StatusIcon = STATUS_META[d.status].icon;
          return (
            <tr key={d.id}>
              <EnOrden
                orden={orden.orden}
                celdas={{
                  serieNro: <td className="font-mono font-bold">{d.serie}-{d.number}</td>,
                  fecha: <td className="text-[var(--text-secondary)]">{d.date}</td>,
                  tipo: (
                    <td>
                      <span className={cn("text-sm font-bold px-2 py-0.5 rounded-full", TYPE_META[d.type].bg, TYPE_META[d.type].color)}>
                        {TYPE_META[d.type].label}
                      </span>
                    </td>
                  ),
                  cliente: (
                    <td>
                      {d.clientName}<br />
                      <span className="text-sm text-[var(--text-tertiary)]">{d.clientRUC}</span>
                    </td>
                  ),
                  total: <td className="font-bold">{fmt(d.total)}</td>,
                  estado: (
                    <td>
                      <span className={cn("flex items-center gap-1 text-sm font-bold", STATUS_META[d.status].color)}>
                        <StatusIcon className="h-4 w-4" aria-hidden />{STATUS_META[d.status].label}
                      </span>
                    </td>
                  ),
                }}
              />
              <td className="flex items-center gap-1">
                <button
                  aria-label={`Ver ${d.serie}-${d.number}`}
                  onClick={() => onVer(d)}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-primary hover:bg-[var(--surface-sunken)]"
                >
                  <Eye className="h-4 w-4" aria-hidden />
                </button>
                {d.pdfUrl && (
                  <a
                    href={d.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center rounded-xl px-3 text-sm font-bold text-primary hover:bg-[var(--surface-sunken)]"
                    title="Ver PDF"
                  >
                    PDF
                  </a>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
