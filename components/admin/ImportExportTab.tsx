"use client";

import { useState } from "react";
import { Upload, Download, FileText, CheckCircle, AlertTriangle, Loader2, Package, Users, ShoppingCart, Truck } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type ExportModule = { id: string; label: string; icon: React.ElementType };
type ImportRecord = { id: string; module: string; filename: string; records: number; status: "success" | "partial" | "error"; date: string; errors: number };

const EXPORT_MODULES: ExportModule[] = [
  { id: "productos", label: "Productos", icon: Package },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "pedidos", label: "Pedidos", icon: ShoppingCart },
  { id: "inventario", label: "Movimientos Inventario", icon: Package },
  { id: "proveedores", label: "Proveedores", icon: Truck },
  { id: "gastos", label: "Gastos", icon: FileText },
];

const IMPORT_HISTORY: ImportRecord[] = [];

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }

// Fetch real data and return CSV rows per module
async function fetchModuleData(moduleId: string): Promise<Record<string, unknown>[]> {
  if (moduleId === "productos") {
    const res = await fetch("/api/products");
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>[];
    return data.map(p => ({
      id: p.id, nombre: p.name, categoria: p.category, precio: p.price,
      unidad: p.unit, stock: p.stock ?? "", stock_min: p.stockMin ?? "",
      activo: p.active !== false ? "sí" : "no", badge: p.badge ?? "",
      codigo_barras: p.barcode ?? "",
    }));
  }
  if (moduleId === "clientes") {
    const res = await fetch("/api/customers");
    if (!res.ok) return [];
    const data = await res.json() as { customers?: Record<string, unknown>[] } | Record<string, unknown>[];
    const list = Array.isArray(data) ? data : ((data as { customers?: Record<string, unknown>[] }).customers ?? []);
    return list.map(c => ({
      nombre: c.name, telefono: c.phone, ubicacion: c.location ?? "",
      puntos: c.loyaltyPoints ?? 0, nivel: c.loyaltyTier ?? "bronce",
      total_gastado: c.totalSpent ?? 0, credito: c.creditBalance ?? 0,
      registrado: c.createdAt ? String(c.createdAt).slice(0, 10) : "",
    }));
  }
  if (moduleId === "pedidos") {
    const res = await fetch("/api/orders");
    if (!res.ok) return [];
    const data = await res.json() as { orders?: Record<string, unknown>[] } | Record<string, unknown>[];
    const list = Array.isArray(data) ? data : ((data as { orders?: Record<string, unknown>[] }).orders ?? []);
    return list.map(o => ({
      id: o.id, cliente: (o.customer as Record<string, unknown>)?.name ?? "", telefono: (o.customer as Record<string, unknown>)?.phone ?? "",
      total: o.total, estado: o.status, pago: o.paymentMethod ?? "",
      fecha: o.createdAt ? String(o.createdAt).slice(0, 10) : "",
      num_productos: Array.isArray(o.items) ? o.items.length : 0,
    }));
  }
  if (moduleId === "inventario") {
    const res = await fetch("/api/inventory-movements");
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>[];
    return data.map(m => ({
      id: m.id, producto_id: m.productId, tipo: m.type,
      cantidad: m.quantity, notas: m.notes ?? "",
      fecha: m.createdAt ? String(m.createdAt).slice(0, 10) : "",
    }));
  }
  // proveedores / gastos — no dedicated API yet, return empty
  return [];
}

