"use client";

import { useState, useEffect } from "react";
import {
  Loader2, AlertTriangle, Calendar, Package, DollarSign,
  Download, Printer, BarChart3, Layers, TrendingUp, TrendingDown, Eye,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductItem = {
  id: string;
  sku: string;
  name: string;
  stock: number;
  costPrice: number;
  price: number;
  categoryName: string;
};

type DeclaracionData = {
  fecha: string;
  totalProductos: number;
  totalUnidades: number;
  valorCosto: number;
  valorPrecio: number;
  porCategoria?: Record<string, ProductItem[]>;
  categorias?: any[];
  resumen?: { totalProductos: number; totalUnidades: number; totalValorCosto: number; totalValorPrecio: number };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

type HistorialEntry = { fecha: string; totalProductos: number; totalUnidades: number; valorCosto: number; valorPrecio: number; categorias: number; savedAt: string };

export default function DeclaracionInventarioModule() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().split("T")[0]);
  const [data, setData] = useState<DeclaracionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Info card state
  const [infoDismissed, setInfoDismissed] = useState(true);
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("declaracion-info-dismissed");
      setInfoDismissed(dismissed === "true");
    } catch { setInfoDismissed(false); }
  }, []);
  const handleDismissInfo = () => {
    setInfoDismissed(true);
    try { localStorage.setItem("declaracion-info-dismissed", "true"); } catch { /* noop */ }
  };
  const handleShowInfo = () => {
    setInfoDismissed(false);
    try { localStorage.removeItem("declaracion-info-dismissed"); } catch { /* noop */ }
  };

  // Mejora 18: Resumen ejecutivo auto-fetch
  const [resumen, setResumen] = useState<DeclaracionData | null>(null);
  const [resumenLoading, setResumenLoading] = useState(true);
  const [historial, setHistorial] = useState<HistorialEntry[]>([]);
  const [showHistorial, setShowHistorial] = useState(false);
  const [comparingIdx, setComparingIdx] = useState<number | null>(null);

  // Cargar historial desde localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("inventory-declarations");
      if (raw) setHistorial(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  // Mejora 18: Fetch resumen al montar
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hoy = new Date().toISOString().split("T")[0];
        const res = await fetch(`/api/inventory/declaracion?fecha=${hoy}`);
        if (res.ok && !cancelled) {
          const d = await res.json();
          // Mapear campos del API al formato esperado
          setResumen({
            fecha: d.fecha,
            totalProductos: d.totalProductos ?? d.resumen?.totalProductos ?? 0,
            totalUnidades: d.totalUnidades ?? d.resumen?.totalUnidades ?? 0,
            valorCosto: d.valorCosto ?? d.resumen?.totalValorCosto ?? 0,
            valorPrecio: d.valorPrecio ?? d.resumen?.totalValorPrecio ?? 0,
            porCategoria: d.porCategoria,
            categorias: d.categorias,
          });
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setResumenLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Generate declaration ────────────────────────────────────────────────────

  // Mejora 17: Comparativa con declaracion anterior
  const [prevDecl, setPrevDecl] = useState<{ fecha: string; categorias: Record<string, { unidades: number; valorCosto: number }>; valorTotal: number } | null>(null);

  const handleGenerar = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/inventory/declaracion?fecha=${fecha}`);
      if (!res.ok) throw new Error("Error al generar declaración");
      const raw = await res.json();
      // Mapear campos del API al formato esperado
      const result: DeclaracionData = {
        fecha: raw.fecha,
        totalProductos: raw.totalProductos ?? raw.resumen?.totalProductos ?? 0,
        totalUnidades: raw.totalUnidades ?? raw.resumen?.totalUnidades ?? 0,
        valorCosto: raw.valorCosto ?? raw.resumen?.totalValorCosto ?? 0,
        valorPrecio: raw.valorPrecio ?? raw.resumen?.totalValorPrecio ?? 0,
        porCategoria: raw.porCategoria,
        categorias: raw.categorias,
      };
      setData(result);

      // Mejora 17: Cargar declaracion anterior y guardar la nueva
      try {
        const prevRaw = localStorage.getItem("last-declaration");
        if (prevRaw) {
          setPrevDecl(JSON.parse(prevRaw));
        } else {
          setPrevDecl(null);
        }
      } catch { setPrevDecl(null); }

      // Guardar declaracion actual para futuras comparaciones
      const catResumen: Record<string, { unidades: number; valorCosto: number }> = {};
      Object.entries((result.porCategoria ?? result.categorias ?? {})).forEach(([cat, items]) => {
        catResumen[cat] = {
          unidades: items.reduce((s, p) => s + p.stock, 0),
          valorCosto: items.reduce((s, p) => s + p.stock * p.costPrice, 0),
        };
      });
      localStorage.setItem("last-declaration", JSON.stringify({
        fecha: result.fecha,
        categorias: catResumen,
        valorTotal: result.valorCosto ?? 0,
      }));

      // Mejora 17: Guardar en historial
      const newEntry: HistorialEntry = {
        fecha: result.fecha,
        totalProductos: result.totalProductos,
        totalUnidades: result.totalUnidades,
        valorCosto: result.valorCosto,
        valorPrecio: result.valorPrecio,
        categorias: Object.keys((result.porCategoria ?? result.categorias ?? {})).length,
        savedAt: new Date().toISOString(),
      };
      const updatedHist = [...historial, newEntry].slice(-12);
      setHistorial(updatedHist);
      localStorage.setItem("inventory-declarations", JSON.stringify(updatedHist));
      setResumen(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (!data) return;
    const rows: Record<string, unknown>[] = [];
    Object.entries((data.porCategoria ?? data.categorias ?? {})).forEach(([cat, items]) => {
      items.forEach(p => {
        rows.push({
          Categoría: cat,
          SKU: p.sku,
          Producto: p.name,
          Stock: p.stock,
          "Costo Unit.": p.costPrice,
          "Valor Costo": p.stock * p.costPrice,
          "Precio Unit.": p.price,
          "Valor Precio": p.stock * p.price,
        });
      });
    });
    exportToExcel(rows, `declaracion_inventario_${fecha}`, "Inventario");
  };

  // ── Print ───────────────────────────────────────────────────────────────────

  const handlePrint = () => window.print();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header — Mejora 20 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-[#0f766e] text-white flex items-center justify-center shadow-sm">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Declaración de Inventario</h1>
          <p className="text-sm text-gray-500">Snapshot oficial de tu inventario</p>
        </div>
      </div>

      {/* Card informativa */}
      {!infoDismissed ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
          <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">Para que sirve la Declaracion de Inventario?</h3>
          <div className="space-y-2 text-sm text-blue-700 dark:text-blue-400">
            <p><strong>Que es:</strong> Es un documento oficial que muestra todos tus productos, cuantos tienes y cuanto valen. Es como una &quot;foto&quot; de tu almacen en un momento especifico.</p>
            <p><strong>Cuando hacerla:</strong></p>
            <ul className="list-disc pl-5 space-y-0.5 text-xs">
              <li>Cuando SUNAT lo requiera (fiscalizacion)</li>
              <li>Al iniciar o cerrar el ano fiscal</li>
              <li>Cuando tu contador te lo pida</li>
              <li>Periodicamente para control interno (mensual recomendado)</li>
            </ul>
            <p><strong>Que incluye:</strong> Lista de productos, cantidades en stock, costo unitario, valor total a costo y a precio de venta, agrupados por categoria.</p>
            <p><strong>Como usarla (3 pasos):</strong></p>
            <ol className="list-decimal pl-5 space-y-0.5 text-xs">
              <li>Selecciona la fecha y presiona &quot;Generar Declaracion&quot;</li>
              <li>Revisa que los datos sean correctos</li>
              <li>Descarga el Excel y envialo a tu contador</li>
            </ol>
          </div>
          <button
            onClick={handleDismissInfo}
            className="mt-3 px-4 py-1.5 rounded-lg text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-800/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors"
          >
            Entendido, no mostrar de nuevo
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            onClick={handleShowInfo}
            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-400 hover:text-blue-600 transition-colors"
            title="Que es la Declaracion de Inventario?"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Mejora 18: Resumen ejecutivo siempre visible */}
      {resumenLoading ? (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-6 shadow-sm animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-1/3 mb-3" />
          <div className="h-8 bg-gray-200 dark:bg-white/10 rounded w-1/2 mb-2" />
          <div className="h-3 bg-gray-200 dark:bg-white/10 rounded w-2/3" />
        </div>
      ) : resumen ? (() => {
        const valorTotal = resumen.valorCosto ?? 0;
        const lastHist = historial.length >= 2 ? historial[historial.length - 2] : null;
        const diff = lastHist ? valorTotal - lastHist.valorCosto : 0;
        const pct = lastHist && lastHist.valorCosto > 0 ? ((diff / lastHist.valorCosto) * 100) : 0;
        const isUp = diff > 0;
        const isDown = diff < 0;
        return (
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-[#0f766e]" />
              <p className="text-sm font-bold text-gray-600 dark:text-gray-400">Tu inventario</p>
            </div>
            <p className={cn("text-3xl font-mono font-bold", isDown ? "text-red-600" : "text-gray-900 dark:text-white")}>
              {formatCurrency(valorTotal)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {resumen?.totalProductos ?? 0} productos · {resumen?.totalUnidades ?? 0} unidades · {Object.keys(resumen?.porCategoria ?? resumen?.categorias ?? {}).length} categorías
            </p>
            {lastHist && (
              <p className={cn("text-xs font-bold mt-2 inline-flex items-center gap-1", isUp ? "text-emerald-600" : isDown ? "text-red-600" : "text-gray-400")}>
                {isUp ? <TrendingUp className="h-3 w-3" /> : isDown ? <TrendingDown className="h-3 w-3" /> : null}
                {isUp ? "+" : ""}{pct.toFixed(1)}% vs anterior
              </p>
            )}
          </div>
        );
      })() : null}

      {/* Date selector + Generate */}
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div>
          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">Fecha de declaración</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]/30"
            />
          </div>
        </div>
        <button
          onClick={handleGenerar}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#0f766e] hover:bg-[#0d5f58] disabled:opacity-50 shadow-sm transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          Generar Declaración
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={handleGenerar} className="ml-auto text-xs font-bold hover:underline">Reintentar</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#0f766e]" />
        </div>
      )}

      {/* Data */}
      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Productos", value: (data.totalProductos ?? 0).toLocaleString(), icon: Package, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
              { label: "Total Unidades", value: (data.totalUnidades ?? 0).toLocaleString(), icon: Layers, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
              { label: "Valor a Costo", value: formatCurrency(data.valorCosto ?? 0), icon: DollarSign, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
              { label: "Valor a Precio Venta", value: formatCurrency(data.valorPrecio ?? 0), icon: DollarSign, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
            ].map(card => {
              const CardIcon = card.icon;
              return (
                <div key={card.label} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", card.bg)}>
                      <CardIcon className={cn("h-4 w-4", card.color)} />
                    </div>
                  </div>
                  <p className="text-[10px] uppercase font-bold text-gray-400">{card.label}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{card.value}</p>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleExport}
              className="inline-flex flex-col items-start gap-0.5 px-4 py-2 rounded-xl text-sm font-bold text-[#0f766e] bg-[#0f766e]/10 hover:bg-[#0f766e]/20 transition-colors">
              <span className="inline-flex items-center gap-2"><Download className="h-4 w-4" /> Descargar para mi Contador</span>
              <span className="text-[10px] font-normal text-gray-500">Tu contador puede usar este archivo para la declaracion ante SUNAT</span>
            </button>
            <button onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </div>

          {/* Mejora 17: Comparativa con declaracion anterior */}
          {prevDecl ? (() => {
            const currentCats: Record<string, { unidades: number; valorCosto: number }> = {};
            Object.entries((data.porCategoria ?? data.categorias ?? {})).forEach(([cat, items]) => {
              currentCats[cat] = {
                unidades: items.reduce((s, p) => s + p.stock, 0),
                valorCosto: items.reduce((s, p) => s + p.stock * p.costPrice, 0),
              };
            });
            const allCats = Array.from(new Set([...Object.keys(currentCats), ...Object.keys(prevDecl.categorias)]));
            const currentTotal = data.valorCosto ?? 0;
            const prevTotal = prevDecl.valorTotal ?? 0;
            const diffTotal = currentTotal - prevTotal;
            const pctTotal = prevTotal > 0 ? ((diffTotal / prevTotal) * 100) : 0;

            return (
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-bold text-blue-800 dark:text-blue-300">
                    Comparativa con declaracion anterior ({formatDate(prevDecl.fecha + "T00:00:00")})
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-white/5 text-left">
                        <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs">Categoria</th>
                        <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right">Anterior</th>
                        <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right">Actual</th>
                        <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right">Diferencia</th>
                        <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs text-center">Tendencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allCats.map(cat => {
                        const prev = prevDecl.categorias[cat] ?? { unidades: 0, valorCosto: 0 };
                        const curr = currentCats[cat] ?? { unidades: 0, valorCosto: 0 };
                        const diff = curr.unidades - prev.unidades;
                        const pct = prev.unidades > 0 ? ((diff / prev.unidades) * 100) : (curr.unidades > 0 ? 100 : 0);
                        const isUp = diff > 0;
                        const isDown = diff < 0;
                        const significantDrop = pct < -20;
                        return (
                          <tr key={cat} className="border-b border-gray-50 dark:border-white/5">
                            <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{cat}</td>
                            <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400">{prev.unidades} uds</td>
                            <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">{curr.unidades} uds</td>
                            <td className={cn("px-4 py-2 text-right font-bold", significantDrop ? "text-red-600" : isUp ? "text-emerald-600" : isDown ? "text-amber-600" : "text-gray-500")}>
                              {diff > 0 ? "+" : ""}{diff} ({pct > 0 ? "+" : ""}{pct.toFixed(0)}%)
                            </td>
                            <td className="px-4 py-2 text-center text-lg">
                              {isUp ? <span className="text-emerald-500">&#8593;</span> : isDown ? <span className={significantDrop ? "text-red-500" : "text-amber-500"}>&#8595;</span> : <span className="text-gray-400">&#8594;</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 dark:border-white/5 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Valor total anterior: <strong>{formatCurrency(prevTotal)}</strong></span>
                  <span className="text-gray-500">Actual: <strong>{formatCurrency(currentTotal)}</strong></span>
                  <span className={cn("font-bold", diffTotal > 0 ? "text-emerald-600" : diffTotal < 0 ? "text-red-600" : "text-gray-500")}>
                    {diffTotal > 0 ? "+" : ""}{formatCurrency(diffTotal)} ({pctTotal > 0 ? "+" : ""}{pctTotal.toFixed(1)}%)
                  </span>
                </div>
              </div>
            );
          })() : (
            <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-card-border rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400">Primera declaracion -- sin datos anteriores para comparar</p>
            </div>
          )}

          {/* Table grouped by category */}
          <div className="space-y-4 print:space-y-2">
            {Object.entries((data.porCategoria ?? data.categorias ?? {}) ?? data.categorias ?? {}).map(([category, items]) => {
              const catCosto = items.reduce((s, p) => s + p.stock * p.costPrice, 0);
              const catPrecio = items.reduce((s, p) => s + p.stock * p.price, 0);
              const catUnidades = items.reduce((s, p) => s + p.stock, 0);
              return (
                <div key={category} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
                  {/* Category header */}
                  <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-[#0f766e]" />
                      <span className="font-bold text-sm text-gray-900 dark:text-white">{category}</span>
                      <span className="text-xs text-gray-400">({items.length} productos)</span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{catUnidades} uds</span>
                      <span>Costo: {formatCurrency(catCosto)}</span>
                      <span>Precio: {formatCurrency(catPrecio)}</span>
                    </div>
                  </div>
                  {/* Products */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-white/5 text-left">
                          <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs">SKU</th>
                          <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs">Nombre</th>
                          <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right">Stock</th>
                          <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right hidden sm:table-cell">Costo unit.</th>
                          <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right hidden sm:table-cell">Valor costo</th>
                          <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right hidden md:table-cell">Precio unit.</th>
                          <th className="px-4 py-2 font-semibold text-gray-500 dark:text-gray-400 text-xs text-right hidden md:table-cell">Valor precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(p => (
                          <tr key={p.id} className="border-b border-gray-50 dark:border-white/5">
                            <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.sku}</td>
                            <td className="px-4 py-2 text-gray-900 dark:text-white truncate max-w-[200px]">{p.name}</td>
                            <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">{p.stock}</td>
                            <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden sm:table-cell">{formatCurrency(p.costPrice)}</td>
                            <td className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300 hidden sm:table-cell">{formatCurrency(p.stock * p.costPrice)}</td>
                            <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden md:table-cell">{formatCurrency(p.price)}</td>
                            <td className="px-4 py-2 text-right font-medium text-gray-700 dark:text-gray-300 hidden md:table-cell">{formatCurrency(p.stock * p.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Mejora 17: Historial de declaraciones */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowHistorial(!showHistorial)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#0f766e]" />
            <span className="text-sm font-bold text-gray-900 dark:text-white">Declaraciones anteriores</span>
            {historial.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#0f766e]/10 text-[#0f766e] text-[10px] font-bold">{historial.length}</span>
            )}
          </div>
          <span className="text-xs text-gray-400">{showHistorial ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showHistorial && (
          <div className="border-t border-gray-100 dark:border-white/5">
            {historial.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-sm text-gray-400">Genera tu primera declaración para empezar el historial</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[500px] sm:min-w-0 text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-white/5 text-left">
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500">Fecha</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">Productos</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right hidden sm:table-cell">Unidades</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">Valor costo</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right hidden sm:table-cell">Valor venta</th>
                      <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...historial].reverse().map((h, i) => {
                      const realIdx = historial.length - 1 - i;
                      const prev = realIdx > 0 ? historial[realIdx - 1] : null;
                      const diff = prev ? h.valorCosto - prev.valorCosto : 0;
                      return (
                        <tr key={i} className={cn("border-b border-gray-50 dark:border-white/5", comparingIdx === realIdx && "bg-blue-50 dark:bg-blue-900/10")}>
                          <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{formatDate(h.fecha + "T00:00:00")}</td>
                          <td className="px-4 py-2 text-right text-gray-900 dark:text-white font-medium">{h.totalProductos}</td>
                          <td className="px-4 py-2 text-right text-gray-900 dark:text-white hidden sm:table-cell">{h.totalUnidades}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-900 dark:text-white">
                            {formatCurrency(h.valorCosto)}
                            {prev && (
                              <span className={cn("ml-1 text-[10px]", diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-gray-400")}>
                                {diff > 0 ? "+" : ""}{((diff / (prev.valorCosto || 1)) * 100).toFixed(0)}%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-700 dark:text-gray-300 hidden sm:table-cell">{formatCurrency(h.valorPrecio)}</td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => setComparingIdx(comparingIdx === realIdx ? null : realIdx)}
                              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 hover:text-[#0f766e] transition-colors"
                              title="Comparar"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty state when no data yet */}
      {!data && !loading && !error && (
        <div className="text-center py-16 px-4">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin declaraciones</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">Genera un snapshot de tu inventario actual</p>
          <button onClick={handleGenerar} className="bg-[#0f766e] text-white px-6 py-2.5 rounded-xl font-medium hover:bg-[#0d5f58]">Generar declaración</button>
        </div>
      )}
    </div>
  );
}
