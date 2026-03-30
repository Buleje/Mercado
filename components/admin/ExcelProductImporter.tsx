"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import { Upload, AlertTriangle, CheckCircle, Loader2, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawRow = Record<string, string>;

type ParsedProduct = {
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  codigoBarras: string;
  _rowIndex: number;
  _errors: string[];
};

type ColumnMap = {
  nombre: string;
  precio: string;
  stock: string;
  categoria: string;
  codigoBarras: string;
};

type ImportResult = {
  imported: number;
  errors: { row: number; nombre: string; error: string }[];
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
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

// ─── Validators ───────────────────────────────────────────────────────────────

function validateProduct(row: RawRow, map: ColumnMap, rowIndex: number): ParsedProduct {
  const errors: string[] = [];

  const nombre = row[map.nombre]?.trim() ?? "";
  if (!nombre) errors.push("Nombre vacío");

  const precioRaw = row[map.precio]?.replace(",", ".") ?? "";
  const precio = parseFloat(precioRaw);
  if (isNaN(precio)) errors.push("Precio inválido");
  else if (precio < 0) errors.push("Precio negativo");

  const stockRaw = row[map.stock]?.trim() ?? "0";
  const stock = parseInt(stockRaw, 10);
  if (isNaN(stock)) errors.push("Stock inválido");

  return {
    nombre,
    precio: isNaN(precio) ? 0 : precio,
    stock: isNaN(stock) ? 0 : stock,
    categoria: row[map.categoria]?.trim() ?? "",
    codigoBarras: row[map.codigoBarras]?.trim() ?? "",
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
  });
  const [parsed, setParsed] = useState<ParsedProduct[]>([]);
  const [step, setStep] = useState<"idle" | "mapping" | "preview" | "importing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    if (!file.name.match(/\.(csv|txt|xlsx?)$/i)) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);
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
        precio: guess(["precio", "price", "valor", "costo"]),
        stock: guess(["stock", "cantidad", "qty", "existencia"]),
        categoria: guess(["categoria", "category", "tipo", "grupo"]),
        codigoBarras: guess(["barras", "barcode", "ean", "codigo"]),
      });
      setStep("mapping");
    };
    reader.readAsText(file, "utf-8");
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

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
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

    const errors: ImportResult["errors"] = [];
    let imported = 0;

    for (let i = 0; i < validProducts.length; i++) {
      const p = validProducts[i];
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: p.nombre,
            price: p.precio,
            stock: p.stock,
            category: p.categoria || "General",
            barcode: p.codigoBarras || undefined,
            unit: "und",
          }),
        });
        if (res.ok) {
          imported++;
        } else {
          const data = await res.json().catch(() => ({}));
          errors.push({ row: p._rowIndex, nombre: p.nombre, error: (data as { error?: string }).error ?? "Error del servidor" });
        }
      } catch {
        errors.push({ row: p._rowIndex, nombre: p.nombre, error: "Error de red" });
      }
      setProgress(Math.round(((i + 1) / validProducts.length) * 100));
    }

    setResult({ imported, errors });
    setStep("done");
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Importar productos desde CSV
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Arrastra un archivo CSV o seleccionalo manualmente
          </p>
        </div>
        {step !== "idle" && (
          <button
            onClick={reset}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
            Reiniciar
          </button>
        )}
      </div>

      {/* Drop zone */}
      {step === "idle" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-colors",
            dragging
              ? "border-[#0f766e] bg-[#0f766e]/5"
              : "border-gray-200 dark:border-gray-700 hover:border-[#0f766e] dark:hover:border-[#0f766e]"
          )}
        >
          <Upload className="h-10 w-10 text-gray-400" />
          <div className="text-center">
            <p className="font-medium text-gray-700 dark:text-gray-300">
              Arrastra tu archivo CSV aqui
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              o haz clic para seleccionar (CSV, TXT)
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {/* Mapping step */}
      {step === "mapping" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#0f766e]" />
            <span className="font-medium text-gray-800 dark:text-gray-200">{fileName}</span>
            <span className="text-sm text-gray-500">· {rawRows.length} filas detectadas</span>
          </div>

          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Asigna las columnas del CSV a los campos del sistema:
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {(
              [
                { key: "nombre", label: "Nombre del producto *" },
                { key: "precio", label: "Precio (S/) *" },
                { key: "stock", label: "Stock inicial" },
                { key: "categoria", label: "Categoria" },
                { key: "codigoBarras", label: "Codigo de barras" },
              ] as { key: keyof ColumnMap; label: string }[]
            ).map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {label}
                </label>
                <select
                  value={columnMap[key]}
                  onChange={(e) =>
                    setColumnMap((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                >
                  <option value="">-- No mapear --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
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
                  ? "bg-[#0f766e] text-white hover:bg-[#235c43]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800"
              )}
            >
              Previsualizar datos
            </button>
          </div>
        </div>
      )}

      {/* Preview step */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              {validCount} productos validos
            </span>
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertTriangle className="h-4 w-4" />
                {errorCount} con errores (no se importaran)
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {["Fila", "Nombre", "Precio", "Stock", "Categoria", "Cod. Barras", "Estado"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left font-medium text-gray-500 dark:text-gray-400"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                {previewRows.map((p) => (
                  <tr
                    key={p._rowIndex}
                    className={cn(
                      p._errors.length > 0
                        ? "bg-red-50 dark:bg-red-900/10"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    )}
                  >
                    <td className="px-4 py-2 text-gray-500">{p._rowIndex}</td>
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {p.nombre || <span className="text-red-500 italic">vacio</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                      {p.precio < 0 ? (
                        <span className="text-red-500">{p.precio}</span>
                      ) : (
                        `S/ ${p.precio.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{p.stock}</td>
                    <td className="px-4 py-2 text-gray-500">{p.categoria || "—"}</td>
                    <td className="px-4 py-2 text-gray-500">{p.codigoBarras || "—"}</td>
                    <td className="px-4 py-2">
                      {p._errors.length === 0 ? (
                        <span className="text-green-600 dark:text-green-400 text-xs font-medium">
                          OK
                        </span>
                      ) : (
                        <span className="text-red-500 text-xs" title={p._errors.join(", ")}>
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
            <p className="text-xs text-gray-500">
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
                  ? "bg-[#0f766e] text-white hover:bg-[#235c43]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800"
              )}
            >
              Importar {validCount} producto{validCount !== 1 ? "s" : ""}
            </button>
            <button
              onClick={() => setStep("mapping")}
              className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Volver al mapeo
            </button>
          </div>
        </div>
      )}

      {/* Importing progress */}
      {step === "importing" && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#0f766e]" />
          <p className="font-medium text-gray-700 dark:text-gray-300">Importando productos...</p>
          <div className="w-full max-w-sm bg-gray-100 dark:bg-gray-800 rounded-full h-3">
            <div
              className="bg-[#0f766e] h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">{progress}% completado</p>
        </div>
      )}

      {/* Done */}
      {step === "done" && result && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                Importacion completada
              </p>
              <p className="text-sm text-gray-500">
                {result.imported} importados · {result.errors.length} errores
              </p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/10 p-4 space-y-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Productos no importados:
              </p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400">
                  Fila {e.row} &mdash; {e.nombre}: {e.error}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={reset}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-[#0f766e] text-white hover:bg-[#235c43] transition-colors"
          >
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
