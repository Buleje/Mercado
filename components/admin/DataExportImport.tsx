"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useRef, useCallback } from "react";
import { Download, Upload, CheckCircle, XCircle, FileJson, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ImportResult = {
  imported: { products: number; customers: number };
  errors: string[];
};

type PreviewData = {
  products?: unknown[];
  customers?: unknown[];
};

// ── Componente principal ──────────────────────────────────────────────────────

export default function DataExportImport() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Exportar ─────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/export-all");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error?.message ?? "Error al exportar");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `buleje-export-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setExporting(false);
    }
  }, []);

  // ── Leer archivo ──────────────────────────────────────────────────────────

  const readFile = useCallback((file: File) => {
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string) as PreviewData;
        setPreview(json);
        setPreviewFile(file.name);
      } catch {
        setError("Archivo JSON invalido. Verifica que sea un export de Buleje.");
        setPreview(null);
        setPreviewFile(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file);
    },
    [readFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) readFile(file);
    },
    [readFile],
  );

  // ── Confirmar importación ─────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/import-data", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          products: preview.products,
          customers: preview.customers,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? json?.error ?? "Error al importar");
      }
      setResult(json as ImportResult);
      setPreview(null);
      setPreviewFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setImporting(false);
    }
  }, [preview]);

  const handleClearPreview = useCallback(() => {
    setPreview(null);
    setPreviewFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Sección Exportar ── */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center">
            <Download className="w-5 h-5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="font-semibold text-[var(--text-primary)]">Exportar todos los datos</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              Descarga un JSON con productos, clientes, pedidos (últimos 6 meses), fiados y configuración del negocio.
            </p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className={cn(
                "mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                "bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Download className="w-4 h-4" />
              {exporting ? "Generando..." : "Descargar todo"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Sección Importar ── */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center">
            <Upload className="w-5 h-5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
          </div>
          <div>
            <CardTitle className="font-semibold text-[var(--text-primary)]">Importar datos</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              Sube un archivo JSON con productos y/o clientes para agregar en batch.
            </p>
          </div>
        </div>

        {/* Zona drag-and-drop */}
        {!preview && !result && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              dragOver
                ? "border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"
                : "border-[var(--rule-base)] dark:border-gray-600 hover:border-[var(--data-success-500)]/30 hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]",
            )}
          >
            <FileJson className="w-8 h-8 mx-auto mb-2 text-[var(--text-tertiary)]" />
            <p className="text-sm text-[var(--text-secondary)] font-medium">
              Arrastra un archivo JSON aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">Solo archivos .json exportados desde este sistema</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {/* Preview del archivo */}
        {preview && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <FileJson className="w-4 h-4 text-[var(--data-success-500)]" />
                <span className="font-medium">{previewFile}</span>
              </div>
              <button onClick={handleClearPreview} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors">
                Cancelar
              </button>
            </div>
            <div className="rounded-lg bg-[var(--surface-canvas)]/50 border border-[var(--rule-base)] p-4 space-y-2">
              {(preview.products?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-soft)]" />
                  <span className="text-[var(--text-secondary)]">
                    <strong>{preview.products?.length}</strong> producto(s) para importar
                  </span>
                </div>
              )}
              {(preview.customers?.length ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-soft)]" />
                  <span className="text-[var(--text-secondary)]">
                    <strong>{preview.customers?.length}</strong> cliente(s) para importar
                  </span>
                </div>
              )}
              {(preview.products?.length ?? 0) === 0 && (preview.customers?.length ?? 0) === 0 && (
                <div className="flex items-center gap-2 text-sm text-[var(--data-warning-500)]">
                  <AlertTriangle className="w-4 h-4" />
                  No se encontraron productos ni clientes en el archivo.
                </div>
              )}
            </div>
            <button
              onClick={handleImport}
              disabled={importing || ((preview.products?.length ?? 0) === 0 && (preview.customers?.length ?? 0) === 0)}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                "bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] text-white",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Upload className="w-4 h-4" />
              {importing ? "Importando..." : "Confirmar importación"}
            </button>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className="rounded-lg border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] p-4 space-y-2">
            <div className="flex items-center gap-2 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-medium">
              <CheckCircle className="w-4 h-4" />
              Importación completada
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {result.imported.products} producto(s) y {result.imported.customers} cliente(s) importados.
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                  {result.errors.length} error(es):
                </p>
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-[var(--text-tertiary)] pl-2">• {e}</p>
                ))}
              </div>
            )}
            <button
              onClick={handleClearPreview}
              className="mt-2 text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] hover:underline"
            >
              Importar otro archivo
            </button>
          </div>
        )}
      </div>

      {/* Error global */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 p-4 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
