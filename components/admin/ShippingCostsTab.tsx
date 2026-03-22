"use client";

import { useState } from "react";
import { DollarSign, Plus, Pencil, Trash2, Check, MapPin, ArrowUpDown, Download } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type ShippingRule = {
  id: string; zone: string; minOrder: number; maxOrder: number | null; fee: number; freeAbove: number | null;
  estimatedMin: number; estimatedMax: number; active: boolean;
};

const SEED: ShippingRule[] = [];

type DeliveryStats = { zone: string; orders: number; revenue: number; avgTicket: number; freeDeliveries: number };
const STATS: DeliveryStats[] = [];

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

export default function ShippingCostsTab() {
  const [rules, setRules] = useState(SEED);
  const [view, setView] = useState<"rules" | "stats">("rules");
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<ShippingRule | null>(null);
  const [form, setForm] = useState({ zone: "", fee: 0, minOrder: 0, freeAbove: 0, estimatedMin: 15, estimatedMax: 30 });

  const totalRevenue = STATS.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = STATS.reduce((s, r) => s + r.orders, 0);
  const totalFree = STATS.reduce((s, r) => s + r.freeDeliveries, 0);

  const openCreate = () => { setEditRule(null); setForm({ zone: "", fee: 0, minOrder: 0, freeAbove: 0, estimatedMin: 15, estimatedMax: 30 }); setShowModal(true); };
  const openEdit = (r: ShippingRule) => { setEditRule(r); setForm({ zone: r.zone, fee: r.fee, minOrder: r.minOrder, freeAbove: r.freeAbove ?? 0, estimatedMin: r.estimatedMin, estimatedMax: r.estimatedMax }); setShowModal(true); };
  const save = () => {
    if (!form.zone.trim()) return;
    if (editRule) {
      setRules(prev => prev.map(r => r.id === editRule.id ? { ...r, zone: form.zone, fee: form.fee, minOrder: form.minOrder, freeAbove: form.freeAbove || null, estimatedMin: form.estimatedMin, estimatedMax: form.estimatedMax } : r));
    } else {
      setRules(prev => [...prev, { id: `c${Date.now()}`, zone: form.zone, minOrder: form.minOrder, maxOrder: null, fee: form.fee, freeAbove: form.freeAbove || null, estimatedMin: form.estimatedMin, estimatedMax: form.estimatedMax, active: true }]);
    }
    setShowModal(false);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><DollarSign className="h-6 w-6 text-primary" /> Costos de Envío</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Configura tarifas de delivery por zona y condiciones</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setView("rules")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "rules" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Tarifas</button>
          <button onClick={() => setView("stats")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", view === "stats" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Estadísticas</button>
          {view === "rules" && <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90"><Plus className="h-3.5 w-3.5" /> Nueva tarifa</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Ingreso delivery (mes)", value: fmt(totalRevenue), color: "text-emerald-500" },
          { label: "Pedidos con envío", value: totalOrders, color: "text-blue-500" },
          { label: "Envíos gratis", value: totalFree, color: "text-violet-500" },
          { label: "Zonas activas", value: rules.filter(r => r.active).length, color: "text-amber-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {view === "rules" ? (
        <div className="space-y-3">
          {rules.map(r => (
            <div key={r.id} className={cn("bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5 transition-all", !r.active && "opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <MapPin className="h-4 w-4 text-primary" />
                    <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{r.zone}</h4>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", r.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-500 dark:bg-surface dark:text-muted")}>{r.active ? "Activa" : "Inactiva"}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                    <div><p className="text-[10px] text-gray-400">Tarifa</p><p className="text-sm font-extrabold text-primary">{fmt(r.fee)}</p></div>
                    <div><p className="text-[10px] text-gray-400">Pedido mínimo</p><p className="text-sm font-bold text-gray-900 dark:text-foreground">{r.minOrder > 0 ? fmt(r.minOrder) : "Sin mínimo"}</p></div>
                    <div><p className="text-[10px] text-gray-400">Gratis desde</p><p className="text-sm font-bold text-emerald-600">{r.freeAbove ? fmt(r.freeAbove) : "No aplica"}</p></div>
                    <div><p className="text-[10px] text-gray-400">Tiempo est.</p><p className="text-sm font-bold text-gray-900 dark:text-foreground">{r.estimatedMin}-{r.estimatedMax} min</p></div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setRules(prev => prev.map(x => x.id === r.id ? { ...x, active: !x.active } : x))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-gray-400 hover:text-primary"><ArrowUpDown className="h-4 w-4" /></button>
                  <button onClick={() => openEdit(r)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-gray-400 hover:text-primary"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-y-hidden overflow-x-auto">
          <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 bg-gray-50 dark:bg-surface">
            <h3 className="font-bold text-sm text-gray-700 dark:text-foreground">Estadísticas por zona (este mes)</h3>
            <button onClick={() => exportToCSV(STATS.map(s => ({ zona: s.zone, pedidos: s.orders, ingreso: s.revenue, ticket_prom: s.avgTicket, envios_gratis: s.freeDeliveries })), "costos-envio-stats")} className="text-xs text-primary font-semibold flex items-center gap-1"><Download className="h-3 w-3" /> CSV</button>
          </div>
          <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="bg-gray-50/50 dark:bg-surface/50 text-left">
              <th className="px-2 sm:px-4 py-1.5 sm:py-2 font-bold text-gray-500 dark:text-muted">Zona</th>
              <th className="px-2 sm:px-4 py-1.5 sm:py-2 font-bold text-gray-500 dark:text-muted">Pedidos</th>
              <th className="px-2 sm:px-4 py-1.5 sm:py-2 font-bold text-gray-500 dark:text-muted">Ingreso</th>
              <th className="px-2 sm:px-4 py-1.5 sm:py-2 font-bold text-gray-500 dark:text-muted">Ticket prom.</th>
              <th className="px-2 sm:px-4 py-1.5 sm:py-2 font-bold text-gray-500 dark:text-muted">Envíos gratis</th>
            </tr></thead>
            <tbody>
              {STATS.map(s => (
                <tr key={s.zone} className="border-t border-gray-100 dark:border-card-border">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-gray-900 dark:text-foreground">{s.zone}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-700 dark:text-foreground">{s.orders}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-emerald-600">{fmt(s.revenue)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-700 dark:text-foreground">{fmt(s.avgTicket)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-violet-600 font-semibold">{s.freeDeliveries}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-3 sm:p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-card-border" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground mb-4">{editRule ? "Editar tarifa" : "Nueva tarifa"}</h3>
            <div className="space-y-3">
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Zona</label><input value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Tarifa (S/)</label><input type="number" step="0.50" value={form.fee} onChange={e => setForm({ ...form, fee: +e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
                <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Pedido mínimo (S/)</label><input type="number" value={form.minOrder} onChange={e => setForm({ ...form, minOrder: +e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Gratis desde (S/)</label><input type="number" value={form.freeAbove} onChange={e => setForm({ ...form, freeAbove: +e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="0 = no aplica" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><div><label className="text-xs font-bold text-gray-500 dark:text-muted">Min (min)</label><input type="number" value={form.estimatedMin} onChange={e => setForm({ ...form, estimatedMin: +e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div><div><label className="text-xs font-bold text-gray-500 dark:text-muted">Max (min)</label><input type="number" value={form.estimatedMax} onChange={e => setForm({ ...form, estimatedMax: +e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div></div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
              <button onClick={save} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90"><Check className="h-4 w-4 inline mr-1" />Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
