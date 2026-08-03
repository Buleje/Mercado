"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState } from "react";
import { Upload, Download, FileText, CheckCircle, AlertTriangle, Loader2, Package, Users, ShoppingCart, Truck, DollarSign } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

type ExportModule = { id: string; label: string; icon: React.ElementType };
type ImportRecord = { id: string; module: string; filename: string; records: number; status: "success" | "partial" | "error"; date: string; errors: number };

const EXPORT_MODULES: ExportModule[] = [
  { id: "productos", label: "Productos", icon: Package },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "pedidos", label: "Pedidos", icon: ShoppingCart },
  { id: "ventas", label: "Ventas", icon: DollarSign },
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
      nombre: c.name, teléfono: c.phone, ubicacion: c.location ?? "",
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
      id: o.id, cliente: (o.customer as Record<string, unknown>)?.name ?? "", teléfono: (o.customer as Record<string, unknown>)?.phone ?? "",
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
  if (moduleId === "ventas") {
    const res = await fetch("/api/sales");
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown>[];
    return data.map(s => {
      const total = Number(s.total) || 0;
      const totalCogs = Number(s.totalCogs) || 0;
      const margin = total - totalCogs;
      return {
        id: s.id,
        fecha: s.createdAt ? String(s.createdAt).slice(0, 10) : "",
        num_productos: Array.isArray(s.items) ? s.items.length : 0,
        total: total.toFixed(2),
        costo_total: totalCogs.toFixed(2),
        margen: margin.toFixed(2),
        margen_pct: total > 0 ? ((margin / total) * 100).toFixed(1) + "%" : "0%",
        metodo_pago: s.payment ?? "",
        comprobante: s.comprobanteTipo ?? "ticket",
        descuento: s.descuentoMonto ?? 0,
        cajero: s.cashierId ?? "",
        cliente: s.customerPhone ?? "",
      };
    });
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
  const [importResult, setImportResult] = useState<{ success: boolean; count: number; errors: number; message?: string } | null>(null);
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
    if (file) importFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importFile(file);
  };

  // Importa productos REAL contra /api/products/import (FormData). Antes era una
  // maqueta (simulateImport) que ignoraba el archivo y mostraba un número random.
  const importFile = async (file: File) => {
    setImporting(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/products/import", { method: "POST", headers: csrfHeaders(), body: fd, credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setImportResult({ success: false, count: 0, errors: 0, message: typeof data?.error === "string" ? data.error : "No se pudo importar el archivo" });
        return;
      }
      const count = Number(data?.created ?? 0);
      const errs = Array.isArray(data?.errors) ? data.errors.length : Number(data?.errors ?? 0);
      setImportResult({ success: true, count, errors: errs });
    } catch {
      setImportResult({ success: false, count: 0, errors: 0, message: "Error de red al importar. Intenta de nuevo." });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2"><Upload className="h-6 w-6 text-primary" /> Subir / Descargar Datos</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Descarga tus datos a Excel o sube archivos para cargar productos de golpe</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["export", "import", "history"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === v ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
              {v === "export" ? "Descargar" : v === "import" ? "Subir" : "Historial"}
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
              <div key={mod.id} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-[var(--accent-ink)] dark:text-[var(--accent)]" /></div>
                  <div>
                    <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{mod.label}</CardTitle>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Datos reales desde la base de datos</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleExport(mod.id, "csv")}
                    disabled={!!exporting}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-60"
                  >
                    {isExportingCSV ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    CSV
                  </button>
                  <button
                    onClick={() => handleExport(mod.id, "excel")}
                    disabled={!!exporting}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-primary/10 text-white hover:bg-primary/10 transition-colors disabled:opacity-60"
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
        <div className="space-y-6">
          {/* Module selector */}
          <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3">1. Elige a dónde van los datos</CardTitle>
            <div className="flex flex-wrap gap-2">
              {EXPORT_MODULES.map(m => (
                <button key={m.id} onClick={() => setSelectedModule(m.id)} className={cn("px-3 py-2 rounded-lg text-xs font-bold transition-colors border", selectedModule === m.id ? "bg-primary text-white border-primary" : "bg-[var(--surface-alt)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary")}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Upload zone */}
          <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3">2. Sube tu archivo</CardTitle>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={cn("border-2 border-dashed rounded-xl p-8 text-center transition-colors", dragOver ? "border-primary bg-primary/5" : "border-[var(--rule-base)] dark:border-[var(--rule-base)]")}
            >
              {importing ? (
                <LoadingState message="Procesando archivo..." />
              ) : importResult ? (
                <div className="flex flex-col items-center gap-3">
                  {importResult.success ? (
                    <>
                      <CheckCircle className="h-8 w-8 text-[var(--data-success-500)]" />
                      <p className="text-sm font-bold text-[var(--data-success-500)]">{importResult.count} productos importados</p>
                      {importResult.errors > 0 && <p className="text-xs text-[var(--data-warning-500)]">{importResult.errors} filas con errores</p>}
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
                      <p className="text-sm font-bold text-[var(--data-error-500)]">No se pudo importar</p>
                      {importResult.message && <p className="text-xs text-[var(--text-tertiary)]">{importResult.message}</p>}
                    </>
                  )}
                  <button onClick={() => setImportResult(null)} className="text-xs text-primary font-bold underline">Importar otro</button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
                  <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Arrastra tu archivo CSV o Excel aquí</p>
                  <p className="text-xs text-[var(--text-tertiary)] mb-3">Formatos: .csv, .xlsx, máximo 10MB</p>
                  <label className="inline-flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer transition-colors">
                    <Upload className="h-4 w-4" /> Seleccionar archivo
                    <input type="file" accept=".csv,.xlsx" onChange={handleFileInput} className="hidden" />
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Rules */}
          <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/10 rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 p-4">
            <div className="flex flex-wrap items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
              <div className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                <p className="font-bold mb-1">Reglas para subir archivos:</p>
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
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] overflow-y-hidden overflow-x-auto">
          <table className="w-full min-w-150 text-sm">
            <thead><tr className="bg-[var(--surface-alt)] dark:bg-surface text-left">
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Archivo</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Módulo</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Registros</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Estado</th>
              <th className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted">Fecha</th>
            </tr></thead>
            <tbody>
              {IMPORT_HISTORY.map(r => (
                <tr key={r.id} className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center gap-2"><FileText className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" /><span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate max-w-48">{r.filename}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted">{r.module}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{r.records}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3">
                    <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", r.status === "success" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]" : r.status === "partial" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]" : "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]")}>
                      {r.status === "success" ? "Exitoso" : r.status === "partial" ? `${r.errors} errores` : "Error"}
                    </span>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{fmtDate(r.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
