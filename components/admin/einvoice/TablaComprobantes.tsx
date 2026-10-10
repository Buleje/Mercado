"use client";

import { DataTable } from "@buleje/design-system";
import { Eye } from "@buleje/design-system/icons";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { cn } from "@/lib/utils";
import { fmt, STATUS_META, TYPE_META, type EDocument } from "./tipos";

interface Props {
  docs: readonly EDocument[];
  orden: { orden: readonly string[]; refCabecera: (el: HTMLTableSectionElement | null) => void };
  onVer: (d: EDocument) => void;
}

/** La tabla de comprobantes. Tipo y Estado se filtran desde la fila de arriba (una sola vez, también en el celular). */
export function TablaComprobantes({ docs, orden, onVer }: Props) {
  return (
    <DataTable className="min-w-[640px]">
      <thead ref={orden.refCabecera}>
        <tr>
          <EnOrden
            orden={orden.orden}
            celdas={{
              serieNro: <th data-col="serieNro">Serie-Nro</th>,
              fecha: <th data-col="fecha">Fecha</th>,
              tipo: <th data-col="tipo">Tipo</th>,
              cliente: <th data-col="cliente">Cliente</th>,
              total: <th data-col="total">Total</th>,
              estado: <th data-col="estado">Estado</th>,
            }}
          />
          <th></th>
        </tr>
      </thead>
      <tbody>
        {docs.map(d => {
          const StatusIcon = STATUS_META[d.status].icon;
          return (
            <tr key={d.id}>
              <EnOrden
                orden={orden.orden}
                celdas={{
                  serieNro: <td className="font-mono font-bold text-[var(--text-primary)]">{d.serie}-{d.number}</td>,
                  fecha: <td className="text-[var(--text-secondary)]">{d.date}</td>,
                  tipo: (
                    <td>
                      <span className={cn("text-sm font-bold px-2 py-0.5 rounded-full", TYPE_META[d.type].bg, TYPE_META[d.type].color)}>
                        {TYPE_META[d.type].label}
                      </span>
                    </td>
                  ),
                  cliente: (
                    <td className="text-[var(--text-primary)]">
                      {d.clientName}<br />
                      <span className="text-sm text-[var(--text-tertiary)]">{d.clientRUC}</span>
                    </td>
                  ),
                  total: <td className="font-bold text-[var(--text-primary)]">{fmt(d.total)}</td>,
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
