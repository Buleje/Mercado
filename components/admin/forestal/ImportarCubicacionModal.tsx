"use client";

/**
 * ImportarCubicacionModal — trae un Excel/CSV de piezas y lo suma al lote.
 *
 * El operario elige su archivo (columnas Especie · Espesor · Ancho · Largo, en
 * cualquier orden), ve un PREVIEW de lo que se va a agregar —cuántas piezas,
 * el pie tablar total, y las filas que no se pudieron leer con su motivo— y
 * recién ahí confirma. Nada se agrega a ciegas.
 */
import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Upload, X } from "@buleje/design-system/icons";
import { parsearFilasImportadas, PLANTILLA_IMPORT, type PiezaImportada, type ResultadoImport } from "@/lib/forestal/cubicacion-import";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import { descargarPlantillaImport } from "@/lib/forestal/cubicador-export";

const fmtPt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ImportarCubicacionModal({
  onAgregar, onCerrar,
}: {
  /** Suma las piezas leídas al lote del cubicador. */
  onAgregar: (piezas: PiezaImportada[]) => void;
  onCerrar: () => void;
}) {
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const procesar = useCallback(async (file: File) => {
    setCargando(true);
    setErrorGeneral(null);
    setResultado(null);
    setNombreArchivo(file.name);
    try {
      const filas = await leerArchivoAFilas(file);
      setResultado(parsearFilasImportadas(filas));
    } catch (e) {
      setErrorGeneral(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}. Probá con un .xlsx o .csv.`);
    } finally {
      setCargando(false);
    }
  }, []);

  const [bajando, setBajando] = useState(false);
  const descargarPlantilla = () => {
    // .xlsx real: cada columna en su celda (un CSV se abre en una sola celda con
    // el separador ";" del Excel es-PE). Sin datos: solo los encabezados.
    setBajando(true);
    descargarPlantillaImport(PLANTILLA_IMPORT.headers)
      .catch(() => setErrorGeneral("No se pudo generar la plantilla. Probá de nuevo."))
      .finally(() => setBajando(false));
  };

  const totalPt = resultado?.piezas.reduce((a, p) => a + p.pieTablar, 0) ?? 0;
  const totalPiezas = resultado?.piezas.reduce((a, p) => a + p.cantidad, 0) ?? 0;
  const raras = resultado?.piezas.filter((p) => p.sospechosa).length ?? 0;

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[6vh]" onClick={onCerrar}>
      <div className="w-full max-w-2xl rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            <FileSpreadsheet className="h-5 w-5 text-[var(--accent)]" /> Importar cubicación desde Excel
          </h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          El archivo tiene que tener las columnas <b>Especie · Espesor · Ancho · Largo</b> (y opcional <b>Cantidad</b>), en el orden que quieras. El espesor y el ancho se toman en pulgadas y el largo en pies, salvo que agregues columnas de unidad.
        </p>

        {/* Elegir archivo */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesar(f); e.target.value = ""; }}
            className="hidden"
          />
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95">
            <Upload className="h-4 w-4" /> Elegir archivo
          </button>
          <button type="button" onClick={descargarPlantilla} disabled={bajando} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">
            {bajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar plantilla (Excel)
          </button>
          {nombreArchivo && <span className="truncate text-xs text-[var(--text-tertiary)]">{nombreArchivo}</span>}
        </div>

        {cargando && (
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el archivo…
          </p>
        )}
        {errorGeneral && (
          <p className="mt-4 flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {errorGeneral}
          </p>
        )}

        {/* Preview */}
        {resultado && !cargando && (
          <div className="mt-4 space-y-3">
            {resultado.piezas.length > 0 && (
              <div className="flex flex-wrap items-center gap-4 rounded-xl bg-[var(--data-success-100)] px-4 py-3 dark:bg-[var(--data-success-500)]/12">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                  <Check className="h-4 w-4" /> {resultado.piezas.length} {resultado.piezas.length === 1 ? "fila lista" : "filas listas"} · {totalPiezas} piezas
                </span>
                <span className="font-mono text-sm font-extrabold tabular-nums text-[var(--accent)]">{fmtPt(totalPt)} PT</span>
                {raras > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    <AlertTriangle className="h-3.5 w-3.5" /> {raras} con medidas raras
                  </span>
                )}
              </div>
            )}

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
                  <table className="w-full min-w-[420px] text-sm">
                    <thead className="sticky top-0 bg-[var(--surface-sunken)]">
                      <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                        <th className="px-3 py-2">Cant.</th><th className="px-3 py-2">Medida</th><th className="px-3 py-2">Especie</th><th className="px-3 py-2 text-right">Pie tablar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.piezas.map((p) => (
                        <tr key={p.id} className={`border-t border-[var(--rule-soft)] ${p.sospechosa ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : ""}`}>
                          <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--text-secondary)]">{p.cantidad}</td>
                          <td className="px-3 py-1.5 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                            {p.espesor}×{p.ancho}×{p.largo}
                            {p.sospechosa && <AlertTriangle className="ml-1 inline h-3 w-3 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">{p.especie ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{fmtPt(p.pieTablar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={onCerrar} className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => { onAgregar(resultado.piezas); onCerrar(); }} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95">
                    <Check className="h-4 w-4" /> Agregar {resultado.piezas.length} al lote
                  </button>
                </div>
              </>
            ) : resultado.errores.length > 0 ? null : (
              <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">El archivo no tiene piezas para importar.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
