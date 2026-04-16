"use client";

import { useState, useEffect, useMemo } from "react";
import {
  DollarSign, Plus, Pencil, Trash2, Check, MapPin,
  TrendingUp, TrendingDown, Download, X, ToggleLeft, ToggleRight,
  BarChart3, Clock,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type ShippingRule = {
  id: string;
  zone: string;
  minOrder: number;
  fee: number;
  freeAbove: number | null;
  estimatedMin: number;
  estimatedMax: number;
  active: boolean;
};

type ZoneStat = {
  zone: string;
  orders: number;
  revenue: number;
  avgFee: number;
  freeCount: number;
  paidCount: number;
};

type CostHistory = {
  month: string;
  totalCost: number;
  avgCost: number;
  orders: number;
};

const EMPTY_FORM = { zone: "", fee: 0, minOrder: 0, freeAbove: 0, estimatedMin: 15, estimatedMax: 30 };

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }
function pct(a: number, b: number) { return b > 0 ? `${((a / b) * 100).toFixed(0)}%` : "0%"; }

export default function ShippingCostsTab() {
  const [rules, setRules] = useState<ShippingRule[]>([]);
  const [zoneStats, setZoneStats] = useState<ZoneStat[]>([]);
  const [costHistory, setCostHistory] = useState<CostHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"rules" | "stats" | "history">("rules");
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<ShippingRule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/shipping-rules").then(r => r.ok ? r.json() : []),
      fetch("/api/shipping-stats").then(r => r.ok ? r.json() : []),
      fetch("/api/shipping-history").then(r => r.ok ? r.json() : []),
    ]).then(([rData, sData, hData]) => {
      if (!active) return;
      setRules(rData);
      setZoneStats(sData);
      setCostHistory(hData);
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const kpis = useMemo(() => {
    const totalRevenue = zoneStats.reduce((s, z) => s + z.revenue, 0);
    const totalOrders  = zoneStats.reduce((s, z) => s + z.orders, 0);
    const totalFree    = zoneStats.reduce((s, z) => s + z.freeCount, 0);
    const avgCost      = totalOrders > 0 ? totalRevenue / (totalOrders - totalFree) : 0;
    return { totalRevenue, totalOrders, totalFree, avgCost };
  }, [zoneStats]);

  const openCreate = () => { setEditRule(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit   = (r: ShippingRule) => {
    setEditRule(r);
    setForm({ zone: r.zone, fee: r.fee, minOrder: r.minOrder, freeAbove: r.freeAbove ?? 0, estimatedMin: r.estimatedMin, estimatedMax: r.estimatedMax });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.zone.trim()) return;
    const body = { ...form, freeAbove: form.freeAbove || null };
    if (editRule) {
      await fetch(`/api/shipping-rules/${editRule.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setRules(prev => prev.map(r => r.id === editRule.id ? { ...r, ...body } : r));
    } else {
      const res = await fetch("/api/shipping-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        const created: ShippingRule = await res.json();
        setRules(prev => [...prev, created]);
      }
    }
    setShowModal(false);
  };

  const toggleActive = async (id: string) => {
    const rule = rules.find(r => r.id === id);
    if (!rule) return;
    await fetch(`/api/shipping-rules/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !rule.active }) });
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const deleteRule = async (id: string) => {
    await fetch(`/api/shipping-rules/${id}`, { method: "DELETE" });
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const VIEWS = [
    { key: "rules",   label: "Tarifas" },
    { key: "stats",   label: "Por zona" },
    { key: "history", label: "Histórico" },
  ] as const;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Costos de Envío
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Tarifas por zona y análisis de costos de delivery</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                view === v.key ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted"
              )}
            >{v.label}</button>
          ))}
          {view === "rules" && (
            <button onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" /> Nueva tarifa
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Ingreso delivery (mes)", value: fmt(kpis.totalRevenue), color: "text-emerald-600", icon: TrendingUp },
          { label: "Pedidos con envío",       value: kpis.totalOrders,       color: "text-emerald-500",    icon: BarChart3 },
          { label: "Envíos gratis",            value: kpis.totalFree,         color: "text-violet-500",  icon: TrendingDown },
          { label: "Costo prom. pagado",       value: fmt(kpis.avgCost),      color: "text-amber-500",   icon: DollarSign },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 flex items-start gap-3">
            <div className={cn("p-2 rounded-lg bg-gray-50 dark:bg-surface", color)}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-muted leading-tight">{label}</p>
              <p className={cn("text-xl font-extrabold mt-0.5", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* View: Rules */}
      {view === "rules" && (
        <div className="space-y-3">
          {!loading && rules.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-card border border-dashed border-gray-200 dark:border-card-border rounded-xl">
              <MapPin className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-muted">Sin tarifas configuradas. Crea la primera zona.</p>
            </div>
          )}
          {rules.map(r => (
            <div key={r.id} className={cn("bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 sm:p-5 transition-all", !r.active && "opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{r.zone}</h4>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                      r.active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-gray-100 text-gray-500 dark:bg-surface dark:text-muted"
                    )}>
                      {r.active ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-muted">Tarifa</p>
                      <p className="text-sm font-extrabold text-primary">{fmt(r.fee)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-muted">Pedido mínimo</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-foreground">{r.minOrder > 0 ? fmt(r.minOrder) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-muted">Gratis desde</p>
                      <p className="text-sm font-bold text-emerald-600">{r.freeAbove ? fmt(r.freeAbove) : "No aplica"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 dark:text-muted flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Tiempo est.
                      </p>
                      <p className="text-sm font-bold text-gray-900 dark:text-foreground">{r.estimatedMin}–{r.estimatedMax} min</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(r.id)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-gray-400 hover:text-primary transition"
                    title={r.active ? "Desactivar" : "Activar"}
                  >
                    {r.active ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button onClick={() => openEdit(r)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-gray-400 hover:text-primary transition">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => deleteRule(r.id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500 transition">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View: Zone stats */}
      {view === "stats" && (
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
            <h3 className="font-bold text-sm text-gray-700 dark:text-foreground">Estadísticas por zona — este mes</h3>
            <button
              onClick={() => exportToCSV(zoneStats.map(s => ({ zona: s.zone, pedidos: s.orders, ingreso: s.revenue, costo_prom: s.avgFee, gratis: s.freeCount, pagados: s.paidCount })), "costos-envio-zonas")}
              className="text-xs text-primary font-semibold flex items-center gap-1"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-gray-400 bg-gray-50/50 dark:bg-surface/50">
                  <th className="px-4 py-3">Zona</th>
                  <th className="px-4 py-3 text-right">Pedidos</th>
                  <th className="px-4 py-3 text-right">Ingreso</th>
                  <th className="px-4 py-3 text-right">Costo prom.</th>
                  <th className="px-4 py-3 text-right">Gratis</th>
                  <th className="px-4 py-3 text-right">% gratis</th>
                </tr>
              </thead>
              <tbody>
                {zoneStats.map(s => (
                  <tr key={s.zone} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/10">
                    <td className="px-4 py-3 font-semibold text-gray-800 dark:text-foreground flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary shrink-0" /> {s.zone}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-foreground">{s.orders}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{fmt(s.revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-foreground">{fmt(s.avgFee)}</td>
                    <td className="px-4 py-3 text-right text-violet-600 font-semibold">{s.freeCount}</td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-muted text-xs">{pct(s.freeCount, s.orders)}</td>
                  </tr>
                ))}
                {zoneStats.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Sin datos este mes</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View: History */}
      {view === "history" && (
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-surface border-b border-gray-100 dark:border-card-border">
            <h3 className="font-bold text-sm text-gray-700 dark:text-foreground">Histórico mensual de costos</h3>
            <button
              onClick={() => exportToCSV(costHistory.map(h => ({ mes: h.month, total: h.totalCost, prom: h.avgCost, pedidos: h.orders })), "historial-costos-envio")}
              className="text-xs text-primary font-semibold flex items-center gap-1"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-gray-400 bg-gray-50/50 dark:bg-surface/50">
                  <th className="px-4 py-3">Mes</th>
                  <th className="px-4 py-3 text-right">Pedidos</th>
                  <th className="px-4 py-3 text-right">Costo total</th>
                  <th className="px-4 py-3 text-right">Costo prom.</th>
                </tr>
              </thead>
              <tbody>
                {costHistory.map(h => (
                  <tr key={h.month} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/10">
                    <td className="px-4 py-3 font-semibold text-gray-800 dark:text-foreground capitalize">{h.month}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-muted">{h.orders}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-foreground">{fmt(h.totalCost)}</td>
                    <td className="px-4 py-3 text-right text-primary font-semibold">{fmt(h.avgCost)}</td>
                  </tr>
                ))}
                {costHistory.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Sin historial disponible</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-white dark:bg-card rounded-xl p-4 sm:p-6 max-w-md w-full border border-gray-200 dark:border-card-border"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground">
                {editRule ? "Editar tarifa" : "Nueva tarifa de envío"}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-surface">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted">Zona / Barrio</label>
                <input
                  value={form.zone}
                  onChange={e => setForm({ ...form, zone: e.target.value })}
                  placeholder="Ej: Yarinacocha, Callería..."
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-muted">Tarifa (S/)</label>
                  <input type="number" step="0.5" min="0" value={form.fee} onChange={e => setForm({ ...form, fee: +e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 dark:text-muted">Pedido mínimo (S/)</label>
                  <input type="number" min="0" value={form.minOrder} onChange={e => setForm({ ...form, minOrder: +e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted">Gratis desde (S/) <span className="font-normal text-gray-400">— 0 = no aplica</span></label>
                <input type="number" min="0" value={form.freeAbove} onChange={e => setForm({ ...form, freeAbove: +e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted">Tiempo estimado (minutos)</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <input type="number" min="0" value={form.estimatedMin} onChange={e => setForm({ ...form, estimatedMin: +e.target.value })}
                    placeholder="Mín" className="px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
                  <input type="number" min="0" value={form.estimatedMax} onChange={e => setForm({ ...form, estimatedMax: +e.target.value })}
                    placeholder="Máx" className="px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
              <button onClick={save} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90 flex items-center gap-1.5">
                <Check className="h-4 w-4" /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
