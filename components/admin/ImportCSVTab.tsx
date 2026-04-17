"use client";

import { useState, useRef } from "react";
import { Upload, FileText, Loader2, AlertCircle, CheckCircle, X, Table } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface CSVRow {
  sku: string;
  nombre: string;
  precio: string;
  stock: string;
  costo: string;
}

interface ImportError {
  row: number;
  message: string;
}

type Phase = "idle" | "uploading" | "preview" | "confirming" | "success" | "error";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => line.split(",").map(c => c.trim()));
  return { headers, rows };
}

const EXPECTED_FIELDS = ["sku", "nombre", "precio", "stock", "costo"];

// ── Component ────────────────────────────────────────────────────────────────

export default function ImportCSVTab() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<string[][]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setErrors([{ row: 0, message: "Solo se aceptan archivos .csv" }]);
      setPhase("error");
      return;
    }
    setPhase("uploading");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);

      // Validate headers
      const missing = EXPECTED_FIELDS.filter(f => !h.includes(f));
      if (missing.length > 0) {
        setErrors([{ row: 0, message: `Columnas faltantes: ${missing.join(", ")}. Se esperan: ${EXPECTED_FIELDS.join(", ")}` }]);
        setPhase("error");
        return;
      }

      setHeaders(h);
      setAllRows(r);
      setPhase("preview");
    };
    reader.onerror = () => {
      setErrors([{ row: 0, message: "Error al leer el archivo" }]);
      setPhase("error");
    };
    reader.readAsText(file);
  };

  const handleConfirm = async () => {
    setPhase("confirming");
    setErrors([]);

    // Map rows to objects based on header order
    const skuIdx = headers.indexOf("sku");
    const nameIdx = headers.indexOf("nombre");
    const priceIdx = headers.indexOf("precio");
    const stockIdx = headers.indexOf("stock");
    const costIdx = headers.indexOf("costo");

    const items: CSVRow[] = allRows.map(row => ({
      sku: row[skuIdx] ?? "",
      nombre: row[nameIdx] ?? "",
      precio: row[priceIdx] ?? "",
      stock: row[stockIdx] ?? "",
      costo: row[costIdx] ?? "",
    }));

    try {
      const res = await fetch("/api/inventory/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.errors && Array.isArray(data.errors)) {
          setErrors(data.errors);
        } else {
          setErrors([{ row: 0, message: data.error ?? "Error del servidor" }]);
        }
        setPhase("error");
        return;
      }

      const data = await res.json();
      setImportedCount(data.imported ?? items.length);
      if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        setErrors(data.errors);
      }
      setPhase("success");
    } catch {
      setErrors([{ row: 0, message: "Error de conexión al importar" }]);
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle");
    setFileName("");
    setHeaders([]);
    setAllRows([]);
    setErrors([]);
    setImportedCount(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const previewRows = allRows.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" /> Importar CSV
        </h3>
        {phase !== "idle" && (
          <button onClick={reset} className="text-xs text-primary font-bold hover:underline">
            Nueva importación
          </button>
        )}
      </div>

      {/* Idle: File input */}
      {phase === "idle" && (
        <div className="bg-white dark:bg-card border-2 border-dashed border-[var(--rule-base)] dark:border-card-border rounded-xl p-8 text-center">
          <Upload className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-700 dark:text-foreground mb-1">
            Selecciona un archivo CSV
          </p>
          <p className="text-xs text-gray-400 dark:text-muted mb-4">
            Columnas esperadas: <code className="bg-gray-100 dark:bg-surface px-1 rounded">sku, nombre, precio, stock, costo</code>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Elegir archivo
          </button>
        </div>
      )}

      {/* Uploading */}
      {phase === "uploading" && (
        <div className="flex items-center justify-center py-12 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-gray-500 dark:text-muted">Leyendo {fileName}...</span>
        </div>
      )}

      {/* Preview */}
      {phase === "preview" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-700 dark:text-foreground flex items-center gap-1">
                <Table className="h-3.5 w-3.5 text-primary" />
                Vista previa — {allRows.length} filas encontradas
              </p>
              <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted">{fileName}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-xs">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)] dark:border-card-border">
                    <th className="pb-2 text-[length:var(--ts-2xs)] font-bold text-gray-400 text-left">#</th>
                    {headers.map(h => (
                      <th key={h} className={cn(
                        "pb-2 text-[length:var(--ts-2xs)] font-bold text-left",
                        EXPECTED_FIELDS.includes(h) ? "text-primary" : "text-gray-400"
                      )}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-t border-gray-50 dark:border-card-border">
                      <td className="py-1.5 text-gray-400">{i + 1}</td>
                      {row.map((cell, j) => (
                        <td key={j} className="py-1.5 text-gray-700 dark:text-foreground">{cell || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {allRows.length > 5 && (
              <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted mt-2 text-center">
                ... y {allRows.length - 5} filas más
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={reset} className="flex-1 py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border text-sm font-bold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface">
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 flex items-center justify-center gap-1"
            >
              <Upload className="h-4 w-4" />
              Confirmar Importación ({allRows.length} productos)
            </button>
          </div>
        </div>
      )}

      {/* Confirming */}
      {phase === "confirming" && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm font-bold text-gray-700 dark:text-foreground">Importando {allRows.length} productos...</p>
          <p className="text-xs text-gray-400 dark:text-muted">No cierres esta ventana</p>
        </div>
      )}

      {/* Success */}
      {phase === "success" && (
        <div className="bg-white dark:bg-card border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 text-center">
          <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-1">
            Importación exitosa
          </p>
          <p className="text-xs text-gray-500 dark:text-muted mb-3">
            {importedCount} producto{importedCount !== 1 ? "s" : ""} importado{importedCount !== 1 ? "s" : ""} correctamente
          </p>
          {errors.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-3 text-left mb-3 border border-amber-200 dark:border-amber-900/30">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                {errors.length} fila{errors.length !== 1 ? "s" : ""} con advertencias:
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {errors.map((err, i) => (
                  <p key={i} className="text-[length:var(--ts-2xs)] text-amber-600 dark:text-amber-500">
                    Fila {err.row}: {err.message}
                  </p>
                ))}
              </div>
            </div>
          )}
          <button onClick={reset} className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            Importar otro archivo
          </button>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="bg-white dark:bg-card border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <X className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-extrabold text-gray-900 dark:text-foreground mb-1">
            Error en la importación
          </p>
          <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-3 text-left mb-3 border border-red-200 dark:border-red-900/30">
            <div className="max-h-32 overflow-y-auto space-y-1">
              {errors.map((err, i) => (
                <p key={i} className="text-[length:var(--ts-2xs)] text-red-600 dark:text-red-400">
                  {err.row > 0 ? `Fila ${err.row}: ` : ""}{err.message}
                </p>
              ))}
            </div>
          </div>
          <button onClick={reset} className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            Intentar de nuevo
          </button>
        </div>
      )}

      {/* Help box */}
      {phase === "idle" && (
        <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-900/30">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">Formato esperado del CSV</p>
          <code className="text-[length:var(--ts-2xs)] text-emerald-600 dark:text-emerald-500 block bg-emerald-100/50 dark:bg-emerald-900/20 rounded-lg p-2">
            sku,nombre,precio,stock,costo<br />
            PRD001,Arroz Extra 5kg,25.50,100,18.00<br />
            PRD002,Aceite Vegetal 1L,12.90,50,9.50
          </code>
        </div>
      )}
    </div>
  );
}
