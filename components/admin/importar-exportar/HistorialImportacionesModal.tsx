"use client";

/** Las importaciones hechas, una fila cada una (del audit log: `logActivity("Importar", …)`). */
import { useEffect, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { ActivityEntry } from "@/app/api/activity-log/route";
import { BarraFiltrosTabla, FiltroEnCabecera, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { cn, limaDateKey } from "@/lib/utils";
import { fmtDate, parseImportRecord, type ImportRecord } from "./exportar-datos";

const ESTADO: Record<ImportRecord["status"], string> = {
  success: "text-[var(--data-success-ink)]",
  partial: "text-[var(--data-warning-ink)]",
  error: "text-[var(--data-error-ink)]",
};

const textoEstado = (r: ImportRecord) => (r.status === "success" ? "Exitoso" : r.status === "partial" ? `${r.errors} errores` : "Error");
const ddmm = (v: number | string) => String(v).slice(0, 10).split("-").reverse().join("/");

/** Autofiltros de Excel (25-10): el archivo se busca, módulo y estado se eligen, registros y fecha de–a. */
const COLUMNAS_FILTRO: readonly ColumnaFiltro<ImportRecord>[] = [
  { id: "archivo", label: "Archivo", tipo: "texto", valor: (r) => r.filename },
  { id: "modulo", label: "Módulo", tipo: "multi", valor: (r) => r.module },
  { id: "registros", label: "Registros", tipo: "rango", numero: (r) => r.records, paso: 1 },
  { id: "estado", label: "Estado", tipo: "multi", valor: (r) => (r.status === "partial" ? "Con errores" : textoEstado(r)) },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (r) => limaDateKey(r.date) || null, formatearValor: ddmm },
];

export default function HistorialImportacionesModal({ onClose }: { onClose: () => void }) {
  const [filas, setFilas] = useState<ImportRecord[] | null>(null);
  const f = useFiltrosTabla(filas ?? [], COLUMNAS_FILTRO);

  useEffect(() => {
    fetch("/api/activity-log?action=Importar&limit=50", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: ActivityEntry[] }) => setFilas(d.items.map(parseImportRecord).filter((r): r is ImportRecord => r != null)))
      .catch(() => setFilas([]));
  }, []);

  return (
    <AdminModal open onClose={onClose} title="Historial de importaciones" variant="wide">
      <div className={MODAL_BODY}>
        {filas === null ? (
          <p className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
          </p>
        ) : filas.length === 0 ? (
          <p className="py-6 text-sm text-[var(--text-secondary)]">Todavía no importaste ningún archivo.</p>
        ) : (
          <>
          <BarraFiltrosTabla f={f} />
          <DataTable className="min-w-[32rem]">
            <thead className="[&_th]:align-top">
              <tr>
                <th>Archivo<FiltroEnCabecera id="archivo" f={f} compacto /></th>
                <th>Módulo<FiltroEnCabecera id="modulo" f={f} compacto /></th>
                <th className="text-right">Registros<FiltroEnCabecera id="registros" f={f} compacto /></th>
                <th>Estado<FiltroEnCabecera id="estado" f={f} compacto /></th>
                <th>Fecha<FiltroEnCabecera id="fecha" f={f} compacto /></th>
              </tr>
            </thead>
            <tbody>
              {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
              {f.filtradas.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-48 truncate font-semibold">{r.filename}</td>
                  <td className="text-[var(--text-secondary)]">{r.module}</td>
                  <td className="text-right font-bold tabular-nums">{r.records}</td>
                  <td className={cn("font-semibold", ESTADO[r.status])}>
                    {textoEstado(r)}
                  </td>
                  <td className="text-[var(--text-secondary)]">{fmtDate(r.date)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          </>
        )}
      </div>
    </AdminModal>
  );
}
