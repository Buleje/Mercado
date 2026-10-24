"use client";

import { useId, useRef } from "react";
import { CardTitle } from "@buleje/design-system";
import { Download, FolderOpen, X } from "@buleje/design-system/icons";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { button } from "@/components/ui-system/button-variants";
import { abrirExpediente } from "./expediente/expediente-url";
import { fmt, STATUS_META, TYPE_META, type EDocument } from "./tipos";

interface Props {
  doc: EDocument | null;
  onCerrar: () => void;
}

export function ModalDetalleComprobante({ doc, onCerrar }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  useModalAccesible(ref, { onCerrar, activo: !!doc });
  const ventana = useVentanaDeModal(!!doc, { ref, aplicarTranslate: true, claveMemoria: "efactura-detalle" });
  if (!doc) return null;

  return (
    <div className="modal-backdrop p-4" role="presentation" onClick={e => e.target === e.currentTarget && !ventana.fijado && onCerrar()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1} className="relative bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3 sm:p-6 w-full max-w-lg space-y-4">
        <div {...ventana.asaProps} className="flex items-center justify-between">
          <CardTitle id={tituloId} className="text-sm font-bold text-[var(--text-primary)]">{doc.serie}-{doc.number}</CardTitle>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button aria-label="Cerrar" onClick={onCerrar} className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)]">
            <X className="h-4 w-4 text-[var(--text-tertiary)]" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {([
            ["Tipo", TYPE_META[doc.type].label],
            ["Fecha", doc.date],
            ["Cliente", doc.clientName],
            ["RUC/DNI", doc.clientRUC],
            ["Subtotal", fmt(doc.subtotal)],
            ["IGV (18%)", fmt(doc.igv)],
            ["Total", fmt(doc.total)],
            ["Items", String(doc.items)],
            ["Estado", STATUS_META[doc.status].label],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k}><p className="text-sm text-[var(--text-tertiary)]">{k}</p><p className="font-bold text-[var(--text-primary)]">{v}</p></div>
          ))}
          {doc.relatedDoc && (
            <div><p className="text-sm text-[var(--text-tertiary)]">Doc. relacionado</p><p className="font-bold text-[var(--text-primary)]">{doc.relatedDoc}</p></div>
          )}
        </div>
        <div>
          <p className="text-sm text-[var(--text-tertiary)] mb-1">Respuesta SUNAT</p>
          <p className="text-sm text-[var(--text-primary)] bg-[var(--surface-sunken)] rounded-xl p-3 font-mono">{doc.sunatResponse}</p>
        </div>
        {/* N03: el comprobante dentro de su operación (pedido, notas, guías, cobro). Sólo lectura. */}
        <button
          type="button"
          data-qa="detalle-ver-expediente"
          onClick={() => {
            const ref = doc.orderId ?? `${doc.serie}-${doc.number}`;
            onCerrar();
            abrirExpediente(ref);
          }}
          className={button({ variant: "secondary", className: "w-full rounded-xl" })}
        >
          <FolderOpen className="h-4 w-4" aria-hidden /> Ver expediente de la operación
        </button>
        {doc.pdfUrl && (
          <a
            href={doc.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 w-full rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Download className="h-4 w-4" /> Descargar PDF
          </a>
        )}
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
