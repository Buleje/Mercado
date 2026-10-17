"use client";

/**
 * La vista previa de un documento del plan: el MISMO visor del módulo
 * Documentos (PDF, foto, Word, Excel, versiones, vencimiento), montado dentro
 * de un `AdminModal` a pantalla completa con `aboveModals`.
 *
 * Por qué el envoltorio: el visor es un modal escrito a mano (`z-modal`, sin
 * portal). Abierto desde el formulario del plan —que es un `AdminModal`— se
 * pintaba detrás, y Radix apaga los clics y se queda con el foco de todo lo que
 * no sea su diálogo («se lagea», memoria `modales-anidados-z-index-radix`).
 * Dentro de un diálogo Radix propio, la pila de capas la maneja Radix: Escape
 * cierra sólo el visor y el plan queda como estaba. `fullscreen` no se centra
 * con `translate`, así que el `fixed inset-0` del visor sigue siendo la
 * pantalla entera.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { DbDocumentFolder } from "@/lib/types/documents";

/** El visor pesa (PDF.js, planillas, presentaciones): entra sólo al abrir un archivo. */
const DocumentPreviewModal = dynamic(
  () => import("@/components/admin/documentos/DocumentPreviewModal").then((m) => m.DocumentPreviewModal),
  { ssr: false, loading: () => <p className="py-16 text-center text-sm text-white">Abriendo el documento…</p> },
);

export default function VistaPreviaDoc({
  docId,
  onClose,
  onCambio,
}: {
  docId: string | null;
  onClose: () => void;
  /** El visor cambió algo (vencimiento, nombre, papelera): hay que releer. */
  onCambio?: () => void;
}) {
  /* Las carpetas del Drive, para que el visor diga DÓNDE está el archivo
     («Libro TH › titular › plan › Jefe…»). Sin ellas decía «Sin carpeta» de
     un papel que sí tiene. Se piden al abrir el primero, una vez. */
  const [carpetas, setCarpetas] = useState<DbDocumentFolder[] | undefined>(undefined);
  const abierto = docId != null;
  useEffect(() => {
    if (!abierto || carpetas) return;
    let vivo = true;
    fetch("/api/admin/documents/folders", { credentials: "include", headers: csrfHeaders() })
      .then((r) => (r.ok ? leerJson<{ folders?: DbDocumentFolder[] }>(r) : null))
      .then((j) => {
        if (vivo && j?.folders) setCarpetas(j.folders);
      })
      .catch((err: unknown) => logger.warn("[plan-documentos] no se pudieron leer las carpetas del Drive", { error: String(err) }));
    return () => {
      vivo = false;
    };
  }, [abierto, carpetas]);

  return (
    <AdminModal
      open={abierto}
      onClose={onClose}
      variant="fullscreen"
      aboveModals
      hideCloseButton
      className="bg-transparent shadow-none"
    >
      {docId && <DocumentPreviewModal docId={docId} onClose={onClose} onRefresh={onCambio} folders={carpetas} />}
    </AdminModal>
  );
}
