"use client";

import { useState, useMemo } from "react";
import {
  Boxes, Download, Search, Plus, X, Eye, Wrench,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetStatus = "activo" | "mantenimiento" | "dado-de-baja";
type AssetCategory = "equipo" | "mobiliario" | "vehiculo" | "electronico" | "infraestructura";

type Asset = {
  id: string;
  name: string;
  code: string;
  category: AssetCategory;
  status: AssetStatus;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLifeYears: number;
  location: string;
  responsible: string;
  lastMaintenance: string;
  nextMaintenance: string;
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function calcDepreciation(cost: number, lifeYears: number, acqDate: string): { accumulated: number; bookValue: number; pctDepreciated: number } {
  if (lifeYears <= 0) return { accumulated: 0, bookValue: cost, pctDepreciated: 0 };
  const yearsElapsed = Math.max(0, (Date.now() - new Date(acqDate).getTime()) / (365.25 * 86_400_000));
  const annualDep = cost / lifeYears;
  const accumulated = Math.min(cost, annualDep * yearsElapsed);
  const bookValue = Math.max(0, cost - accumulated);
  return { accumulated, bookValue, pctDepreciated: (accumulated / cost) * 100 };
}

const STATUS_META: Record<AssetStatus, { label: string; color: string; bg: string }> = {
  activo:         { label: "Activo",          color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  mantenimiento:  { label: "En mantenimiento", color: "text-amber-700 dark:text-amber-400",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  "dado-de-baja": { label: "Dado de baja",   color: "text-red-700 dark:text-red-400",         bg: "bg-red-100 dark:bg-red-900/30" },
};

const CATEGORY_META: Record<AssetCategory, { label: string }> = {
  equipo:          { label: "Equipo" },
  mobiliario:      { label: "Mobiliario" },
  vehiculo:        { label: "Vehículo" },
  electronico:     { label: "Electrónico" },
  infraestructura: { label: "Infraestructura" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: Asset[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssetManagerTab() {
  const [assets, setAssets] = useState<Asset[]>(SEED);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<AssetStatus | "todos">("todos");
  const [filterCat, setFilterCat] = useState<AssetCategory | "todos">("todos");
  const [detail, setDetail] = useState<Asset | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "", code: "", category: "equipo" as AssetCategory, acquisitionDate: "",
    acquisitionCost: "", usefulLifeYears: "5", location: "", responsible: "", notes: "",
  });

  const enriched = useMemo(() => {
    return assets.map(a => ({
      ...a,
      dep: calcDepreciation(a.acquisitionCost, a.usefulLifeYears, a.acquisitionDate),
    }));
  }, [assets]);

  const filtered = useMemo(() => {
    let list = [...enriched];
    if (filterStatus !== "todos") list = list.filter(a => a.status === filterStatus);
    if (filterCat !== "todos") list = list.filter(a => a.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) || a.location.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }, [enriched, filterStatus, filterCat, search]);

  const [currentTime] = useState(() => Date.now());

  const stats = useMemo(() => {
    const activos = enriched.filter(a => a.status === "activo").length;
    const totalCost = enriched.reduce((s, a) => s + a.acquisitionCost, 0);
    const totalBook = enriched.reduce((s, a) => s + a.dep.bookValue, 0);
    const totalDep = enriched.reduce((s, a) => s + a.dep.accumulated, 0);
    const needMaint = enriched.filter(a => {
      if (!a.nextMaintenance || a.status === "dado-de-baja") return false;
      return new Date(a.nextMaintenance).getTime() - currentTime < 30 * 86_400_000;
    }).length;
    return { total: enriched.length, activos, totalCost, totalBook, totalDep, needMaint };
  }, [enriched, currentTime]);

  function addAsset() {
    if (!form.name.trim() || !form.code.trim()) return;
    const now = form.acquisitionDate || new Date().toISOString().split("T")[0];
    const cost = parseFloat(form.acquisitionCost) || 0;
    const newA: Asset = {
      id: `a${Date.now()}`, name: form.name.trim(), code: form.code.trim(), category: form.category,
      status: "activo", acquisitionDate: now, acquisitionCost: cost,
      usefulLifeYears: parseInt(form.usefulLifeYears) || 5,
      location: form.location.trim(), responsible: form.responsible.trim(),
      lastMaintenance: "", nextMaintenance: "", notes: form.notes.trim(),
    };
    setAssets(prev => [newA, ...prev]);
    setForm({ name: "", code: "", category: "equipo", acquisitionDate: "", acquisitionCost: "", usefulLifeYears: "5", location: "", responsible: "", notes: "" });
    setShowForm(false);
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" /> Gestión de Activos Fijos
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Equipos, mobiliario, depreciación y mantenimiento</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Registrar activo
          </button>
          <button onClick={() => exportToCSV(filtered.map(a => ({ codigo: a.code, nombre: a.name, categoria: CATEGORY_META[a.category].label, estado: STATUS_META[a.status].label, fecha_adq: a.acquisitionDate, costo: a.acquisitionCost, vida_util: a.usefulLifeYears, dep_acum: a.dep.accumulated.toFixed(2), valor_libros: a.dep.bookValue.toFixed(2), ubicacion: a.location, responsable: a.responsible })), "activos-fijos")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: "Total activos", value: String(stats.total), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Activos operativos", value: String(stats.activos), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Costo adquisición", value: fmt(stats.totalCost), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
          { label: "Depreciación acum.", value: fmt(stats.totalDep), color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
          { label: "Valor en libros", value: fmt(stats.totalBook), color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950/30" },
          { label: "Mant. próximo (<30d)", value: String(stats.needMaint), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alert */}
      {stats.needMaint > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex flex-wrap items-start gap-3">
          <Wrench className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-700 dark:text-amber-400 text-sm">Mantenimientos próximos</p>
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">{stats.needMaint} activo(s) requieren mantenimiento en los próximos 30 días.</p>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-3">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground">Nuevo activo fijo</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre del activo *" className="col-span-full sm:col-span-2 px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="Código *" className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as AssetCategory }))} className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground">
              {(Object.keys(CATEGORY_META) as AssetCategory[]).map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
            </select>
            <input type="date" value={form.acquisitionDate} onChange={e => setForm(p => ({ ...p, acquisitionDate: e.target.value }))} className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" title="Fecha adquisición" />
            <input type="number" value={form.acquisitionCost} onChange={e => setForm(p => ({ ...p, acquisitionCost: e.target.value }))} placeholder="Costo (S/)" className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <input type="number" value={form.usefulLifeYears} onChange={e => setForm(p => ({ ...p, usefulLifeYears: e.target.value }))} placeholder="Vida útil (años)" className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Ubicación" className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <input value={form.responsible} onChange={e => setForm(p => ({ ...p, responsible: e.target.value }))} placeholder="Responsable" className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-surface">Cancelar</button>
            <button onClick={addAsset} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90">Registrar</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, código, ubicación..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as AssetStatus | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as AssetStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value as AssetCategory | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todas las categorías</option>
          {(Object.keys(CATEGORY_META) as AssetCategory[]).map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Código</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Activo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Categoría</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Costo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Val. libros</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-bold text-gray-500 dark:text-muted uppercase">% Dep.</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Ubicación</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">Sin activos.</td></tr>}
              {filtered.map(a => {
                const st = STATUS_META[a.status];
                return (
                  <tr key={a.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-mono font-bold text-gray-500">{a.code}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-gray-800 dark:text-foreground">{a.name}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 dark:text-muted">{CATEGORY_META[a.category].label}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>{st.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-gray-700 dark:text-foreground">{fmt(a.acquisitionCost)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-cyan-600">{fmt(a.dep.bookValue)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <div className="w-12 bg-gray-200 dark:bg-surface rounded-full h-2 overflow-hidden">
                          <div className={cn("h-full rounded-full", a.dep.pctDepreciated >= 90 ? "bg-red-500" : a.dep.pctDepreciated >= 50 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, a.dep.pctDepreciated)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{a.dep.pctDepreciated.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 dark:text-muted">{a.location}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <button onClick={() => setDetail(a)} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"><Eye className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface/50">
              <tr className="font-extrabold">
                <td colSpan={4} className="px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase text-gray-500">Totales</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-gray-700 dark:text-foreground">{fmt(stats.totalCost)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-cyan-600">{fmt(stats.totalBook)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (() => {
        const dep = calcDepreciation(detail.acquisitionCost, detail.usefulLifeYears, detail.acquisitionDate);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm">Detalle del activo</h3>
                <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  ["Código", detail.code], ["Nombre", detail.name], ["Categoría", CATEGORY_META[detail.category].label],
                  ["Estado", STATUS_META[detail.status].label], ["Fecha adquisición", fmtDate(detail.acquisitionDate)],
                  ["Costo adquisición", fmt(detail.acquisitionCost)], ["Vida útil", `${detail.usefulLifeYears} años`],
                  ["Dep. acumulada", fmt(dep.accumulated)], ["Valor en libros", fmt(dep.bookValue)],
                  ["% Depreciado", `${dep.pctDepreciated.toFixed(1)}%`], ["Ubicación", detail.location],
                  ["Responsable", detail.responsible || "—"],
                  ["Último mant.", detail.lastMaintenance ? fmtDate(detail.lastMaintenance) : "—"],
                  ["Próx. mant.", detail.nextMaintenance ? fmtDate(detail.nextMaintenance) : "—"],
                  ["Notas", detail.notes || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                    <span className="text-gray-500 dark:text-muted shrink-0">{k}</span>
                    <span className="font-semibold text-gray-800 dark:text-foreground text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
