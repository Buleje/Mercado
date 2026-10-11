"use client";

/**
 * Mi Plata › Impuestos y reportes › Importar y exportar: los DATOS CRUDOS de
 * cada módulo (respaldo o para otro sistema) y la carga de productos de golpe.
 * Lo armado para el contador (libros, reportes con totales) vive en «Para el
 * contador».
 *
 * Antes (medido 11-10): tres pestañas internas (Descargar/Subir/Historial),
 * siete tarjetas con «Excel» en blanco sobre turquesa al 10 % (no se leía),
 * «Proveedores» y «Gastos» que siempre decían «No hay datos» y un «Subir» que
 * ofrecía siete destinos y cargaba todo como productos.
 */
import { useState } from "react";
import { toast } from "sonner";
import { SectionTitle } from "@buleje/design-system";
import { BookOpen, Download, FileSpreadsheet, History, Loader2, MoreHorizontal, Upload } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { exportToCSV } from "@/lib/utils";
import { EXPORT_MODULES, downloadExcel, fetchModuleData } from "./importar-exportar/exportar-datos";
import SubirProductosModal from "./importar-exportar/SubirProductosModal";
import HistorialImportacionesModal from "./importar-exportar/HistorialImportacionesModal";

const BOTON = "inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors aria-disabled:opacity-60";

export default function ImportExportTab() {
  const [exportando, setExportando] = useState<string | null>(null);
  const [subir, setSubir] = useState(false);
  const [historial, setHistorial] = useState(false);

  const exportar = async (id: string, formato: "csv" | "excel") => {
    if (exportando) return;
    setExportando(`${id}-${formato}`);
    try {
      const filas = await fetchModuleData(id);
      if (filas.length === 0) { toast.info("No hay datos para bajar."); return; }
      const nombre = `${id}_${new Date().toISOString().slice(0, 10)}`;
      if (formato === "csv") exportToCSV(filas as Record<string, string | number | boolean | null | undefined>[], nombre);
      else downloadExcel(filas, nombre);
    } catch {
      toast.error("No se pudo bajar. Intenta de nuevo.");
    } finally {
      setExportando(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Una fila: título · Subir productos · Más */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Importar y exportar</SectionTitle>
          <InfoTip
            title="Importar y exportar"
            what="Baja los datos de cada módulo tal como están (para respaldo o para pasarlos a otro sistema) y sube productos de golpe desde un Excel."
            affects="Para tu contador están los libros de ventas y compras del mes en «Para el contador»."
            example="Bajas «Productos» en Excel, corriges precios y lo vuelves a subir."
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setSubir(true)} className={`${BOTON} bg-[var(--accent-dark)] px-4 font-bold text-white hover:brightness-110`}>
            <Upload className="h-4 w-4" aria-hidden /> Subir productos
          </button>
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title="Historial de importaciones, libros para el contador"
            actions={[
              { id: "historial", label: "Historial de importaciones", hint: "Cada archivo subido, con sus filas y errores", icon: History, onSelect: () => setHistorial(true) },
              { id: "contador", label: "Libros para el contador", hint: "Registro de ventas y de compras del mes", icon: BookOpen, seccion: "Ver", onSelect: () => irAEnlace("/admin?tab=plata&vista=contador") },
            ]}
          />
        </div>
      </div>

      {/* Una fila por módulo: qué trae y sus dos formatos. */}
      <ul className="divide-y divide-[var(--rule-soft)] rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {EXPORT_MODULES.map(({ id, label, hint, icon: Icono }) => (
          <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
            <Icono className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
              <p className="truncate text-sm text-[var(--text-secondary)]">{hint}</p>
            </div>
            <button
              type="button"
              onClick={() => void exportar(id, "excel")}
              aria-disabled={exportando !== null}
              aria-label={`Bajar ${label} en Excel`}
              className={`${BOTON} border border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]`}
            >
              {exportando === `${id}-excel` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-4 w-4" aria-hidden />} Excel
            </button>
            <button
              type="button"
              onClick={() => void exportar(id, "csv")}
              aria-disabled={exportando !== null}
              aria-label={`Bajar ${label} en CSV`}
              className={`${BOTON} text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]`}
            >
              {exportando === `${id}-csv` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />} CSV
            </button>
          </li>
        ))}
      </ul>

      {subir && <SubirProductosModal onClose={() => setSubir(false)} onImportado={() => undefined} />}
      {historial && <HistorialImportacionesModal onClose={() => setHistorial(false)} />}
    </div>
  );
}
