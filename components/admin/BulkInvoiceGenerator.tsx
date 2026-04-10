"use client";

import { useState, useCallback, useMemo } from "react";
import {
  FileText, RefreshCw, CheckSquare, Square, Download,
  AlertTriangle, CheckCircle2, XCircle, Loader2, FileDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceType = "boleta" | "factura";

interface SaleOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerRuc?: string;
  total: number;
  createdAt: string;
  paymentMethod: string;
}

interface GenResult {
  orderId: string;
  orderNumber: string;
  success: boolean;
  error?: string;
  invoiceNumber?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BulkInvoiceGenerator() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayStr);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("boleta");
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [errorOrders, setErrorOrders] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<GenResult[] | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoadingOrders(true);
    setErrorOrders("");
    setOrders([]);
    setSelected(new Set());
    setResults(null);
    try {
      const res = await fetch(
        `/api/invoices?uninvoiced=true&from=${dateFrom}&to=${dateTo}&type=${invoiceType}`,
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Error al cargar órdenes");
      }
      const json = await res.json();
      const list: SaleOrder[] = json.orders ?? json.data ?? json ?? [];
      setOrders(list);
      setSelected(new Set(list.map(o => o.id)));
    } catch (e) {
      setErrorOrders(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoadingOrders(false);
    }
  }, [dateFrom, dateTo, invoiceType]);

  const toggleAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(orders.map(o => o.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectedOrders = useMemo(() => orders.filter(o => selected.has(o.id)), [orders, selected]);
  const totalSelected = useMemo(() => selectedOrders.reduce((s, o) => s + o.total, 0), [selectedOrders]);

  const handleGenerate = async () => {
    if (selectedOrders.length === 0) return;
    if (!confirm(`¿Generar ${selectedOrders.length} ${invoiceType === "boleta" ? "boleta(s)" : "factura(s)"}?`)) return;

    setGenerating(true);
    setProgress(0);
    setResults(null);

    const res: GenResult[] = [];
    const total = selectedOrders.length;

    for (let i = 0; i < total; i++) {
      const order = selectedOrders[i];
      try {
        const r = await fetch(`/api/invoices/sunat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            type: invoiceType,
          }),
        });
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.error ?? "Error al emitir");
        res.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          success: true,
          invoiceNumber: json.invoiceNumber ?? json.comprobante ?? undefined,
        });
      } catch (e) {
        res.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          success: false,
          error: e instanceof Error ? e.message : "Error",
        });
      }
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setResults(res);
    setGenerating(false);
    // Remove successfully invoiced orders from the list
    const failedIds = new Set(res.filter(r => !r.success).map(r => r.orderId));
    setOrders(prev => prev.filter(o => failedIds.has(o.id)));
    setSelected(failedIds);
  };

  const handleDownloadZip = async () => {
    if (!results) return;
    const successIds = results.filter(r => r.success).map(r => r.orderId);
    if (successIds.length === 0) return;
    try {
      const res = await fetch("/api/invoices/bulk-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: successIds, type: invoiceType }),
      });
      if (!res.ok) throw new Error("Error al generar ZIP");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoiceType}s_${dateFrom}_${dateTo}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al descargar ZIP");
    }
  };

  const successCount = results?.filter(r => r.success).length ?? 0;
  const errorCount = results?.filter(r => !r.success).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#00B4A6] text-white flex items-center justify-center shadow-sm shrink-0">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Facturación Masiva</h2>
          <p className="text-xs text-gray-500 dark:text-muted">Genera boletas y facturas para múltiples ventas a la vez</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase text-gray-400">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase text-gray-400">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase text-gray-400">Tipo</label>
            <div className="flex bg-gray-100 dark:bg-white/5 rounded-xl p-0.5 gap-0.5">
              {(["boleta", "factura"] as InvoiceType[]).map(t => (
                <button
                  key={t}
                  onClick={() => setInvoiceType(t)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                    invoiceType === t
                      ? "bg-white dark:bg-card text-[#00B4A6] shadow-sm"
                      : "text-gray-500 dark:text-muted hover:text-gray-700",
                  )}
                >
                  {t === "boleta" ? "Boleta" : "Factura"}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={fetchOrders}
            disabled={loadingOrders || !dateFrom || !dateTo}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 transition-colors min-h-[40px]"
          >
            {loadingOrders
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            Buscar ventas
          </button>
        </div>
      </div>

      {/* Error */}
      {errorOrders && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-400">{errorOrders}</p>
        </div>
      )}

      {/* Results summary */}
      {results && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Resultado de la generación</p>
          <div className="flex gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{successCount} generadas</span>
            </div>
            {errorCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span className="text-xs font-bold text-red-700 dark:text-red-400">{errorCount} errores</span>
              </div>
            )}
          </div>
          {successCount > 0 && (
            <button
              onClick={handleDownloadZip}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[#f4a261] hover:bg-[#e8924f] transition-colors min-h-[40px]"
            >
              <FileDown className="h-4 w-4" /> Descargar todas como ZIP ({successCount})
            </button>
          )}
          {/* Error list */}
          {errorCount > 0 && (
            <div className="space-y-1">
              {results.filter(r => !r.success).map(r => (
                <div key={r.orderId} className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/10 rounded-lg">
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{r.orderNumber}</span>
                    <span className="text-[10px] text-red-500 dark:text-red-400 ml-2">{r.error}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      {generating && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Generando documentos...</p>
            <span className="text-sm font-bold text-[#00B4A6]">{progress}%</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00B4A6] rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-400 dark:text-muted">No cierres esta ventana</p>
        </div>
      )}

      {/* Orders list */}
      {orders.length > 0 && !generating && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-card-border">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-400 hover:text-[#00B4A6] transition-colors min-h-[36px]"
              >
                {selected.size === orders.length
                  ? <CheckSquare className="h-4 w-4 text-[#00B4A6]" />
                  : <Square className="h-4 w-4" />}
                {selected.size === orders.length ? "Deseleccionar todo" : "Seleccionar todo"}
              </button>
              <span className="text-xs text-gray-400">{selected.size} de {orders.length} seleccionadas</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">
                Total: {fmt(totalSelected)}
              </span>
              <button
                onClick={handleGenerate}
                disabled={selected.size === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 transition-colors min-h-[36px]"
              >
                <FileText className="h-3.5 w-3.5" />
                Generar {selected.size} {invoiceType === "boleta" ? "boleta" : "factura"}{selected.size !== 1 ? "s" : ""}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-white/5">
                  <th className="px-4 py-2.5 w-8" />
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-gray-400">Nro.</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-gray-400">Cliente</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-gray-400 hidden sm:table-cell">Fecha</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase text-gray-400 hidden md:table-cell">Pago</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {orders.map(order => (
                  <tr
                    key={order.id}
                    onClick={() => toggleOne(order.id)}
                    className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2.5">
                      {selected.has(order.id)
                        ? <CheckSquare className="h-4 w-4 text-[#00B4A6]" />
                        : <Square className="h-4 w-4 text-gray-300 dark:text-gray-600" />}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{order.orderNumber}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-medium text-gray-900 dark:text-white">{order.customerName}</p>
                      {order.customerRuc && (
                        <p className="text-[10px] text-gray-400 dark:text-muted">RUC: {order.customerRuc}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="text-xs text-gray-500 dark:text-muted">{fmtDate(order.createdAt)}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <span className="text-xs text-gray-500 dark:text-muted capitalize">{order.paymentMethod}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-xs font-bold font-mono text-gray-900 dark:text-white">{fmt(order.total)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loadingOrders && orders.length === 0 && !errorOrders && !results && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl py-16 text-center">
          <Download className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-muted">Selecciona un rango de fechas y haz clic en &quot;Buscar ventas&quot;</p>
        </div>
      )}
    </div>
  );
}
