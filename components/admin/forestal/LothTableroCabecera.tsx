"use client";

/**
 * La cabecera del Control del permiso en UNA fila (ley de Brandon §6): el
 * título con su ⓘ y las dos acciones — «Escanear troza», que en el patio es LA
 * acción (primera y rellena), y «Exportar Excel», que a 400 px queda en ícono
 * para no partir la fila.
 */

import { useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { FileSpreadsheet, Loader2, ScanBarcode } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import type { CaratulaTablero } from "./LothTableroTrozas";

export default function LothTableroCabecera({
  filas,
  caratula,
  cargando,
  onEscanear,
}: {
  filas: readonly TrozaTablero[];
  caratula?: CaratulaTablero | null;
  cargando: boolean;
  onEscanear: () => void;
}) {
  const [exportando, setExportando] = useState(false);
  const [errorExport, setErrorExport] = useState<string | null>(null);

  const exportar = async () => {
    setExportando(true);
    setErrorExport(null);
    try {
      const { exportarTableroExcel } = await import("@/lib/forestal/loth-tablero-export");
      await exportarTableroExcel(filas, caratula);
    } catch (err) {
      console.error("[loth-tablero] export Excel falló", err);
      setErrorExport("No se pudo armar el Excel. Vuelve a intentarlo.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      {/* El riel de arriba ya dice cómo se llama la vista; el título de la
          pantalla suma lo que contesta, en vez de repetir el nombre. */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SectionTitle className="text-[var(--text-primary)]">Control del permiso</SectionTitle>
          <InfoTip
            title="Control del permiso"
            what="Qué pasó con cada troza amparada por este título habilitante."
            affects="La que sigue en el patio, la que ya salió con GTF y la que se consumió adentro."
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEscanear}
            disabled={filas.length === 0}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-600)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ScanBarcode className="h-5 w-5" aria-hidden="true" />
            Escanear troza
          </button>
          <button
            type="button"
            onClick={exportar}
            disabled={exportando || filas.length === 0 || cargando}
            aria-label="Exportar Excel"
            title="Todas las trozas del permiso con todas las columnas, más una hoja resumen por estado"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSpreadsheet
                className="h-4 w-4 text-[var(--data-success-700)]"
                aria-hidden="true"
              />
            )}
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>
        </div>
      </header>
      {errorExport && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)]">
          {errorExport}
        </p>
      )}
    </>
  );
}
