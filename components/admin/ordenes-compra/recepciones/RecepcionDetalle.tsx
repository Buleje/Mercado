"use client";

import type { RefObject } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, Camera, CheckCircle2, PackageCheck, X, XCircle } from "@buleje/design-system/icons";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import type { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import OrigenDeRecepcion from "@/components/admin/ordenes-compra/recepciones/OrigenDeRecepcion";
import { textoVence } from "@/lib/compras/lotes-recepcion";
import { fechasDeRecepcion } from "@/lib/compras/conformidad-recepcion";
import { claveDeDia, diaCorto } from "@/lib/compras/ciclo-oc";
import { cn } from "@/lib/utils";
import { COND_MAP, getDiscrepancies, type Reception } from "@/components/admin/ordenes-compra/recepciones/tipos";

/** La ventana con el checklist de una recepción. Salió de `ReceivingTab` (10-10); sus hooks de modal siguen en el padre. */
export default function RecepcionDetalle({
  detail, setDetail, detailPanelRef, detailTitleId, ventanaDetalle, proveedorIdDe,
}: {
  detail: Reception;
  setDetail: (r: Reception | null) => void;
  detailPanelRef: RefObject<HTMLDivElement | null>;
  detailTitleId: string;
  ventanaDetalle: ReturnType<typeof useVentanaDeModal>;
  proveedorIdDe: ReadonlyMap<string, string | null>;
}) {
  return (
    <div className="modal-backdrop p-4" onClick={(e) => { if (e.target === e.currentTarget && !ventanaDetalle.fijado) setDetail(null); }}>
      <div
        ref={detailPanelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={detailTitleId}
        tabIndex={-1}
        className="relative bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-6 w-full max-w-2xl space-y-4 max-h-[85vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div {...ventanaDetalle.asaProps} className="flex items-start justify-between">
          <div>
            <CardTitle id={detailTitleId} className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{detail.ref}</CardTitle>
            <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
              <OrigenDeRecepcion rec={detail} /> ·{" "}
              <EnlacePanel cosa="proveedor" id={proveedorIdDe.get(detail.supplier)} apariencia="heredada">{detail.supplier}</EnlacePanel>
            </p>
            <FechasDeRecepcion rec={detail} />
          </div>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventanaDetalle} />
            <button type="button" aria-label="Cerrar" onClick={() => setDetail(null)} className="inline-flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)]">
              <X className="h-4 w-4 text-[var(--text-tertiary)]" />
            </button>
          </span>
        </div>

        {/* Discrepancy alert */}
        {getDiscrepancies(detail.items).length > 0 && (
          <div className="flex items-start gap-2 text-sm bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] px-3 py-2 rounded-xl">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>{getDiscrepancies(detail.items).length} discrepancia{getDiscrepancies(detail.items).length !== 1 ? "s" : ""}</strong> detectadas en esta recepción.
            </span>
          </div>
        )}

        {/* Checklist table */}
        <DataTable className="min-w-[520px]">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-center">Esperado</th>
                <th className="text-center">Recibido</th>
                <th>Condición</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((it, i) => (
                <tr key={i} className={cn(it.condition !== "ok" && "bg-[var(--data-error-50)]/30 dark:bg-[var(--data-error-500)]/10")}>
                  <td className="font-bold">
                    <EnlacePanel cosa="producto" id={it.productId != null ? String(it.productId) : null} apariencia="heredada">{it.product}</EnlacePanel>
                  </td>
                  <td className="text-[var(--text-secondary)] text-center">{it.expectedQty}</td>
                  <td className={cn("font-bold text-center",
                    it.receivedQty < it.expectedQty ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]"
                  )}>
                    {it.receivedQty}
                    {it.receivedQty !== it.expectedQty && (
                      <span className="ml-1 text-sm">({it.receivedQty > it.expectedQty ? "+" : ""}{it.receivedQty - it.expectedQty})</span>
                    )}
                  </td>
                  <td>
                    <span className={cn("text-sm font-bold px-2 py-0.5 rounded-full", COND_MAP[it.condition].bg, COND_MAP[it.condition].color)}>
                      {COND_MAP[it.condition].label}
                    </span>
                  </td>
                  <td className="text-[var(--text-tertiary)]">
                    {it.notes || (it.expiryDate ? null : "—")}
                    {it.expiryDate && (
                      <span className="block font-semibold text-[var(--text-secondary)]">
                        Vence {textoVence(it.expiryDate)}{it.lote ? ` · Lote ${it.lote}` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>

        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
          {detail.invoiceUrl && (
            <a href={detail.invoiceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold text-primary hover:underline">
              <PackageCheck className="h-4 w-4" /> Ver factura
            </a>
          )}
          {detail.photos > 0 && (
            <span className="flex items-center gap-1"><Camera className="h-4 w-4" /> {detail.photos} fotos</span>
          )}
          {detail.nonConformities > 0 && (
            <span className="flex items-center gap-1 text-[var(--data-error-500)]"><XCircle className="h-4 w-4" /> {detail.nonConformities} no conformidades</span>
          )}
          {detail.nonConformities === 0 && (
            <span className="flex items-center gap-1 text-[var(--data-success-500)]"><CheckCircle2 className="h-4 w-4" /> Sin no conformidades</span>
          )}
        </div>
        <TiradorDeVentana ventana={ventanaDetalle} />
      </div>
    </div>
  );
}

const dia = (v: string | null) => { const k = claveDeDia(v); return k ? diaCorto(k) : "—"; };

/** C22 · Programada, llegada y aceptación separadas (antes sólo «Inspector»). */
function FechasDeRecepcion({ rec }: { rec: Reception }) {
  const f = fechasDeRecepcion(rec);
  const aceptacion = f.estadoAceptacion === "rechazada" ? "Rechazada"
    : f.estadoAceptacion === "pendiente" ? "Sin aceptar"
    : `${f.estadoAceptacion === "parcial" ? "Aceptada en parte" : "Aceptada"} ${dia(f.aceptada)}${rec.inspector ? ` por ${rec.inspector}` : ""}`;
  return (
    <p data-qa="fechas-recepcion" className="text-sm text-[var(--text-tertiary)]">
      Programada {dia(f.programada)} · Llegó {dia(f.llego)} · {aceptacion}
    </p>
  );
}