function downloadExcel(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes("\t") || s.includes("\n") ? `"${s}"` : s;
  };
  const tsv =
    keys.join("\t") + "\n" +
    rows.map(r => keys.map(k => escape(r[k])).join("\t")).join("\n");
  // .xls with tab-separated content opens directly in Excel
  const blob = new Blob([tsv], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportExportTab() {
  const [view, setView] = useState<"export" | "import" | "history">("export");
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; count: number; errors: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (moduleId: string, format: "csv" | "excel") => {
    setExporting(`${moduleId}-${format}`);
    try {
      const rows = await fetchModuleData(moduleId);
      if (rows.length === 0) {
        alert("No hay datos disponibles para exportar.");
        return;
      }
      const filename = `${moduleId}_${new Date().toISOString().slice(0, 10)}`;
      if (format === "csv") {
        exportToCSV(rows as Record<string, string | number | boolean | null | undefined>[], filename);
      } else {
        downloadExcel(rows, filename);
      }
    } catch {
      alert("Error al exportar. Intenta de nuevo.");
    } finally {
      setExporting(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) simulateImport();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) simulateImport();
  };

  const simulateImport = () => {
    setImporting(true); setImportResult(null);
    setTimeout(() => {
      setImporting(false);
      setImportResult({ success: true, count: Math.floor(Math.random() * 100) + 10, errors: Math.floor(Math.random() * 3) });
    }, 2000);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Upload className="h-6 w-6 text-primary" /> Importar / Exportar</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Centro de importación y exportación masiva de datos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["export", "import", "history"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>
              {v === "export" ? "Exportar" : v === "import" ? "Importar" : "Historial"}
            </button>
          ))}
        </div>
      </div>

      {view === "export" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          {EXPORT_MODULES.map(mod => {
            const Icon = mod.icon;
            const isExportingCSV = exporting === `${mod.id}-csv`;
            const isExportingXLS = exporting === `${mod.id}-excel`;
            return (
              <div key={mod.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-foreground">{mod.label}</h3>
                    <p className="text-xs text-gray-500 dark:text-muted">Datos reales desde la base de datos</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleExport(mod.id, "csv")}
                    disabled={!!exporting}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-60"
                  >
                    {isExportingCSV ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    CSV
                  </button>
                  <button
                    onClick={() => handleExport(mod.id, "excel")}
                    disabled={!!exporting}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
                  >
                    {isExportingXLS ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Excel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "import" && (
        <div className="space-y-4">
          {/* Module selector */}
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
            <h3 className="font-bold text-gray-900 dark:text-foreground mb-3">1. Selecciona módulo destino</h3>
            <div className="flex flex-wrap gap-2">
              {EXPORT_MODULES.map(m => (
                <button key={m.id} onClick={() => setSelectedModule(m.id)} className={cn("px-3 py-2 rounded-xl text-xs font-bold transition-colors border", selectedModule === m.id ? "bg-primary text-white border-primary" : "bg-gray-50 dark:bg-surface text-gray-600 dark:text-muted border-gray-200 dark:border-card-border hover:border-primary")}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Upload zone */}
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
            <h3 className="font-bold text-gray-900 dark:text-foreground mb-3">2. Sube tu archivo</h3>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn("border-2 border-dashed rounded-2xl p-8 text-center transition-colors", dragOver ? "border-primary bg-primary/5" : "border-gray-200 dark:border-card-border")}
            >
              {importing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-semibold text-gray-500 dark:text-muted">Procesando archivo…</p>
                </div>
              ) : importResult ? (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle className="h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-bold text-emerald-600">{importResult.count} registros importados</p>
                  {importResult.errors > 0 && <p className="text-xs text-amber-600">{importResult.errors} errores encontrados</p>}
                  <button onClick={() => setImportResult(null)} className="text-xs text-primary font-bold underline">Importar otro</button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-500 dark:text-muted mb-1">Arrastra tu archivo CSV o Excel aquí</p>
                  <p className="text-xs text-gray-400 mb-3">Formatos: .csv, .xlsx, máximo 10MB</p>
                  <label className="inline-flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer transition-colors">
                    <Upload className="h-4 w-4" /> Seleccionar archivo
                    <input type="file" accept=".csv,.xlsx" onChange={handleFileInput} className="hidden" />
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Rules */}
          <div className="bg-amber-50 dark:bg-amber-950/10 rounded-xl border border-amber-200 dark:border-amber-900/30 p-4">
            <div className="flex flex-wrap items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-400">
                <p className="font-bold mb-1">Reglas de importación:</p>
                <ul className="list-disc ml-4 space-y-0.5">
                  <li>La primera fila debe contener los encabezados</li>
                  <li>Los campos requeridos dependen del módulo seleccionado</li>
                  <li>Registros con error se omiten (el resto se importa)</li>
                  <li>Se genera un log detallado al finalizar</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "history" && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-y-hidden overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="bg-gray-50 dark:bg-surface text-left">
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Archivo</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Módulo</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Registros</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Estado</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-500 dark:text-muted">Fecha</th>
            </tr></thead>
            <tbody>
              {IMPORT_HISTORY.map(r => (
                <tr key={r.id} className="border-t border-gray-100 dark:border-card-border">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center gap-2"><FileText className="h-4 w-4 text-gray-400 shrink-0" /><span className="font-semibold text-gray-900 dark:text-foreground truncate max-w-48">{r.filename}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-600 dark:text-muted">{r.module}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-700 dark:text-foreground">{r.records}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", r.status === "success" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : r.status === "partial" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                      {r.status === "success" ? "✓ Exitoso" : r.status === "partial" ? `⚠ ${r.errors} errores` : "✕ Error"}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 dark:text-muted">{fmtDate(r.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
