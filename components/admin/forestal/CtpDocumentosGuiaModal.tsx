"use client";

/**
 * CtpDocumentosGuiaModal — los papeles de UNA guía de ingreso, cada uno en su
 * casillero (ADR-438): factura, guía de remisión del remitente, guía del
 * transportista, lista de trozas, GTF y otros.
 *
 * Pedido de Brandon (2026-09-26): «un apartado para agregar documentos (fotos,
 * PDF, etc.) con un casillero para cada uno». Los archivos quedan en el Drive,
 * en la carpeta del titular y su permiso (ADR-442), con su N° de guía: el
 * expediente que pide una fiscalización ya está armado al recibir el camión.
 *
 * Lo abren el menú «Más» de la guía, el chip «3/6 docs» de la fila y el botón
 * «Documentos» de una guía guardada antes del ingreso. La grilla vive en
 * `CtpDocumentosGuiaCasilleros` (la misma que usa la guía guardada).
 */

import { FolderOpen } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import CtpDocumentosGuiaCasilleros from "./CtpDocumentosGuiaCasilleros";

export interface CtpDocumentosGuiaModalProps {
  gtf: string;
  /** Una línea bajo el título («COMUNIDAD NATIVA SANTA ROSA»). */
  contexto?: string;
  onClose: () => void;
  /** Cambió cuántos casilleros tienen archivo: la tabla actualiza su chip. */
  onCambio?: (llenos: number) => void;
  /** Abrir el «Documento de la guía» (la GTF que arma el sistema). */
  onArmarGtf?: () => void;
}

export default function CtpDocumentosGuiaModal({
  gtf,
  contexto,
  onClose,
  onCambio,
  onArmarGtf,
}: CtpDocumentosGuiaModalProps) {
  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Documentos de la guía ${gtf}`}
      description={contexto}
      icon={FolderOpen}
      variant="wide"
      claveVentana="ctp-documentos-guia"
    >
      <div className={MODAL_BODY}>
        <CtpDocumentosGuiaCasilleros gtf={gtf} onCambio={onCambio} onArmarGtf={onArmarGtf} />
      </div>
    </AdminModal>
  );
}
