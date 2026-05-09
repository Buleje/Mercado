"use client";

import { CardTitle, DataTable, LoadingState, PageTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import {
  Loader2, AlertTriangle, Calendar, Package, DollarSign,
  Download, Printer, BarChart3, Layers, TrendingUp, TrendingDown, Eye,
  HelpCircle,
} from "@buleje/design-system/icons";
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
        const productItems = items as ProductItem[];
        catResumen[cat] = {
          unidades: productItems.reduce((s: number, p: ProductItem) => s + p.stock, 0),
          valorCosto: productItems.reduce((s: number, p: ProductItem) => s + p.stock * p.costPrice, 0),
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
      (items as ProductItem[]).forEach((p: ProductItem) => {
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
        <div className="h-10 w-10 rounded-lg bg-primary text-white flex items-center justify-center ">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <PageTitle className="text-xl font-bold text-[var(--text-primary)]">Declaración de Inventario</PageTitle>
          <p className="text-sm text-[var(--text-secondary)]">Snapshot oficial de tu inventario</p>
        </div>
      </div>

      {/* Card informativa */}
      {!infoDismissed ? (
        <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-5">
          <CardTitle className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-2">Para que sirve la Declaracion de Inventario?</CardTitle>
          <div className="space-y-2 text-sm text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
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
            className="mt-3 px-4 py-1.5 rounded-lg text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors"
          >
            Entendido, no mostrar de nuevo
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            onClick={handleShowInfo}
            className="p-1.5 rounded-lg hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] text-[var(--data-success-500)] hover:text-[var(--data-success-500)] transition-colors"
            title="Que es la Declaracion de Inventario?"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Mejora 18: Resumen ejecutivo siempre visible */}
      {resumenLoading ? (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6  animate-pulse">
          <div className="h-4 bg-[var(--rule-soft)] dark:bg-white/10 rounded w-1/3 mb-3" />
          <div className="h-8 bg-[var(--rule-soft)] dark:bg-white/10 rounded w-1/2 mb-2" />
          <div className="h-3 bg-[var(--rule-soft)] dark:bg-white/10 rounded w-2/3" />
        </div>
      ) : resumen ? (() => {
        const valorTotal = resumen.valorCosto ?? 0;
        const lastHist = historial.length >= 2 ? historial[historial.length - 2] : null;
        const diff = lastHist ? valorTotal - lastHist.valorCosto : 0;
        const pct = lastHist && lastHist.valorCosto > 0 ? ((diff / lastHist.valorCosto) * 100) : 0;
        const isUp = diff > 0;
        const isDown = diff < 0;
        return (
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 ">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-primary" />
              <p className="text-sm font-bold text-[var(--text-secondary)]">Tu inventario</p>
            </div>
            <p className={cn("text-3xl font-mono font-bold", isDown ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)]")}>
              {formatCurrency(valorTotal)}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              {resumen?.totalProductos ?? 0} productos · {resumen?.totalUnidades ?? 0} unidades · {Object.keys(resumen?.porCategoria ?? resumen?.categorias ?? {}).length} categorías
            </p>
            {lastHist && (
              <p className={cn("text-xs font-bold mt-2 inline-flex items-center gap-1", isUp ? "text-[var(--data-success-500)]" : isDown ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]")}>
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
          <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Fecha de declaración</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <button
          onClick={handleGenerar}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50  transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          Generar Declaración
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={handleGenerar} className="ml-auto text-xs font-bold hover:underline">Reintentar</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <LoadingState />
      )}

      {/* Data */}
      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Productos", value: (data.totalProductos ?? 0).toLocaleString(), icon: Package, color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
              { label: "Total Unidades", value: (data.totalUnidades ?? 0).toLocaleString(), icon: Layers, color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
              { label: "Valor a Costo", value: formatCurrency(data.valorCosto ?? 0), icon: DollarSign, color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
              { label: "Valor a Precio Venta", value: formatCurrency(data.valorPrecio ?? 0), icon: DollarSign, color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-sunken)]" },
            ].map(card => {
              const CardIcon = card.icon;
              return (
                <div key={card.label} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 ">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", card.bg)}>
                      <CardIcon className={cn("h-4 w-4", card.color)} />
                    </div>
                  </div>
                  <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">{card.label}</p>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{card.value}</p>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleExport}
              className="inline-flex flex-col items-start gap-0.5 px-4 py-2 rounded-lg text-sm font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors">
              <span className="inline-flex items-center gap-2"><Download className="h-4 w-4" /> Descargar para mi Contador</span>
              <span className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-secondary)]">Tu contador puede usar este archivo para la declaracion ante SUNAT</span>
            </button>
            <button onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-[var(--surface-sunken)] dark:bg-white/5 hover:bg-[var(--rule-soft)] dark:hover:bg-white/10 transition-colors">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </div>

          {/* Mejora 17: Comparativa con declaracion anterior */}
          {prevDecl ? (() => {
            const currentCats: Record<string, { unidades: number; valorCosto: number }> = {};
            Object.entries((data.porCategoria ?? data.categorias ?? {})).forEach(([cat, items]) => {
              const productItems = items as ProductItem[];
              currentCats[cat] = {
                unidades: productItems.reduce((s: number, p: ProductItem) => s + p.stock, 0),
                valorCosto: productItems.reduce((s: number, p: ProductItem) => s + p.stock * p.costPrice, 0),
              };
            });
            const allCats = Array.from(new Set([...Object.keys(currentCats), ...Object.keys(prevDecl.categorias)]));
            const currentTotal = data.valorCosto ?? 0;
            const prevTotal = prevDecl.valorTotal ?? 0;
            const diffTotal = currentTotal - prevTotal;
            const pctTotal = prevTotal > 0 ? ((diffTotal / prevTotal) * 100) : 0;

            return (
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden ">
                <div className="px-4 py-3 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-b border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
                  <p className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                    Comparativa con declaracion anterior ({formatDate(prevDecl.fecha + "T00:00:00")})
                  </p>
                </div>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th className="text-right">Anterior</th>
                      <th className="text-right">Actual</th>
                      <th className="text-right">Diferencia</th>
                      <th className="text-center">Tendencia</th>
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
                        <tr key={cat}>
                          <td className="font-medium text-[var(--text-primary)]">{cat}</td>
                          <td className="text-right text-[var(--text-tertiary)]">{prev.unidades} uds</td>
                          <td className="text-right font-medium text-[var(--text-primary)]">{curr.unidades} uds</td>
                          <td className={cn("text-right font-bold", significantDrop ? "text-[var(--data-error-500)]" : isUp ? "text-[var(--data-success-500)]" : isDown ? "text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]")}>
                            {diff > 0 ? "+" : ""}{diff} ({pct > 0 ? "+" : ""}{pct.toFixed(0)}%)
                          </td>
                          <td className="text-center text-lg">
                            {isUp ? <span className="text-[var(--data-success-500)]">&#8593;</span> : isDown ? <span className={significantDrop ? "text-[var(--data-error-500)]" : "text-[var(--data-warning-500)]"}>&#8595;</span> : <span className="text-[var(--text-tertiary)]">&#8594;</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
                <div className="px-4 py-3 border-t border-[var(--rule-soft)] dark:border-white/5 flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Valor total anterior: <strong>{formatCurrency(prevTotal)}</strong></span>
                  <span className="text-[var(--text-secondary)]">Actual: <strong>{formatCurrency(currentTotal)}</strong></span>
                  <span className={cn("font-bold", diffTotal > 0 ? "text-[var(--data-success-500)]" : diffTotal < 0 ? "text-[var(--data-error-500)]" : "text-[var(--text-secondary)]")}>
                    {diffTotal > 0 ? "+" : ""}{formatCurrency(diffTotal)} ({pctTotal > 0 ? "+" : ""}{pctTotal.toFixed(1)}%)
                  </span>
                </div>
              </div>
            );
          })() : (
            <div className="bg-[var(--surface-alt)] dark:bg-white/5 border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 text-center">
              <p className="text-xs text-[var(--text-tertiary)]">Primera declaracion -- sin datos anteriores para comparar</p>
            </div>
          )}

          {/* Table grouped by category */}
          <div className="space-y-4 print:space-y-2">
            {Object.entries((data.porCategoria ?? data.categorias ?? {}) ?? data.categorias ?? {}).map(([category, items]) => {
              const productItems = items as ProductItem[];
              const catCosto = productItems.reduce((s: number, p: ProductItem) => s + p.stock * p.costPrice, 0);
              const catPrecio = productItems.reduce((s: number, p: ProductItem) => s + p.stock * p.price, 0);
              const catUnidades = productItems.reduce((s: number, p: ProductItem) => s + p.stock, 0);
              return (
                <div key={category} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden ">
                  {/* Category header */}
                  <div className="px-4 py-3 bg-[var(--surface-alt)] dark:bg-white/5 border-b border-[var(--rule-soft)] dark:border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <span className="font-bold text-sm text-[var(--text-primary)]">{category}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">({productItems.length} productos)</span>
                    </div>
                    <div className="flex gap-4 text-xs text-[var(--text-tertiary)]">
                      <span>{catUnidades} uds</span>
                      <span>Costo: {formatCurrency(catCosto)}</span>
                      <span>Precio: {formatCurrency(catPrecio)}</span>
                    </div>
                  </div>
                  {/* Products */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--rule-soft)] dark:border-white/5 text-left">
                          <th className="px-4 py-2 font-semibold text-[var(--text-tertiary)] text-xs">SKU</th>
                          <th className="px-4 py-2 font-semibold text-[var(--text-tertiary)] text-xs">Nombre</th>
                          <th className="px-4 py-2 font-semibold text-[var(--text-tertiary)] text-xs text-right">Stock</th>
                          <th className="px-4 py-2 font-semibold text-[var(--text-tertiary)] text-xs text-right hidden sm:table-cell">Costo unit.</th>
                          <th className="px-4 py-2 font-semibold text-[var(--text-tertiary)] text-xs text-right hidden sm:table-cell">Valor costo</th>
                          <th className="px-4 py-2 font-semibold text-[var(--text-tertiary)] text-xs text-right hidden md:table-cell">Precio unit.</th>
                          <th className="px-4 py-2 font-semibold text-[var(--text-tertiary)] text-xs text-right hidden md:table-cell">Valor precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productItems.map((p: ProductItem) => (
                          <tr key={p.id} className="border-b border-gray-50 dark:border-white/5">
                            <td className="px-4 py-2 font-mono text-xs text-[var(--text-secondary)]">{p.sku}</td>
                            <td className="px-4 py-2 text-[var(--text-primary)] truncate max-w-[200px]">{p.name}</td>
                            <td className="px-4 py-2 text-right font-medium text-[var(--text-primary)]">{p.stock}</td>
                            <td className="px-4 py-2 text-right text-[var(--text-tertiary)] hidden sm:table-cell">{formatCurrency(p.costPrice)}</td>
                            <td className="px-4 py-2 text-right font-medium text-[var(--text-secondary)] hidden sm:table-cell">{formatCurrency(p.stock * p.costPrice)}</td>
                            <td className="px-4 py-2 text-right text-[var(--text-tertiary)] hidden md:table-cell">{formatCurrency(p.price)}</td>
                            <td className="px-4 py-2 text-right font-medium text-[var(--text-secondary)] hidden md:table-cell">{formatCurrency(p.stock * p.price)}</td>
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
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl  overflow-hidden">
        <button
          onClick={() => setShowHistorial(!showHistorial)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--surface-alt)] dark:hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-[var(--text-primary)]">Declaraciones anteriores</span>
            {historial.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[length:var(--ts-2xs)] font-bold">{historial.length}</span>
            )}
          </div>
          <span className="text-xs text-[var(--text-tertiary)]">{showHistorial ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showHistorial && (
          <div className="border-t border-[var(--rule-soft)] dark:border-white/5">
            {historial.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-sm text-[var(--text-tertiary)]">Genera tu primera declaración para empezar el historial</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[500px] sm:min-w-0 text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule-soft)] dark:border-white/5 text-left">
                      <th className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)]">Fecha</th>
                      <th className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] text-right">Productos</th>
                      <th className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] text-right hidden sm:table-cell">Unidades</th>
                      <th className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] text-right">Valor costo</th>
                      <th className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] text-right hidden sm:table-cell">Valor venta</th>
                      <th className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...historial].reverse().map((h, i) => {
                      const realIdx = historial.length - 1 - i;
                      const prev = realIdx > 0 ? historial[realIdx - 1] : null;
                      const diff = prev ? h.valorCosto - prev.valorCosto : 0;
                      return (
                        <tr key={i} className={cn("border-b border-gray-50 dark:border-white/5", comparingIdx === realIdx && "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]")}>
                          <td className="px-4 py-2 text-[var(--text-secondary)]">{formatDate(h.fecha + "T00:00:00")}</td>
                          <td className="px-4 py-2 text-right text-[var(--text-primary)] font-medium">{h.totalProductos}</td>
                          <td className="px-4 py-2 text-right text-[var(--text-primary)] hidden sm:table-cell">{h.totalUnidades}</td>
                          <td className="px-4 py-2 text-right font-medium text-[var(--text-primary)]">
                            {formatCurrency(h.valorCosto)}
                            {prev && (
                              <span className={cn("ml-1 text-[length:var(--ts-2xs)]", diff > 0 ? "text-[var(--data-success-500)]" : diff < 0 ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]")}>
                                {diff > 0 ? "+" : ""}{((diff / (prev.valorCosto || 1)) * 100).toFixed(0)}%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-[var(--text-secondary)] hidden sm:table-cell">{formatCurrency(h.valorPrecio)}</td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => setComparingIdx(comparingIdx === realIdx ? null : realIdx)}
                              className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 text-[var(--text-tertiary)] hover:text-primary transition-colors"
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
          <div className="h-16 w-16 rounded-xl bg-[var(--surface-sunken)] dark:bg-surface flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="h-8 w-8 text-[var(--text-tertiary)] dark:text-muted" />
          </div>
          <CardTitle className="text-lg font-semibold text-[var(--text-primary)] mb-2">Sin declaraciones</CardTitle>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md mx-auto">Genera un snapshot de tu inventario actual</p>
          <button onClick={handleGenerar} className="bg-primary text-white px-6 py-2.5 rounded-lg font-medium hover:bg-primary-dark">Generar declaración</button>
        </div>
      )}
    </div>
  );
}
