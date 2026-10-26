"use client";

/**
 * Vista previa de lo leído de un archivo, una foto o un audio, antes de
 * sumarlo al lote. Sacada tal cual de `ImportarCubicacionModal` (mismo DOM).
 */
import { DataTable } from "@buleje/design-system";
import { AlertTriangle } from "@buleje/design-system/icons";
import type { ResultadoImport } from "@/lib/forestal/cubicacion-import";
import { formatNumber } from "@/lib/format";
import type { OrigenImport } from "./cubicador-importar-ayuda";

const fmtPt = (v: number) => formatNumber(v, 2);

export default function VistaPreviaImportacion({ resultado, modo }: { resultado: ResultadoImport; modo: OrigenImport }) {
  return (
    <div className="mt-4 space-y-3">
      {resultado.errores.length > 0 && (
        <div className="rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 dark:bg-[var(--data-warning-500)]/12">
          <p className="mb-1 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            {resultado.errores.length} {resultado.errores.length === 1 ? "fila no se pudo leer" : "filas no se pudieron leer"} (se saltean):
          </p>
          <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-[var(--text-secondary)]">
            {resultado.errores.slice(0, 20).map((e) => (
              <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>
            ))}
          </ul>
        </div>
      )}

      {resultado.piezas.length > 0 ? (
        <>
          <div className="max-h-56 overflow-auto rounded-xl border border-[var(--rule-base)]">
            <DataTable className="w-full min-w-[420px]">
              <thead className="sticky top-0">
                <tr>
                  <th>Cant.</th><th>Medida</th><th>Especie</th><th className="text-right">Pie tablar</th>
                </tr>
              </thead>
              <tbody>
                {resultado.piezas.map((p) => (
                  <tr key={p.id} className={`${p.sospechosa ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : ""}`}>
                    <td className="font-mono tabular-nums text-[var(--text-secondary)]">{p.cantidad}</td>
                    <td className="font-mono font-bold tabular-nums">
                      {p.espesor}×{p.ancho}×{p.largo}
                      {p.sospechosa && <AlertTriangle className="ml-1 inline h-3 w-3 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />}
                    </td>
                    <td className="text-[var(--text-secondary)]">{p.especie ?? "—"}</td>
                    <td className="text-right font-mono tabular-nums">{fmtPt(p.pieTablar)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </>
      ) : resultado.errores.length > 0 ? null : (
        <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">
          {modo === "excel" ? "El archivo no tiene piezas para importar." : modo === "foto" ? "No se identificó ninguna pieza en la foto." : "No se identificó ninguna pieza en el audio."}
        </p>
      )}
    </div>
  );
}
