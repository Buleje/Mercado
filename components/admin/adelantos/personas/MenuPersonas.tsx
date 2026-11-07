"use client";

/**
 * El «⋯» de la cabecera de Personas: bajar lo que se ve (Excel o CSV) y
 * «Completar datos» en lote. Salió de `PersonasView` (30-10) sin cambiar las
 * dos descargas.
 */

import { Download, FileSpreadsheet, ListChecks, MoreHorizontal } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { descargarCsvPersonas, personasAFilasExcel } from "@/lib/adelantos/exportar-csv";
import type { BeneficiarioConSaldo } from "../crear-adelanto/tipos";

const hoy = () => new Date().toISOString().slice(0, 10);

/* «Bajar a Excel» (30-10): lo que ves, con las mismas columnas del CSV y las cifras como número. */
async function bajarExcel(personas: readonly BeneficiarioConSaldo[]) {
  try {
    const { exportToExcel } = await import("@/lib/export-excel");
    await exportToExcel(personasAFilasExcel(personas), `personas-${hoy()}`, "Personas");
  } catch (err) {
    logger.error("[personas] no se pudo armar el Excel", { error: String(err) });
    toast.error("No se pudo bajar el Excel. Inténtalo otra vez.");
  }
}

export default function MenuPersonas({
  visibles,
  paraCompletar,
  onCompletar,
}: {
  /** Lo que se ve (con tipo, situación, búsqueda y filtros de columna). */
  visibles: readonly BeneficiarioConSaldo[];
  /** Cuántas personas tienen algo por completar (DNI/RUC, celular o tipo). */
  paraCompletar: number;
  /** Sin él (el rol no edita adelantos), no se ofrece completar. */
  onCompletar?: () => void;
}) {
  const n = visibles.length;
  const acciones: MenuAccion[] = [
    ...(onCompletar && paraCompletar > 0
      ? [
          {
            id: "completar",
            label: "Completar datos",
            hint: `${paraCompletar} persona${paraCompletar === 1 ? "" : "s"} sin DNI/RUC, celular o tipo, en una sola lista`,
            icon: ListChecks,
            onSelect: onCompletar,
          },
        ]
      : []),
    {
      id: "excel",
      label: "Bajar a Excel",
      hint: `Las ${n} personas que ves, con sus cifras`,
      icon: FileSpreadsheet,
      disabled: n === 0,
      onSelect: () => void bajarExcel(visibles),
    },
    {
      id: "csv",
      label: "Descargar CSV",
      hint: `Las ${n} personas que ves (con filtro y búsqueda)`,
      icon: Download,
      disabled: n === 0,
      onSelect: () => descargarCsvPersonas(visibles, `personas-${hoy()}.csv`),
    },
  ];
  return <ActionMenu label="Más" icon={MoreHorizontal} soloIcono size="md" className="w-12 shrink-0" actions={acciones} />;
}
