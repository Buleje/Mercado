"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Receipt, Loader2, RefreshCw, AlertTriangle,
  CheckCircle, BookOpen,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type TaxLine = {
  id: string;
  date: string;
  type: "venta" | "compra";
  docType: string;     // Factura / Boleta
  serie: string;
  number: string;
  entity: string;      // Cliente o Proveedor
  entityDoc: string;   // RUC/DNI
  base: number;        // Base imponible
  igv: number;         // IGV = base * 0.18
  total: number;
  status: "pendiente" | "declarado";
};

type PeriodSummary = {
  salesBase: number;
  salesIGV: number;
  purchasesBase: number;
  purchasesIGV: number;
  igvBalance: number;   // IGV ventas - IGV compras = saldo a pagar/favor
};

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function fmt(n: number) {
  return `S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

// Build mock tax lines
function buildMockLines(year: number, month: number): TaxLine[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const days = [2, 5, 7, 10, 12, 14, 17, 19, 22, 25, 28];
  const entities = ["Restaurante El Sol SAC", "Bodega Don Pepe", "María García", "Carlos López", "Proveedo Alimentos SA", "Distribuidora Lima"];
  const result: TaxLine[] = [];

  for (let i = 0; i < days.length; i++) {
    const date = `${prefix}-${String(days[i]).padStart(2, "0")}`;
    const isVenta = i % 3 !== 0;
    const base = parseFloat((200 + Math.random() * 1500).toFixed(2));
    const igv = parseFloat((base * 0.18).toFixed(2));
    result.push({
      id: `tx-${i}`,
      date,
      type: isVenta ? "venta" : "compra",
      docType: isVenta ? (i % 2 === 0 ? "Boleta" : "Factura") : "Factura",
      serie: isVenta ? (i % 2 === 0 ? "B001" : "F001") : "FC01",
      number: String(i + 1).padStart(8, "0"),
      entity: entities[i % entities.length],
      entityDoc: isVenta ? `${10000000 + i * 1234567}` : `20${513000000 + i * 123456}`,
      base,
      igv,
      total: parseFloat((base + igv).toFixed(2)),
      status: i < 6 ? "declarado" : "pendiente",
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaxTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<TaxLine[]>([]);
  const [view, setView] = useState<"ventas" | "compras" | "resumen">("resumen");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    Promise.all([
      fetch(`/api/orders?from=${from}&to=${to}`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([orders]) => {
      if (!active) return;
      // If real orders exist, generate tax lines from them; else use mock
      if (Array.isArray(orders) && orders.length > 0) {
        const realLines: TaxLine[] = orders
          .filter((o: { status: string }) => o.status === "entregado" || o.status === "confirmado")
          .map((o: { id: string; createdAt: string; total: number; customer: { name: string; phone: string } }, i: number) => {
            const base = parseFloat((o.total / 1.18).toFixed(2));
            const igv = parseFloat((o.total - base).toFixed(2));
            return {
              id: `ord-${o.id}`,
              date: o.createdAt.slice(0, 10),
              type: "venta" as const,
              docType: "Boleta",
              serie: "B001",
              number: String(i + 1).padStart(8, "0"),
              entity: o.customer?.name ?? "Cliente",
              entityDoc: o.customer?.phone ?? "—",
              base, igv, total: o.total,
              status: "pendiente" as const,
            };
          });
        setLines(realLines.length > 0 ? realLines : buildMockLines(year, month));
      } else {
        setLines(buildMockLines(year, month));
      }
      setLoading(false);
    });

    return () => { active = false; };
  }, [year, month, tick]);

  const summary = useMemo<PeriodSummary>(() => {
    const ventas = lines.filter(l => l.type === "venta");
    const compras = lines.filter(l => l.type === "compra");
    const salesBase = ventas.reduce((s, l) => s + l.base, 0);
    const salesIGV = ventas.reduce((s, l) => s + l.igv, 0);
    const purchasesBase = compras.reduce((s, l) => s + l.base, 0);
    const purchasesIGV = compras.reduce((s, l) => s + l.igv, 0);
    return { salesBase, salesIGV, purchasesBase, purchasesIGV, igvBalance: salesIGV - purchasesIGV };
  }, [lines]);

  const visibleLines = view === "resumen" ? lines : lines.filter(l => l.type === (view === "ventas" ? "venta" : "compra"));

  const handleDeclare = (id: string) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, status: "declarado" } : l));
  };

  const handleExportBook = (type: "ventas" | "compras") => {
    const filtered = lines.filter(l => l.type === (type === "ventas" ? "venta" : "compra"));
    exportToCSV(filtered.map(l => ({ fecha: l.date, tipo_doc: l.docType, serie: l.serie, numero: l.number, entidad: l.entity, ruc_dni: l.entityDoc, base_imponible: l.base, igv: l.igv, total: l.total, estado: l.status })), `libro-${type}-${MONTHS[month]}-${year}`);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Impuestos &amp; IGV
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Registro de ventas y compras, libro tributario, IGV a pagar</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
            {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setTick(t => t + 1)} className="p-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4 text-gray-500 dark:text-muted" />
          </button>
          <button onClick={() => handleExportBook("ventas")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <BookOpen className="h-4 w-4" /> Libro ventas
          </button>
          <button onClick={() => handleExportBook("compras")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <BookOpen className="h-4 w-4" /> Libro compras
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* IGV Balance card */}
          <div className={cn("rounded-2xl p-3 sm:p-6 border", summary.igvBalance > 0 ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40" : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40")}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-500 dark:text-muted mb-1">IGV del período — {MONTHS[month]} {year}</p>
                <p className={cn("text-4xl font-extrabold", summary.igvBalance > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>
                  {fmt(summary.igvBalance)}
                </p>
                <p className={cn("text-sm font-semibold mt-1", summary.igvBalance > 0 ? "text-amber-600 dark:text-amber-500" : "text-emerald-600 dark:text-emerald-500")}>
                  {summary.igvBalance > 0 ? "IGV a pagar a SUNAT" : "Crédito fiscal a favor"}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
                <div className="bg-white/60 dark:bg-card/40 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-muted mb-1">IGV Ventas</p>
                  <p className="font-extrabold text-emerald-600">{fmt(summary.salesIGV)}</p>
                  <p className="text-xs text-gray-400 dark:text-muted">Base: {fmt(summary.salesBase)}</p>
                </div>
                <div className="bg-white/60 dark:bg-card/40 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-muted mb-1">IGV Compras</p>
                  <p className="font-extrabold text-emerald-600">{fmt(summary.purchasesIGV)}</p>
                  <p className="text-xs text-gray-400 dark:text-muted">Base: {fmt(summary.purchasesBase)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {(["resumen", "ventas", "compras"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold rounded-xl transition-colors capitalize", view === v ? "bg-primary text-white" : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
                {v === "resumen" ? "Todos" : v === "ventas" ? "Libro de ventas" : "Libro de compras"}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-y-hidden overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
                <tr>
                  <th className="text-left px-5 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase">Fecha</th>
                  <th className="text-left px-3 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase">Tipo</th>
                  <th className="text-left px-3 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase hidden sm:table-cell">Doc</th>
                  <th className="text-left px-3 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase">Entidad</th>
                  <th className="text-right px-3 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase hidden sm:table-cell">Base</th>
                  <th className="text-right px-3 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase">IGV</th>
                  <th className="text-right px-3 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase">Total</th>
                  <th className="text-center px-3 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase hidden sm:table-cell">Estado</th>
                  <th className="text-center px-3 py-3 font-bold text-gray-500 dark:text-muted text-xs uppercase hidden sm:table-cell">Acc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {visibleLines.map(line => (
                  <tr key={line.id} className="hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
                    <td className="px-5 py-3 text-xs text-gray-500 dark:text-muted">{fmtDate(line.date)}</td>
                    <td className="px-3 py-3">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", line.type === "venta" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400")}>
                        {line.type === "venta" ? "V" : "C"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 dark:text-muted hidden sm:table-cell font-mono">{line.serie}-{line.number}</td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-gray-800 dark:text-foreground truncate max-w-[140px]">{line.entity}</p>
                      <p className="text-xs text-gray-400 dark:text-muted">{line.entityDoc}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-gray-600 dark:text-muted hidden sm:table-cell">{fmt(line.base)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-amber-600">{fmt(line.igv)}</td>
                    <td className="px-3 py-3 text-right font-bold text-gray-800 dark:text-foreground">{fmt(line.total)}</td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", line.status === "declarado" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-600 dark:bg-surface dark:text-muted")}>
                        {line.status === "declarado" ? "Declarado" : "Pendiente"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center hidden sm:table-cell">
                      {line.status === "pendiente" && (
                        <button onClick={() => handleDeclare(line.id)} className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-semibold transition-colors">Declarar</button>
                      )}
                      {line.status === "declarado" && <CheckCircle className="h-4 w-4 text-emerald-500 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleLines.length === 0 && <p className="text-center py-10 text-gray-400 dark:text-muted text-sm">Sin registros para el período.</p>}
          </div>

          {/* Pending alert */}
          {lines.filter(l => l.status === "pendiente").length > 0 && (
            <div className="flex flex-wrap items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-2 sm:px-4 py-2 sm:py-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Registros pendientes de declaración</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                  Tienes {lines.filter(l => l.status === "pendiente").length} registro(s) aún no marcados como declarados ante SUNAT.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
