"use client";

/**
 * LothLineaAcciones — lo que se hace con UNA línea del libro.
 *
 * Eran cinco botones-ícono por fila (ver, cadena, duplicar, corregir, anular):
 * ~200 px de la tabla, más que las columnas de medidas juntas, y apretaban la
 * fecha hasta partirla en tres renglones. Queda a la vista el que se usa en
 * cada revisión —ver la línea— y el resto va al menú de la fila, cada uno con
 * la frase que explica qué hace (mismo patrón que las tablas del Libro CTP).
 */

import { Ban, Copy, Eye, MoreHorizontal, PencilLine, Share2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { IconAction } from "@/components/admin/shared/module-primitives";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

export default function LothLineaAcciones({
  e,
  mesCerrado,
  onDetalle,
  onCadena,
  onDuplicar,
  onCorregir,
  onAnular,
}: {
  e: LothEntryDTO;
  /** El período está cerrado: la línea es inmutable (invariante P1). */
  mesCerrado: boolean;
  onDetalle: (e: LothEntryDTO) => void;
  onCadena: (code: string) => void;
  onDuplicar: (e: LothEntryDTO) => void;
  onCorregir: (e: LothEntryDTO) => void;
  onAnular: (e: LothEntryDTO) => void;
}) {
  const codigo = e.trozaCode || e.treeCode;
  const editable = e.status !== "anulado" && !mesCerrado;

  const acciones: MenuAccion[] = [];
  if (codigo) {
    acciones.push({
      id: "cadena",
      label: "Cadena de custodia",
      hint: "Todo lo que pasó con este árbol o troza, del bosque a la guía",
      icon: Share2,
      onSelect: () => onCadena(codigo),
    });
  }
  if (editable) {
    acciones.push(
      {
        id: "duplicar",
        label: "Duplicar",
        hint: "Registra otra línea partiendo de ésta",
        icon: Copy,
        onSelect: () => onDuplicar(e),
      },
      {
        id: "corregir",
        label: "Corregir",
        hint: "Subsanación SERFOR: se asienta una línea nueva y ésta queda",
        icon: PencilLine,
        onSelect: () => onCorregir(e),
      },
      {
        id: "anular",
        label: "Anular",
        hint: "No se borra: queda visible con su motivo",
        icon: Ban,
        tone: "danger",
        onSelect: () => onAnular(e),
      },
    );
  }

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <IconAction
        icon={Eye}
        label={`Ver el detalle de la línea N° ${e.lineNo}`}
        onClick={() => onDetalle(e)}
      />
      {acciones.length > 0 && (
        <ActionMenu
          label={`Más acciones de la línea N° ${e.lineNo}`}
          title={`Más acciones de la línea N° ${e.lineNo}`}
          icon={MoreHorizontal}
          size="sm"
          soloIcono
          actions={acciones}
        />
      )}
    </div>
  );
}
