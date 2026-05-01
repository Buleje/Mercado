"use client";

/**
 * BulkImportModal — UI para subir productos en masa desde CSV.
 *
 * Flujo:
 *   1. Drop / click → seleccionar archivo CSV.
 *   2. Parser client-side (parseProductsCsv) — sin enviar nada todavía.
 *   3. Preview: tabla con primeras N filas, conteo válidas, headers desconocidos.
 *   4. Click "Importar" → POST /api/admin/products/bulk-import.
 *   5. Resultado: created / skipped / errors[].
 *
 * Sin librerías externas (no papaparse, no xlsx) — el parser propio cubre
 * CSV/TSV con auto-detección de separador y aliases en español/inglés.
 */

import { useCallback, useRef, useState } from "react";
import {
  Upload,
  X,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
} from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  parseProductsCsv,
  getTemplateCsv,
  type ParsedProductRow,
} from "@/lib/csv/parse-products";

type ImportResult = {
  ok: boolean;
  created: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  message?: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Callback opcional para refrescar la lista de productos del padre. */
  onImported?: (created: number) => void;
}

export default function BulkImportModal({ open, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedProductRow[]>([]);
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const reset = () => {
    setFileName(null);
    setRows([]);
    setUnknownHeaders([]);
    setParseError(null);
    setResult(null);
  };

  const closeAndReset = () => {
    reset();
    onClose();
  };

  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    setResult(null);
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) {
      setParseError("Solo archivos .csv o .tsv. Para Excel exportá como CSV primero.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setParseError("Archivo demasiado grande (máx 5MB).");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseProductsCsv(text);
      if (parsed.rows.length === 0) {
        setParseError("El archivo está vacío o no se reconoció ninguna fila.");
        return;
      }
      if (parsed.rows.length > 2000) {
        setParseError(`Máximo 2000 filas por archivo. Este tiene ${parsed.rows.length}.`);
        return;
      }
      setFileName(file.name);
      setRows(parsed.rows);
      setUnknownHeaders(parsed.unknownHeaders);
    } catch (e) {
      setParseError(`No se pudo leer el archivo: ${(e as Error).message}`);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const submit = async () => {
    if (rows.length === 0 || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/products/bulk-import", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ rows, skipDuplicates }),
      });
      const json = (await res.json().catch(() => ({}))) as ImportResult & { error?: string };
      if (!res.ok && !json.created) {
        setResult({
          ok: false,
          created: 0,
          skipped: json.skipped ?? 0,
          errors: json.errors ?? [{ row: 0, message: json.error ?? `HTTP ${res.status}` }],
          message: json.error,
        });
      } else {
        setResult({
          ok: !!json.ok,
          created: json.created ?? 0,
          skipped: json.skipped ?? 0,
          errors: json.errors ?? [],
          message: json.message,
        });
        if (json.created && onImported) onImported(json.created);
      }
    } catch (e) {
      setResult({
        ok: false,
        created: 0,
        skipped: 0,
        errors: [{ row: 0, message: (e as Error).message }],
      });
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([getTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-productos-buleje.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  const previewRows = rows.slice(0, 8);
  const REQUIRED = ["name", "category", "price"];
  const missingRequired = rows.length > 0
    ? REQUIRED.filter((k) => !Object.prototype.hasOwnProperty.call(rows[0]!, k))
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-import-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={closeAndReset}
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[var(--rule-soft)]">
          <div>
            <h2 id="bulk-import-title" className="text-lg font-black text-[var(--text-primary)] tracking-tight">
              Importar productos desde CSV
            </h2>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              Subí un archivo .csv o .tsv (máx 5MB · 2000 filas)
            </p>
          </div>
          <button
            type="button"
            onClick={closeAndReset}
            aria-label="Cerrar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Drop zone — solo si no hay archivo cargado */}
          {!fileName && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                className={[
                  "rounded-xl border-2 border-dashed p-8 sm:p-12 text-center cursor-pointer transition-all",
                  dragActive
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--rule-base)] hover:border-[var(--accent)]/60 hover:bg-[var(--surface-sunken)]",
                ].join(" ")}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                <p className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  Arrastrá tu CSV acá o hacé click
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Detecta automáticamente separadores (`,` `;` `\t`) y headers en ES/EN
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline font-bold"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={2} />
                  Descargar plantilla CSV
                </button>
                <span className="text-[var(--text-tertiary)]">
                  Columnas mínimas: <code className="font-mono">name, category, price</code>
                </span>
              </div>
            </>
          )}

          {parseError && (
            <div className="rounded-lg bg-[var(--data-error)]/10 border border-[var(--data-error)]/30 px-4 py-3 text-sm text-[var(--data-error)] flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
              <span>{parseError}</span>
            </div>
          )}

          {/* Preview cuando hay archivo cargado */}
          {fileName && rows.length > 0 && !result && (
            <>
              <div className="flex items-center justify-between rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-soft)] px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} />
                  <span className="text-sm font-bold text-[var(--text-primary)] truncate">{fileName}</span>
                  <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0">
                    · {rows.length} filas
                  </span>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--data-error)]"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  Quitar
                </button>
              </div>

              {missingRequired.length > 0 && (
                <div className="rounded-lg bg-[var(--data-error)]/10 border border-[var(--data-error)]/30 px-4 py-3 text-sm text-[var(--data-error)] flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
                  <span>
                    Faltan columnas obligatorias: <strong>{missingRequired.join(", ")}</strong>
                  </span>
                </div>
              )}

              {unknownHeaders.length > 0 && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={2} />
                  <span>
                    Columnas ignoradas (no reconocidas): <strong>{unknownHeaders.join(", ")}</strong>
                  </span>
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-[var(--rule-soft)]">
                <table className="w-full text-xs">
                  <thead className="bg-[var(--surface-sunken)] text-[var(--text-tertiary)] uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Nombre</th>
                      <th className="px-3 py-2 text-left">Categoría</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2 text-left">Unidad</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule-soft)]">
                    {previewRows.map((r, i) => (
                      <tr key={i} className="hover:bg-[var(--surface-sunken)]">
                        <td className="px-3 py-2 tabular-nums text-[var(--text-tertiary)]">{i + 1}</td>
                        <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{r.name}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{r.category}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)] font-bold">
                          S/ {r.price ?? "?"}
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{r.unit ?? "unidad"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                          {r.stock ?? "0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > previewRows.length && (
                  <p className="px-3 py-2 text-center text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] bg-[var(--surface-sunken)]">
                    + {rows.length - previewRows.length} filas más (no mostradas)
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="h-4 w-4 rounded accent-[var(--accent)]"
                />
                Omitir duplicados (por nombre o código de barras)
              </label>
            </>
          )}

          {/* Resultado post-import */}
          {result && (
            <div
              className={[
                "rounded-xl border p-5",
                result.ok
                  ? "bg-[var(--data-success)]/10 border-[var(--data-success)]/30"
                  : "bg-[var(--data-error)]/10 border-[var(--data-error)]/30",
              ].join(" ")}
            >
              <div className="flex items-start gap-3 mb-3">
                {result.ok ? (
                  <CheckCircle2 className="h-6 w-6 text-[var(--data-success)] shrink-0" strokeWidth={2} />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-[var(--data-error)] shrink-0" strokeWidth={2} />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-[var(--text-primary)]">
                    {result.ok ? "Importación completa" : "Importación con errores"}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {result.message ??
                      `${result.created} creados, ${result.skipped} duplicados omitidos, ${result.errors.length} errores.`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-3">
                  <p className="text-xl font-black text-[var(--data-success)] tabular-nums">{result.created}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-bold tracking-wider mt-0.5">Creados</p>
                </div>
                <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-3">
                  <p className="text-xl font-black text-[var(--text-secondary)] tabular-nums">{result.skipped}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-bold tracking-wider mt-0.5">Omitidos</p>
                </div>
                <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-soft)] p-3">
                  <p className="text-xl font-black text-[var(--data-error)] tabular-nums">{result.errors.length}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase font-bold tracking-wider mt-0.5">Errores</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <details className="mt-4">
                  <summary className="text-sm font-bold text-[var(--data-error)] cursor-pointer">
                    Ver errores ({result.errors.length})
                  </summary>
                  <ul className="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs">
                    {result.errors.map((e, i) => (
                      <li key={i} className="rounded bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-3 py-1.5 font-mono">
                        <span className="text-[var(--text-tertiary)]">Fila {e.row}:</span>{" "}
                        <span className="text-[var(--text-primary)]">{e.message}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          <button
            type="button"
            onClick={closeAndReset}
            className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
          >
            {result ? "Cerrar" : "Cancelar"}
          </button>
          {!result && (
            <button
              type="button"
              onClick={submit}
              disabled={rows.length === 0 || submitting || missingRequired.length > 0}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                  Importando…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" strokeWidth={2.25} />
                  Importar {rows.length} {rows.length === 1 ? "producto" : "productos"}
                </>
              )}
            </button>
          )}
          {result?.ok && (
            <button
              type="button"
              onClick={() => { reset(); }}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-bold hover:opacity-90"
            >
              Importar otro archivo
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
