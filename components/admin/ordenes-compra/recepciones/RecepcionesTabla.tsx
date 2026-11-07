"use client";

import { DataTable, LoadingState } from "@buleje/design-system";
import { Camera, CheckCircle2, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import OrigenDeRecepcion from "@/components/admin/ordenes-compra/recepciones/OrigenDeRecepcion";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import { STATUS_MAP, fmtDate, getDiscrepancies, type Reception } from "@/components/admin/ordenes-compra/recepciones/tipos";
import type { Recepciones } from "@/components/admin/ordenes-compra/recepciones/use-recepciones";

/**
 * La tabla de Recepciones (a 400 px se vuelve tarjetas sola, por
 * `useMobileTableCards`). Los títulos se arrastran para reordenar columnas; los
 * filtros viven en la fila de arriba (antes también en cada título). Clic en la
 * fila: el detalle.
 */
export default function RecepcionesTabla({ r, onVer }: { r: Recepciones; onVer: (rec: Reception) => void }) {
  const { loading, filtered, ordenRecepciones, proveedorIdDe, hayFiltros, receptions } = r;
  if (loading) return <LoadingState />;
  return (
    <DataTable filtrable className="min-w-[720px]">
      <thead ref={ordenRecepciones.refCabecera}>
        <tr>
          <EnOrden
            orden={ordenRecepciones.orden}
            celdas={{
              ref: <th data-col="ref">Recepción</th>,
              proveedor: <th data-col="proveedor">Proveedor</th>,
              programada: <th data-col="programada">Programada</th>,
              recibida: <th data-col="recibida">Llegó</th>,
              inspector: <th data-col="inspector">Aceptó</th>,
              estado: <th data-col="estado">Estado</th>,
              fotos: <th data-col="fotos" className="text-center">Fotos</th>,
              nc: <th data-col="nc" className="text-center" title="No conformidades">NC</th>,
            }}
          />
          <th><span className="sr-only">Ver</span></th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(rec => {
          const discrepancies = getDiscrepancies(rec.items);
          return (
            <tr
              key={rec.id}
              tabIndex={0}
              onClick={(e) => { if (!(e.target instanceof Element && e.target.closest("a, button"))) onVer(rec); }}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onVer(rec); } }}
              aria-label={`Recepción ${rec.ref} de ${rec.supplier}`}
              className="cursor-pointer"
            >
              <EnOrden
                orden={ordenRecepciones.orden}
                celdas={{
                  ref: (
                    <td>
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-bold text-[var(--text-primary)]">{rec.ref}</div>
                        <OrigenDeRecepcion rec={rec} className="block max-w-[11rem] truncate text-sm text-[var(--text-secondary)]" />
                      </div>
                    </td>
                  ),
                  proveedor: (
                    <td className="font-semibold">
                      <EnlacePanel cosa="proveedor" id={proveedorIdDe.get(rec.supplier)} apariencia="heredada">{rec.supplier}</EnlacePanel>
                    </td>
                  ),
                  programada: <td className="whitespace-nowrap text-[var(--text-secondary)]">{fmtDate(rec.scheduledDate)}</td>,
                  recibida: <td className="whitespace-nowrap text-[var(--text-secondary)]">{rec.receivedDate ? fmtDate(rec.receivedDate) : "—"}</td>,
                  inspector: <td className="text-[var(--text-secondary)]">{rec.inspector || "—"}</td>,
                  estado: (
                    <td>
                      <span className={cn("whitespace-nowrap rounded-lg px-2 py-1 text-sm font-semibold", STATUS_MAP[rec.status].bg, STATUS_MAP[rec.status].color)}>
                        {STATUS_MAP[rec.status].label}
                      </span>
                    </td>
                  ),
                  fotos: (
                    <td className="text-center">
                      {rec.photos > 0 ? (
                        <span className="inline-flex items-center justify-center gap-1 text-sm text-[var(--text-secondary)]">
                          <Camera className="h-4 w-4" aria-hidden />{rec.photos}
                        </span>
                      ) : <span className="text-sm text-[var(--text-tertiary)]">—</span>}
                    </td>
                  ),
                  nc: (
                    <td className="text-center">
                      {rec.nonConformities > 0 ? (
                        <span className="rounded-lg bg-[var(--data-error-100)] px-2 py-1 text-sm font-semibold text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/30">
                          {rec.nonConformities}
                        </span>
                      ) : discrepancies.length === 0 ? (
                        <CheckCircle2 className="mx-auto h-4 w-4 text-[var(--data-success-500)]" aria-label="Sin no conformidades" />
                      ) : null}
                    </td>
                  ),
                }}
              />
              <td className="text-right">
                <button
                  type="button"
                  aria-label={`Ver la recepción ${rec.ref}`}
                  onClick={() => onVer(rec)}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </td>
            </tr>
          );
        })}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={9} className="text-center text-[var(--text-secondary)]">
              {hayFiltros || receptions.length > 0 ? "Ninguna recepción coincide con los filtros." : "Todavía no has recibido mercadería."}
            </td>
          </tr>
        )}
      </tbody>
    </DataTable>
  );
}
