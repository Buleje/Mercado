"use client";

/**
 * Anexo04Acciones — el pie del modal del ANEXO N° 04: las cuatro salidas del
 * papel (PDF interno detallado, Excel editable, imprimir y el PDF oficial).
 * El botón principal cambia a "Descargar igual" cuando el checklist encontró
 * algo que invalida el documento — avisa, nunca bloquea.
 */
import { Download, FileSpreadsheet, FileText, Printer } from "@buleje/design-system/icons";

const BTN = "inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]";

export default function Anexo04Acciones({
  presentable, generando, onPdfDetallado, onExcel, onImprimir, onDescargar,
}: {
  presentable: boolean;
  generando: boolean;
  /** Sólo desde el cubicador: el PDF interno con tipos y precios. */
  onPdfDetallado?: () => void;
  onExcel: () => void;
  onImprimir: () => void;
  onDescargar: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
      {onPdfDetallado && (
        <button type="button" onClick={onPdfDetallado} title="El PDF interno de siempre: tipos, precios y subtotales" className={BTN}>
          <FileText className="h-4 w-4" /> PDF detallado (interno)
        </button>
      )}
      <button type="button" onClick={onExcel} title="El mismo anexo en Excel, con fórmulas para editarlo antes de imprimir" className={BTN}>
        <FileSpreadsheet className="h-4 w-4" /> Excel del anexo
      </button>
      <button type="button" onClick={onImprimir} className={BTN}>
        <Printer className="h-4 w-4" /> Imprimir
      </button>
      <button
        type="button"
        onClick={onDescargar}
        disabled={generando}
        title={presentable ? "Descargar el ANEXO N° 04" : "Se puede descargar igual (para llenar a mano), pero le faltan datos obligatorios"}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-60"
      >
        <Download className="h-4 w-4" /> {generando ? "Generando…" : presentable ? "Descargar PDF" : "Descargar igual"}
      </button>
    </div>
  );
}
