"use client";

/** Las importaciones hechas, una fila cada una (del audit log: `logActivity("Importar", …)`). */
import { useEffect, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Loader2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { ActivityEntry } from "@/app/api/activity-log/route";
import { cn } from "@/lib/utils";
import { fmtDate, parseImportRecord, type ImportRecord } from "./exportar-datos";

const ESTADO: Record<ImportRecord["status"], string> = {
  success: "text-[var(--data-success-ink)]",
  partial: "text-[var(--data-warning-ink)]",
  error: "text-[var(--data-error-ink)]",
};

export default function HistorialImportacionesModal({ onClose }: { onClose: () => void }) {
  const [filas, setFilas] = useState<ImportRecord[] | null>(null);

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
          <DataTable className="min-w-[32rem]">
            <thead>
              <tr><th>Archivo</th><th>Módulo</th><th className="text-right">Registros</th><th>Estado</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-48 truncate font-semibold text-[var(--text-primary)]">{r.filename}</td>
                  <td className="text-[var(--text-secondary)]">{r.module}</td>
                  <td className="text-right font-bold tabular-nums text-[var(--text-primary)]">{r.records}</td>
                  <td className={cn("text-sm font-semibold", ESTADO[r.status])}>
                    {r.status === "success" ? "Exitoso" : r.status === "partial" ? `${r.errors} errores` : "Error"}
                  </td>
                  <td className="text-sm text-[var(--text-secondary)]">{fmtDate(r.date)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </AdminModal>
  );
}
