import { Check, Copy, Undo2 } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { codigoFisicoPendiente, formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import type { DbDocument } from "@/lib/types/documents";
import type { ExtraDelMenu } from "./MenuDocumento";

/**
 * ADR-516 — «Copiar código» y «Marcar como registrado» / «Quitar registrado»
 * en el «⋯» y el clic derecho de un papel, sin abrirlo. Sin código no hay nada.
 * `marcar` es el `marcarCodigoFisico` del hook (cambia la lista al instante).
 */
export function extrasRegistrado(
  doc: DbDocument,
  marcar: (ids: string[], puesto: boolean) => Promise<number>,
): ExtraDelMenu[] {
  const codigo = formatoCodigoDocumento(doc.codigo);
  if (!codigo) return [];
  const pendiente = codigoFisicoPendiente(doc);
  return [
    {
      id: "copiar-codigo",
      label: "Copiar código",
      Icon: Copy,
      onSelect: () => {
        navigator.clipboard?.writeText(codigo)
          .then(() => toast.success(`${codigo} copiado`))
          .catch((err) => console.warn("[documentos] no pude copiar el código", err));
      },
    },
    {
      id: "registrado",
      label: pendiente ? "Marcar como registrado" : "Quitar registrado",
      Icon: pendiente ? Check : Undo2,
      onSelect: () => {
        marcar([doc.id], pendiente)
          .then((n) => { if (n === 0) toast.info("No se pudo cambiar: revisa que tenga código."); })
          .catch((err) => {
            console.warn("[documentos] no pude marcar el registro", err);
            toast.error("No se pudo guardar. Prueba otra vez.");
          });
      },
    },
  ];
}
