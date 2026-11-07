import { Check, Copy, Undo2 } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { codigoFisicoPendiente, formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import type { DbDocument } from "@/lib/types/documents";
import { ubicacionRecienMarcada } from "@/hooks/use-documents";
import type { ExtraDelMenu } from "./MenuDocumento";

type Marcar = (ids: string[], puesto: boolean) => Promise<number>;

/**
 * Marca (o quita) «el código ya está en la hoja física» y lo DICE: antes sólo
 * avisaba si fallaba, y Brandon (31-10) leyó el menú cerrándose sin aviso como
 * «no hace nada». Al marcar, el aviso trae «Deshacer» por si fue el papel de al lado
 * y, si quedó con ubicación (la suya o la de su carpeta, ADR-526), dónde guardarlo.
 */
export function marcarRegistradoConAviso(doc: Pick<DbDocument, "id" | "codigo">, marcar: Marcar, puesto: boolean): void {
  const codigo = formatoCodigoDocumento(doc.codigo) ?? "El papel";
  marcar([doc.id], puesto)
    .then((n) => {
      if (n === 0) { toast.info("No se pudo cambiar: revisa que tenga código."); return; }
      if (puesto) {
        const donde = ubicacionRecienMarcada(doc.id);
        toast.success(`${codigo} registrado: ya está en la hoja física${donde ? ` · guárdalo en ${donde}` : ""}`, {
          action: { label: "Deshacer", onClick: () => marcarRegistradoConAviso(doc, marcar, false) },
        });
      } else {
        toast.success(`${codigo} vuelve a «Por registrar»`);
      }
    })
    .catch((err) => {
      console.warn("[documentos] no pude marcar el registro", err);
      toast.error("No se pudo guardar. Prueba otra vez.");
    });
}

/**
 * ADR-516 — «Copiar código» y «Marcar como registrado» / «Quitar registrado»
 * en el «⋯» y el clic derecho de un papel, sin abrirlo. Sin código no hay nada.
 * `marcar` es el `marcarCodigoFisico` del hook (cambia la lista al instante).
 */
export function extrasRegistrado(doc: DbDocument, marcar: Marcar): ExtraDelMenu[] {
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
          // Copiar es el paso previo a escribirlo en el papel: el aviso ya ofrece marcarlo.
          .then(() => toast.success(`${codigo} copiado`, pendiente
            ? { action: { label: "Ya lo anoté", onClick: () => marcarRegistradoConAviso(doc, marcar, true) } }
            : undefined))
          .catch((err) => console.warn("[documentos] no pude copiar el código", err));
      },
    },
    {
      id: "registrado",
      label: pendiente ? "Marcar como registrado" : "Quitar registrado",
      Icon: pendiente ? Check : Undo2,
      onSelect: () => marcarRegistradoConAviso(doc, marcar, pendiente),
    },
  ];
}
