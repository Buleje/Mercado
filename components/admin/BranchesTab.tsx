"use client";

import { useState, useMemo } from "react";
import {
  Store, Download, Search, X, ArrowRightLeft,
  MapPin, Phone, CheckCircle2, XCircle, BarChart3,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type BranchStatus = "activa" | "inactiva";

type Branch = {
  id: string;
  code: string;
  name: string;
  address: string;
  district: string;
  phone: string;
  responsible: string;
  status: BranchStatus;
  monthlyRevenue: number;
  inventory: { product: string; stock: number; unit: string }[];
};

type Transfer = {
  id: string;
  date: string;
  from: string;
  to: string;
  product: string;
  qty: number;
  unit: string;
  status: "pendiente" | "en-transito" | "completada";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

// ── Seed Data ─────────────────────────────────────────────────────────────────

const BRANCHES: Branch[] = [];

const TRANSFERS: Transfer[] = [];

const TRANSFER_STATUS: Record<Transfer["status"], { label: string; color: string; bg: string }> = {
  pendiente:     { label: "Pendiente",    color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  "en-transito": { label: "En Tránsito", color: "text-emerald-600",    bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  completada:    { label: "Completada",   color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BranchesTab() {
  const [branches] = useState(BRANCHES);
  const [transfers] = useState(TRANSFERS);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"branches" | "transfers">("branches");
  const [detail, setDetail] = useState<Branch | null>(null);

  const activeBranches = useMemo(() => branches.filter(b => b.status === "activa"), [branches]);

  const filteredBranches = useMemo(() => {
    if (!search.trim()) return branches;
    const q = search.toLowerCase();
    return branches.filter(b => b.name.toLowerCase().includes(q) || b.district.toLowerCase().includes(q) || b.code.toLowerCase().includes(q));
  }, [branches, search]);

  const stats = useMemo(() => {
    const totalRevenue = activeBranches.reduce((s, b) => s + b.monthlyRevenue, 0);
    const totalStock = branches.reduce((s, b) => s + b.inventory.reduce((a, i) => a + i.stock, 0), 0);
    const pendingTransfers = transfers.filter(t => t.status !== "completada").length;
    return { active: activeBranches.length, totalRevenue, totalStock, pendingTransfers };
  }, [activeBranches, branches, transfers]);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Store className="h-6 w-6 text-primary" /> Multi-Sucursal
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Gestión de sucursales, inventario y transferencias inter-sede</p>
        </div>
        <button onClick={() => exportToCSV(branches.map(b => ({ codigo: b.code, nombre: b.name, distrito: b.district, estado: b.status, venta_mensual: b.monthlyRevenue, responsable: b.responsible })), "sucursales")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Sucursales activas", value: String(stats.active), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Venta mensual total", value: fmt(stats.totalRevenue), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Stock consolidado", value: stats.totalStock.toLocaleString("es-PE") + " uds", color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
          { label: "Transferencias activas", value: String(stats.pendingTransfers), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {([["branches", "Sucursales"], ["transfers", "Transferencias"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold transition-colors", view === k ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-accent")}>
            {label}
          </button>
        ))}
      </div>

      {view === "branches" && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar sucursal..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
          </div>

          <div className="grid gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBranches.map(b => (
              <div key={b.id} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3 hover:shadow-lg transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm text-gray-900 dark:text-foreground">{b.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{b.code}</p>
                  </div>
                  <span className={cn("flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", b.status === "activa" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-red-100 dark:bg-red-900/30 text-red-500")}>
                    {b.status === "activa" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {b.status === "activa" ? "Activa" : "Inactiva"}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-500 dark:text-muted">
                  <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{b.address}, {b.district}</p>
                  <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{b.phone}</p>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-muted">Venta mensual</span>
                  <span className="font-bold text-emerald-600">{fmt(b.monthlyRevenue)}</span>
                </div>
                {b.status === "activa" && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-muted">SKUs en stock</span>
                    <span className="font-bold text-gray-700 dark:text-foreground">{b.inventory.length} productos</span>
                  </div>
                )}
                <button onClick={() => setDetail(b)} className="w-full text-center text-xs font-bold text-primary hover:underline pt-1">Ver inventario</button>
              </div>
            ))}
          </div>
        </>
      )}

      {view === "transfers" && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
                <tr>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Fecha</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Origen → Destino</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Producto</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Cantidad</th>
                  <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {transfers.map(t => {
                  const st = TRANSFER_STATUS[t.status];
                  return (
                    <tr key={t.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500">{t.date}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-semibold text-gray-700 dark:text-foreground flex items-center gap-1">{t.from} <ArrowRightLeft className="h-3 w-3 text-gray-400" /> {t.to}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-600 dark:text-muted">{t.product}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-700 dark:text-foreground">{t.qty} {t.unit}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Revenue comparison */}
      {view === "branches" && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-3">
          <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Comparativa de ventas mensuales</h3>
          <div className="space-y-2">
            {activeBranches.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue).map(b => {
              const maxRev = Math.max(...activeBranches.map(x => x.monthlyRevenue));
              const pct = maxRev > 0 ? (b.monthlyRevenue / maxRev) * 100 : 0;
              return (
                <div key={b.id} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-700 dark:text-foreground">{b.name}</span>
                    <span className="font-bold text-emerald-600">{fmt(b.monthlyRevenue)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Branch inventory modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm">{detail.name}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <p className="text-xs text-gray-500 dark:text-muted">{detail.address}, {detail.district}</p>
            {detail.inventory.length > 0 ? (
              <div className="space-y-1">
                {detail.inventory.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-surface rounded-xl px-3 py-2">
                    <span className="text-gray-600 dark:text-muted">{item.product}</span>
                    <span className="font-bold text-gray-800 dark:text-foreground">{item.stock} {item.unit}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">Sin inventario registrado</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
