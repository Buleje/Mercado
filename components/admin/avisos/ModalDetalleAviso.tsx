"use client";

import { ExternalLink } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { cerrarAlNavegar } from "@/components/admin/forestal/enlace-cierra-ventana";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { cuando, esAClientes, estadoAviso, linkWhatsApp, numeroCorto, paraQuien, rotuloTipo, type Aviso } from "./tipos";

interface Props {
  aviso: Aviso | null;
  onCerrar: () => void;
}

/**
 * El aviso entero: el mensaje que salió, a quién, cuándo y cómo terminó.
 * «Abrir WhatsApp» arma el mismo texto otra vez, sólo si lo guardado ES el
 * mensaje: los «Link listo» guardan «WhatsApp link generado: estado → …» y los
 * que fallaron guardan el error — mandar eso al cliente sería un disparate.
 */
export function ModalDetalleAviso({ aviso, onCerrar }: Props) {
  const link = aviso && aviso.status === "sent" && esAClientes(aviso.type) ? linkWhatsApp(aviso.recipient, aviso.message) : null;
  const estado = aviso ? estadoAviso(aviso.status) : null;
  return (
    <AdminModal
      open={!!aviso}
      onClose={onCerrar}
      title={aviso ? rotuloTipo(aviso.type) : "Aviso"}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary", className: "rounded-xl" })}>
            Cerrar
          </button>
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className={button({ variant: "primary", className: "rounded-xl" })}>
              <ExternalLink className="h-4 w-4" aria-hidden />
              Abrir WhatsApp
            </a>
          )}
        </div>
      }
    >
      {aviso && estado && (
        <div className={cn(MODAL_BODY, "space-y-4")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--text-secondary)]">Para</dt>
            <dd className="font-medium tabular-nums text-[var(--text-primary)]">{paraQuien(aviso.recipient)}</dd>
            <dt className="text-[var(--text-secondary)]">Cuándo</dt>
            <dd className="text-[var(--text-primary)]">{cuando(aviso.createdAt)}</dd>
            <dt className="text-[var(--text-secondary)]">Estado</dt>
            <dd className={cn("font-semibold", estado.clase)}>{estado.rotulo}</dd>
            {aviso.orderId && (
              <>
                <dt className="text-[var(--text-secondary)]">Pedido</dt>
                <dd>
                  <EnlacePanel cosa="pedido" id={aviso.orderId} onClick={cerrarAlNavegar(onCerrar)}>{numeroCorto(aviso.orderId)}</EnlacePanel>
                </dd>
              </>
            )}
          </dl>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-[var(--surface-sunken)] p-3 text-sm leading-relaxed text-[var(--text-primary)]">
            {aviso.message}
          </p>
        </div>
      )}
    </AdminModal>
  );
}
