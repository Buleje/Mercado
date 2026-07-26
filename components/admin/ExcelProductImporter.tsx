"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import {
  Upload, AlertTriangle, CheckCircle, Loader2, X, FileText, Download,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { activateProps } from "@/components/admin/shared/a11y";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawRow = Record<string, string | number | null | undefined>;

type ParsedProduct = {
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  codigoBarras: string;
  precioCosto?: number;
  stockMinimo?: number;
  unidad: string;
  _rowIndex: number;
  _errors: string[];
};

type ColumnMap = {
  nombre: string;
  precio: string;
  stock: string;
  categoria: string;
  codigoBarras: string;
  precioCosto: string;
  stockMinimo: string;
  unidad: string;
};

type ImportResult = {
  created: number;
  errors: { row: number; message: string }[];
};

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: RawRow[] } {
  const separator = text.includes(";") ? ";" : ",";
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(separator).map((h) => h.trim().replace(/^"(.*)"$/, "$1"));
  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(separator).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    const row: RawRow = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });
    rows.push(row);
  }

  return { headers, rows };
}

// ─── XLSX parser (dynamic import) ────────────────────────────────────────────
// Usa exceljs en lugar de xlsx (vuln Prototype Pollution + ReDoS sin fix — ADR-025)

async function parseXLSX(file: File): Promise<{ headers: string[]; rows: RawRow[] }> {
  const ExcelJS = (await import("exceljs")).default;
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const rows: RawRow[] = [];
  let headers: string[] = [];

  // Tipos inline minimos porque el tipo Row de exceljs solo es accesible desde
  // un import top-level estatico, y aqui usamos dynamic import por bundle size.
  sheet.eachRow({ includeEmpty: false }, (row: { values: unknown }, rowNumber: number) => {
    const values = (row.values as unknown[]).slice(1); // exceljs es 1-indexed
    const cells = values.map((v): string | number | null | undefined => {
      if (v === null || v === undefined) return "";
      if (typeof v === "object" && v !== null && "richText" in (v as object)) {
        return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
      }
      if (typeof v === "object" && v !== null && "result" in (v as object)) {
        const r = (v as { result: unknown }).result;
        return typeof r === "string" || typeof r === "number" ? r : String(r ?? "");
      }
      if (typeof v === "string" || typeof v === "number") return v;
      return String(v);
    });

    if (rowNumber === 1) {
      headers = cells.map((c) => String(c ?? ""));
    } else {
      const obj: RawRow = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = cells[i];
      }
      rows.push(obj);
    }
  });

  return { headers, rows };
}

// ─── Validators ───────────────────────────────────────────────────────────────

function toNum(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val).replace(",", "."));
  return isNaN(n) ? null : n;
}

