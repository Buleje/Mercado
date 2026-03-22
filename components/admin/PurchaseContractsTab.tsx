"use client";

import { useState, useMemo } from "react";
import {
  FileSignature, Plus, X, Download, Search,
  CheckCircle, AlertTriangle, Clock, RefreshCw, Eye,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ContractStatus = "activo" | "por-vencer" | "vencido" | "cancelado" | "en-negociacion";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
function contractStatus(endDate: string, manually?: ContractStatus): ContractStatus {
  if (manually === "cancelado" || manually === "en-negociacion") return manually;
  const d = daysUntil(endDate);
  if (d < 0) return "vencido";
  if (d <= 30) return "por-vencer";
  return "activo";
}
function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function addDays(d: number): string {
  const dt = new Date(); dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

const STATUS_META: Record<ContractStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  activo:           { label: "Activo",          color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", icon: CheckCircle   },
  "por-vencer":     { label: "Por vencer",       color: "text-amber-700 dark:text-amber-400",    bg: "bg-amber-100 dark:bg-amber-900/30",    icon: Clock         },
  vencido:          { label: "Vencido",          color: "text-red-700 dark:text-red-400",         bg: "bg-red-100 dark:bg-red-900/30",        icon: AlertTriangle },
  cancelado:        { label: "Cancelado",        color: "text-gray-600 dark:text-muted",          bg: "bg-gray-100 dark:bg-surface",          icon: X             },
  "en-negociacion": { label: "En negociación",   color: "text-blue-700 dark:text-blue-400",       bg: "bg-blue-100 dark:bg-blue-900/30",      icon: RefreshCw     },
};

type Contract = {
  id: string; code: string; supplierName: string; supplierRuc: string;
  category: string; description: string; startDate: string; endDate: string;
  creditDays: number; minOrderAmount: number; agreedDiscount: number;
  currency: "PEN" | "USD"; status: ContractStatus; autoRenew: boolean;
  contactName: string; contactPhone: string; notes: string;
  linkedPOs: number; totalSpend: number;
};

const SEED: Contract[] = [];

const EMPTY: Omit<Contract, "id" | "code"> = {
  supplierName: "", supplierRuc: "", category: "Abarrotes", description: "",
  startDate: "", endDate: "", creditDays: 30, minOrderAmount: 500,
  agreedDiscount: 0, currency: "PEN", status: "activo", autoRenew: false,
  contactName: "", contactPhone: "", notes: "", linkedPOs: 0, totalSpend: 0,
};

const CATEGORIES = ["Abarrotes", "Bebidas", "Lácteos", "Limpieza e Higiene", "Perecederos", "Servicios", "Equipos", "Congelados", "Otros"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function PurchaseContractsTab() {
  const [contracts, setContracts] = useState<Contract[]>(SEED);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ContractStatus | "todos">("todos");
  const [filterCat, setFilterCat] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Contract, "id" | "code">>({ ...EMPTY });
  const [detail, setDetail] = useState<Contract | null>(null);

  const processed = useMemo(() => {
    let list = contracts.map(c => ({ ...c, computedStatus: contractStatus(c.endDate, c.status === "cancelado" || c.status === "en-negociacion" ? c.status : undefined) }));
    if (filterStatus !== "todos") list = list.filter(c => c.computedStatus === filterStatus);
    if (filterCat !== "todos") list = list.filter(c => c.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.supplierName.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
    }
    return list;
  }, [contracts, filterStatus, filterCat, search]);

  const stats = useMemo(() => ({
    total: contracts.length,
    activo: contracts.filter(c => contractStatus(c.endDate) === "activo").length,
    porVencer: contracts.filter(c => contractStatus(c.endDate) === "por-vencer").length,
    vencido: contracts.filter(c => contractStatus(c.endDate) === "vencido").length,
    totalSpend: contracts.reduce((s, c) => s + c.totalSpend, 0),
  }), [contracts]);

  function handleAdd() {
    if (!form.supplierName.trim() || !form.startDate || !form.endDate) return;
    const code = `CT-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(3, "0")}`;
    const c: Contract = { ...form, id: `c-${Date.now()}`, code };
    setContracts(prev => [c, ...prev]);
    setShowForm(false);
    setForm({ ...EMPTY });
  }

  function handleRenew(id: string) {
    setContracts(prev => prev.map(c => {
      if (c.id !== id) return c;
      const newEnd = new Date(c.endDate);
      newEnd.setFullYear(newEnd.getFullYear() + 1);
      return { ...c, endDate: newEnd.toISOString().slice(0, 10), status: "activo" };
    }));
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <FileSignature className="h-6 w-6 text-primary" /> Contratos con Proveedores
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Gestión de contratos de compra, plazos, descuentos y renovaciones</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => exportToCSV(processed.map(c => ({ codigo: c.code, proveedor: c.supplierName, ruc: c.supplierRuc, categoria: c.category, inicio: c.startDate, fin: c.endDate, credito_dias: c.creditDays, pedido_min: c.minOrderAmount, descuento_pct: c.agreedDiscount, estado: c.computedStatus, renovacion_auto: c.autoRenew, ocs_vinculadas: c.linkedPOs, gasto_total: c.totalSpend })), "contratos-proveedores")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nuevo contrato
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total contratos", value: String(stats.total), color: "text-gray-700 dark:text-foreground",   bg: "bg-gray-50 dark:bg-surface/50" },
          { label: "Activos",         value: String(stats.activo), color: "text-emerald-600",                    bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Por vencer",      value: String(stats.porVencer), color: "text-amber-600",                   bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Vencidos",        value: String(stats.vencido), color: "text-red-500",                       bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "Gasto total",     value: fmt(stats.totalSpend), color: "text-violet-600",                    bg: "bg-violet-50 dark:bg-violet-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(stats.porVencer > 0 || stats.vencido > 0) && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-700 dark:text-amber-400 text-sm">Contratos que necesitan atención</p>
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
              {stats.vencido > 0 && <span>{stats.vencido} contrato(s) <strong>vencido(s)</strong> — requieren renovación o cancelación. </span>}
              {stats.porVencer > 0 && <span>{stats.porVencer} contrato(s) vencen en los próximos 30 días.</span>}
            </p>
          </div>
        </div>
      )}

      {/* New contract form */}
      {showForm && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-foreground text-sm flex flex-wrap items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Nuevo contrato</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <CF label="Proveedor *" value={form.supplierName} onChange={v => setForm(p => ({ ...p, supplierName: v }))} placeholder="Nombre del proveedor" span={2} />
            <CF label="RUC" value={form.supplierRuc} onChange={v => setForm(p => ({ ...p, supplierRuc: v }))} placeholder="20XXXXXXXXX" />
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Categoría</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <CF label="Descripción" value={form.description} onChange={v => setForm(p => ({ ...p, description: v }))} placeholder="Productos incluidos..." span={2} />
            <CF label="Fecha inicio *" value={form.startDate} onChange={v => setForm(p => ({ ...p, startDate: v }))} type="date" />
            <CF label="Fecha fin *" value={form.endDate} onChange={v => setForm(p => ({ ...p, endDate: v }))} type="date" />
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Crédito (días)</label>
              <input type="number" value={form.creditDays} onChange={e => setForm(p => ({ ...p, creditDays: parseInt(e.target.value) || 0 }))} min="0" className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Pedido mínimo (S/)</label>
              <input type="number" value={form.minOrderAmount} onChange={e => setForm(p => ({ ...p, minOrderAmount: parseFloat(e.target.value) || 0 }))} min="0" step="100" className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">Descuento acordado (%)</label>
              <input type="number" value={form.agreedDiscount} onChange={e => setForm(p => ({ ...p, agreedDiscount: parseFloat(e.target.value) || 0 }))} min="0" max="100" step="0.5" className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex flex-wrap items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.autoRenew} onChange={e => setForm(p => ({ ...p, autoRenew: e.target.checked }))} className="w-4 h-4 rounded accent-primary" />
                <span className="text-sm font-semibold text-gray-700 dark:text-foreground">Renovación automática</span>
              </label>
            </div>
            <CF label="Contacto proveedor" value={form.contactName} onChange={v => setForm(p => ({ ...p, contactName: v }))} placeholder="Nombre del contacto" />
            <CF label="Teléfono contacto" value={form.contactPhone} onChange={v => setForm(p => ({ ...p, contactPhone: v }))} placeholder="Teléfono" />
            <CF label="Notas" value={form.notes} onChange={v => setForm(p => ({ ...p, notes: v }))} placeholder="Condiciones especiales..." span={2} />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted">Cancelar</button>
            <button onClick={handleAdd} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-xl bg-primary text-white font-semibold hover:bg-primary/90">Registrar contrato</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Proveedor, código, categoría..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ContractStatus | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as ContractStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todas las categorías</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {processed.length === 0 && <p className="text-center text-sm text-gray-400 dark:text-muted py-8">No se encontraron contratos con los filtros seleccionados.</p>}
        {processed.map(c => {
          const meta = STATUS_META[c.computedStatus];
          const Icon = meta.icon;
          const dLeft = daysUntil(c.endDate);
          return (
            <div key={c.id} className={cn("bg-white dark:bg-card border rounded-2xl p-3 sm:p-5", c.computedStatus === "vencido" ? "border-red-200 dark:border-red-800" : c.computedStatus === "por-vencer" ? "border-amber-200 dark:border-amber-800" : "border-gray-200 dark:border-card-border")}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-mono font-bold text-gray-400">{c.code}</span>
                        <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", meta.bg, meta.color)}><Icon className="h-3 w-3" />{meta.label}</span>
                        {c.autoRenew && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Auto-renovación</span>}
                      </div>
                      <p className="font-extrabold text-gray-900 dark:text-foreground">{c.supplierName}</p>
                      <p className="text-xs text-gray-500 dark:text-muted">{c.category} · {c.description}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-3">
                    <div className="bg-gray-50 dark:bg-surface/50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 dark:text-muted mb-0.5">Vigencia</p>
                      <p className="font-semibold text-gray-700 dark:text-foreground text-xs">{fmtDate(c.startDate)} — {fmtDate(c.endDate)}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-surface/50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 dark:text-muted mb-0.5">Crédito</p>
                      <p className="font-bold text-gray-700 dark:text-foreground">{c.creditDays} días</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-surface/50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 dark:text-muted mb-0.5">Descuento acordado</p>
                      <p className="font-bold text-emerald-600">{c.agreedDiscount}%</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-surface/50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 dark:text-muted mb-0.5">Gasto acumulado</p>
                      <p className="font-bold text-violet-600">{fmt(c.totalSpend)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <div className={cn("text-center px-3 py-2 rounded-xl text-xs font-extrabold", dLeft < 0 ? "bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400" : dLeft <= 30 ? "bg-amber-100 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400" : "bg-gray-100 text-gray-600 dark:bg-surface dark:text-muted")}>
                    {dLeft < 0 ? `${Math.abs(dLeft)}d vencido` : dLeft === 0 ? "Vence hoy" : `${dLeft}d restantes`}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setDetail(c)} className="p-2 rounded-xl border border-gray-200 dark:border-card-border text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {(c.computedStatus === "vencido" || c.computedStatus === "por-vencer") && (
                      <button onClick={() => handleRenew(c.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors">
                        <RefreshCw className="h-3 w-3" /> Renovar +1 año
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm">Detalle del contrato</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Código", detail.code], ["Proveedor", detail.supplierName], ["RUC", detail.supplierRuc],
                ["Categoría", detail.category], ["Descripción", detail.description],
                ["Inicio", fmtDate(detail.startDate)], ["Vencimiento", fmtDate(detail.endDate)],
                ["Crédito", `${detail.creditDays} días`], ["Pedido mínimo", fmt(detail.minOrderAmount)],
                ["Descuento acordado", `${detail.agreedDiscount}%`], ["OCs vinculadas", String(detail.linkedPOs)],
                ["Gasto acumulado", fmt(detail.totalSpend)], ["Contacto", detail.contactName],
                ["Teléfono", detail.contactPhone], ["Notas", detail.notes || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                  <span className="text-gray-500 dark:text-muted shrink-0">{k}</span>
                  <span className="font-semibold text-gray-800 dark:text-foreground text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CF({ label, value, onChange, type = "text", placeholder, span }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; span?: number }) {
  return (
    <div className={span ? `col-span-${span}` : ""}>
      <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
    </div>
  );
}