function validateProduct(row: RawRow, map: ColumnMap, rowIndex: number): ParsedProduct {
  const errors: string[] = [];

  const nombre = String(row[map.nombre] ?? "").trim();
  if (!nombre) errors.push("Nombre vacío");

  const precioRaw = toNum(row[map.precio]);
  if (precioRaw === null) errors.push("Precio inválido");
  else if (precioRaw < 0) errors.push("Precio negativo");

  const stockRaw = toNum(row[map.stock]);

  const precioCostoRaw = map.precioCosto ? toNum(row[map.precioCosto]) : null;
  const stockMinimoRaw = map.stockMinimo ? toNum(row[map.stockMinimo]) : null;
  const unidad = String(row[map.unidad] ?? "").trim() || "unidad";

  return {
    nombre,
    precio: precioRaw ?? 0,
    stock: stockRaw !== null ? Math.round(stockRaw) : 0,
    categoria: String(row[map.categoria] ?? "").trim() || "General",
    codigoBarras: String(row[map.codigoBarras] ?? "").trim(),
    precioCosto: precioCostoRaw !== null && precioCostoRaw !== undefined ? precioCostoRaw : undefined,
    stockMinimo: stockMinimoRaw !== null && stockMinimoRaw !== undefined ? Math.round(stockMinimoRaw) : undefined,
    unidad,
    _rowIndex: rowIndex,
    _errors: errors,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExcelProductImporter() {
  const [dragging, setDragging] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [columnMap, setColumnMap] = useState<ColumnMap>({
    nombre: "",
    precio: "",
    stock: "",
    categoria: "",
    codigoBarras: "",
    precioCosto: "",
    stockMinimo: "",
    unidad: "",
  });
  const [parsed, setParsed] = useState<ParsedProduct[]>([]);
  const [step, setStep] = useState<"idle" | "mapping" | "preview" | "importing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(csv|txt|xlsx?)$/i)) return;
    setFileName(file.name);

    let headers: string[] = [];
    let rows: RawRow[] = [];

    if (file.name.match(/\.xlsx?$/i)) {
      const result = await parseXLSX(file);
      headers = result.headers;
      rows = result.rows;
    } else {
      const text = await file.text();
      const result = parseCSV(text);
      headers = result.headers;
      rows = result.rows;
    }

    setHeaders(headers);
    setRawRows(rows);

    // Auto-map columns by guessing
    const guess = (candidates: string[]): string => {
      for (const c of candidates) {
        const found = headers.find((h) => h.toLowerCase().includes(c));
        if (found) return found;
      }
      return "";
    };

    setColumnMap({
      nombre: guess(["nombre", "name", "producto", "descripcion"]),
      precio: guess(["precio", "price", "valor"]),
      stock: guess(["stock", "cantidad", "qty", "existencia"]),
      categoria: guess(["categoria", "category", "tipo", "grupo"]),
      codigoBarras: guess(["barras", "barcode", "ean", "codigo"]),
      precioCosto: guess(["costo", "cost", "precio_costo"]),
      stockMinimo: guess(["mínimo", "stock_min", "stockmin"]),
      unidad: guess(["unidad", "unit", "um", "medida"]),
    });

    setStep("mapping");
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await loadFile(file);
  };

  const buildPreview = () => {
    const products = rawRows.map((row, i) => validateProduct(row, columnMap, i + 2));
    setParsed(products);
    setStep("preview");
  };

  const runImport = async () => {
    const validProducts = parsed.filter((p) => p._errors.length === 0);
    setStep("importing");
    setProgress(0);

    // Construir FormData con un archivo sintético para el endpoint batch
    const rows = validProducts.map((p) => ({
      nombre: p.nombre,
      categoria: p.categoria,
      precio: p.precio,
      precio_costo: p.precioCosto,
      stock: p.stock,
      stock_mínimo: p.stockMinimo,
      unidad: p.unidad,
      codigo_barras: p.codigoBarras || undefined,
    }));

    try {
      // Importar usando el endpoint batch /api/products/import
      // Usa exceljs (no xlsx) — ADR-025
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Productos");
      if (rows.length > 0) {
        ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
        for (const row of rows) {
          ws.addRow(row);
        }
      }
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const fd = new FormData();
      fd.append("file", blob, "import.xlsx");

      setProgress(30);
      const res = await fetch("/api/products/import", { method: "POST", body: fd });
      setProgress(90);

      const data = (await res.json()) as ImportResult & { error?: string };

      if (!res.ok) {
        setResult({ created: 0, errors: [{ row: 0, message: data.error ?? "Error del servidor" }] });
      } else {
        setResult({ created: data.created, errors: data.errors ?? [] });
      }
      setProgress(100);
    } catch {
      setResult({ created: 0, errors: [{ row: 0, message: "Error de red" }] });
      setProgress(100);
    }

    setStep("done");
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const res = await fetch("/api/products/import");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "plantilla-productos.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const reset = () => {
    setStep("idle");
    setHeaders([]);
    setRawRows([]);
    setFileName("");
    setParsed([]);
    setResult(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const previewRows = parsed.slice(0, 10);
  const errorCount = parsed.filter((p) => p._errors.length > 0).length;
  const validCount = parsed.length - errorCount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
            Importar productos desde Excel / CSV
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">
            Arrastra un archivo .xlsx o .csv, o seleccionalo manualmente
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            disabled={downloadingTemplate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-[var(--accent-ink)] dark:text-[var(--accent)] border border-primary/30 hover:bg-primary/5 transition-colors disabled:opacity-50"
            title="Descargar plantilla Excel"
          >
            <Download className="h-4 w-4" />
            {downloadingTemplate ? "Descargando…" : "Plantilla"}
          </button>
          {step !== "idle" && (
            <button
              onClick={reset}
              className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)]"
            >
              <X className="h-4 w-4" />
              Reiniciar
            </button>
          )}
        </div>
      </div>

      {/* Drop zone */}
      {step === "idle" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          {...activateProps(() => fileRef.current?.click())}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 cursor-pointer transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-[var(--rule-base)] hover:border-primary dark:hover:border-primary"
          )}
        >
          <Upload className="h-10 w-10 text-[var(--text-tertiary)]" />
          <div className="text-center">
            <p className="font-medium text-[var(--text-secondary)]">
              Arrastra tu archivo aqui
            </p>
            <p className="text-sm text-[var(--text-tertiary)]">
              Acepta .xlsx, .xls, .csv, .txt — máximo 1000 filas
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {/* Mapping step */}
      {step === "mapping" && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 space-y-5">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-medium text-[var(--text-primary)]">{fileName}</span>
            <span className="text-sm text-[var(--text-secondary)]">· {rawRows.length} filas detectadas</span>
          </div>

          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Asigna las columnas del archivo a los campos del sistema:
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(
              [
                { key: "nombre", label: "Nombre del producto *" },
                { key: "precio", label: "Precio (S/) *" },
                { key: "stock", label: "Stock inicial" },
                { key: "categoria", label: "Categoria" },
                { key: "codigoBarras", label: "Codigo de barras" },
                { key: "precioCosto", label: "Precio costo" },
                { key: "stockMinimo", label: "Stock mínimo" },
                { key: "unidad", label: "Unidad" },
              ] as { key: keyof ColumnMap; label: string }[]
            ).map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-secondary)]">{label}</label>
                <select
                  value={columnMap[key]}
                  onChange={(e) => setColumnMap((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">-- No mapear --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={buildPreview}
              disabled={!columnMap.nombre || !columnMap.precio}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-colors",
                columnMap.nombre && columnMap.precio
                  ? "bg-primary text-white hover:bg-[#235c43]"
                  : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed dark:bg-gray-800"
              )}
            >
              Previsualizar datos
            </button>
          </div>
        </div>
      )}

      {/* Preview step */}
      {step === "preview" && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
              <CheckCircle className="h-4 w-4" />
              {validCount} productos validos
            </span>
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-[var(--data-error-500)]">
                <AlertTriangle className="h-4 w-4" />
                {errorCount} con errores (no se importaran)
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-sunken)]">
                <tr>
                  {["Fila", "Nombre", "Precio", "Costo", "Stock", "Stock min.", "Categoria", "Unidad", "Cod. Barras", "Estado"].map(
                    (h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-[var(--text-tertiary)] whitespace-nowrap">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-[var(--surface-raised)]">
                {previewRows.map((p) => (
                  <tr
                    key={p._rowIndex}
                    className={cn(
                      p._errors.length > 0 ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10" : "hover:bg-[var(--surface-sunken)]/50"
                    )}
                  >
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{p._rowIndex}</td>
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                      {p.nombre || <span className="text-[var(--data-error-500)] italic">vacio</span>}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {p.precio < 0 ? (
                        <span className="text-[var(--data-error-500)]">{p.precio}</span>
                      ) : (
                        `S/ ${Number(p.precio).toFixed(2)}`
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">
                      {p.precioCosto != null ? `S/ ${Number(p.precioCosto).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{p.stock}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{p.stockMinimo ?? "—"}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{p.categoria || "—"}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{p.unidad}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{p.codigoBarras || "—"}</td>
                    <td className="px-3 py-2">
                      {p._errors.length === 0 ? (
                        <span className="text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-xs font-medium">OK</span>
                      ) : (
                        <span className="text-[var(--data-error-500)] text-xs" title={p._errors.join(", ")}>
                          {p._errors.join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parsed.length > 10 && (
            <p className="text-xs text-[var(--text-secondary)]">
              Mostrando 10 de {parsed.length} filas. Se importaran todas las validas.
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={runImport}
              disabled={validCount === 0}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-colors",
                validCount > 0
                  ? "bg-primary text-white hover:bg-[#235c43]"
                  : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed dark:bg-gray-800"
              )}
            >
              Importar {validCount} producto{validCount !== 1 ? "s" : ""}
            </button>
            <button
              onClick={() => setStep("mapping")}
              className="px-5 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]"
            >
              Volver al mapeo
            </button>
          </div>
        </div>
      )}

      {/* Importing progress */}
      {step === "importing" && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-medium text-[var(--text-secondary)]">Importando productos...</p>
          <div className="w-full max-w-sm bg-[var(--surface-sunken)] rounded-full h-3">
            <div
              className="bg-primary h-3 rounded-full transition-all duration-[var(--dur-slow)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{progress}% completado</p>
        </div>
      )}

      {/* Done */}
      {step === "done" && result && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-[var(--data-success-500)]" />
            <div>
              <p className="font-semibold text-[var(--text-primary)]">Importacion completada</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {result.created} creados · {result.errors.length} errores
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 p-4 space-y-1 max-h-40 overflow-y-auto">
              <p className="text-sm font-medium text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">Filas no importadas:</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                  {e.row > 0 ? `Fila ${e.row} — ` : ""}{e.message}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={reset}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-[#235c43] transition-colors"
          >
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
