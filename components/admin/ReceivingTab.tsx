"use client";

import { useState, useEffect, useMemo } from "react";
import {
  PackageCheck, Download, Search, Eye, X,
  Camera, AlertTriangle, CheckCircle2, XCircle,
  ScanLine, ClipboardList, Plus, Check, Loader2,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type ReceptionStatus = "programada" | "en-proceso" | "aceptada" | "parcial" | "rechazada";

type ItemCondition = "ok" | "dañado" | "vencido" | "faltante";

type ReceptionItem = {
  product: string;
  expectedQty: number;
  receivedQty: number;
  condition: ItemCondition;
  notes: string;
};

type Reception = {
  id: string;
  ref: string;
  orderRef: string;
  supplier: string;
  scheduledDate: string;
  receivedDate?: string;
  status: ReceptionStatus;
  inspector: string;
  items: ReceptionItem[];
  photos: number;
  nonConformities: number;
};

const STATUS_MAP: Record<ReceptionStatus, { label: string; color: string; bg: string }> = {
  programada:   { label: "Programada",  color: "text-emerald-600",    bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  "en-proceso": { label: "En proceso",  color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  aceptada:     { label: "Aceptada",    color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  parcial:      { label: "Parcial",     color: "text-orange-600",  bg: "bg-orange-100 dark:bg-orange-900/30" },
  rechazada:    { label: "Rechazada",   color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30" },
};

const COND_MAP: Record<ItemCondition, { label: string; color: string; bg: string }> = {
  ok:       { label: "OK",       color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
  "dañado": { label: "Dañado",   color: "text-red-600",     bg: "bg-red-50 dark:bg-red-900/20" },
  vencido:  { label: "Vencido",  color: "text-orange-600",  bg: "bg-orange-50 dark:bg-orange-900/20" },
  faltante: { label: "Faltante", color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-900/20" },
};

function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });
}

const EMPTY_CHECKLIST: ReceptionItem = { product: "", expectedQty: 0, receivedQty: 0, condition: "ok", notes: "" };

export default function ReceivingTab() {
  const [receptions, setReceptions]     = useState<Reception[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState<ReceptionStatus | "todos">("todos");
  const [detail, setDetail]             = useState<Reception | null>(null);
  const [showNew, setShowNew]           = useState(false);

  // New reception form
  const [newForm, setNewForm] = useState({
    supplier: "", orderRef: "", scheduledDate: new Date().toISOString().slice(0, 10), inspector: "",
  });
  const [checklist, setChecklist] = useState<ReceptionItem[]>([{ ...EMPTY_CHECKLIST }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/compras/recepciones").then(r => r.ok ? r.json() : []).then((data: Reception[]) => {
      if (active) { setReceptions(data); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const scheduled   = receptions.filter(r => r.status === "programada").length;
    const inProgress  = receptions.filter(r => r.status === "en-proceso").length;
    const accepted    = receptions.filter(r => r.status === "aceptada").length;
    const totalNonConf = receptions.reduce((s, r) => s + r.nonConformities, 0);
    return { scheduled, inProgress, accepted, totalNonConf };
  }, [receptions]);

  const filtered = useMemo(() => {
    let list = receptions;
    if (filterStatus !== "todos") list = list.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.supplier.toLowerCase().includes(q) ||
        r.ref.toLowerCase().includes(q) ||
        r.orderRef.toLowerCase().includes(q)
      );
    }
    return list;
  }, [receptions, search, filterStatus]);

  // Discrepancy summary for a reception
  const getDiscrepancies = (items: ReceptionItem[]) =>
    items.filter(it => it.condition !== "ok" || it.receivedQty !== it.expectedQty);

  const addChecklistRow  = () => setChecklist(prev => [...prev, { ...EMPTY_CHECKLIST }]);
  const removeChecklistRow = (idx: number) => setChecklist(prev => prev.filter((_, i) => i !== idx));
  const updateChecklistRow = <K extends keyof ReceptionItem>(idx: number, key: K, value: ReceptionItem[K]) =>
    setChecklist(prev => prev.map((row, i) => i === idx ? { ...row, [key]: value } : row));

  const saveReception = async () => {
    if (!newForm.supplier || !newForm.orderRef || checklist.some(r => !r.product)) return;
    setSaving(true);
    const nonConformities = checklist.filter(it => it.condition !== "ok" || it.receivedQty < it.expectedQty).length;
    const body = {
      ...newForm,
      status: "en-proceso" as ReceptionStatus,
      items: checklist,
      photos: 0,
      nonConformities,
    };
    const res = await fetch("/api/compras/recepciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) {
      const created: Reception = await res.json();
      setReceptions(prev => [created, ...prev]);
    }
    setSaving(false);
    setShowNew(false);
    setNewForm({ supplier: "", orderRef: "", scheduledDate: new Date().toISOString().slice(0, 10), inspector: "" });
    setChecklist([{ ...EMPTY_CHECKLIST }]);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <PackageCheck className="h-6 w-6 text-primary" />
            Recepción de Mercadería
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Verificación de calidad y registro de discrepancias</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToCSV(receptions.map(r => ({
              ref: r.ref, oc: r.orderRef, proveedor: r.supplier,
              programada: r.scheduledDate, recibida: r.receivedDate ?? "-",
              estado: STATUS_MAP[r.status].label, inspector: r.inspector,
              items: r.items.length, fotos: r.photos, no_conformidades: r.nonConformities,
            })), "recepciones")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition"
          >
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition"
          >
            <Plus className="h-4 w-4" /> Nueva recepción
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Programadas",       value: stats.scheduled,   color: "text-emerald-600",    bg: "bg-emerald-50 dark:bg-emerald-950/30",    icon: ClipboardList },
          { label: "En proceso",        value: stats.inProgress,  color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950/30",  icon: ScanLine },
          { label: "Aceptadas",         value: stats.accepted,    color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: CheckCircle2 },
          { label: "No conformidades",  value: stats.totalNonConf,color: "text-red-600",     bg: "bg-red-50 dark:bg-red-950/30",      icon: AlertTriangle },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", color)} />
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proveedor, ref, OC..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground"
          />
        </div>
        <select
          value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground"
        >
          <option value="todos">Todos los estados</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface">
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Programada</th>
                  <th className="px-4 py-3">Recibida</th>
                  <th className="px-4 py-3">Inspector</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-center">Fotos</th>
                  <th className="px-4 py-3 text-center">NC</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const discrepancies = getDiscrepancies(r.items);
                  return (
                    <tr key={r.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20 transition">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-gray-700 dark:text-foreground">{r.ref}</div>
                        <div className="font-mono text-[10px] text-gray-400">{r.orderRef}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-800 dark:text-foreground">{r.supplier}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-muted text-xs">{fmtDate(r.scheduledDate)}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-muted text-xs">{r.receivedDate ? fmtDate(r.receivedDate) : "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-muted">{r.inspector || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", STATUS_MAP[r.status].bg, STATUS_MAP[r.status].color)}>
                          {STATUS_MAP[r.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.photos > 0 ? (
                          <span className="flex items-center justify-center gap-0.5 text-xs text-gray-500">
                            <Camera className="h-3 w-3" />{r.photos}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.nonConformities > 0 ? (
                          <span className="bg-red-100 dark:bg-red-900/30 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                            {r.nonConformities}
                          </span>
                        ) : discrepancies.length === 0 ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setDetail(r)} className="p-1 rounded-lg hover:bg-primary/10 text-primary transition">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">Sin recepciones que mostrar</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div
            className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 sm:p-6 w-full max-w-2xl space-y-4 max-h-[85vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.ref}</h3>
                <p className="text-xs text-gray-400 mt-0.5">OC: {detail.orderRef} · {detail.supplier}</p>
                {detail.inspector && <p className="text-xs text-gray-400">Inspector: {detail.inspector}</p>}
              </div>
              <button onClick={() => setDetail(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-surface">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {/* Discrepancy alert */}
            {getDiscrepancies(detail.items).length > 0 && (
              <div className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/10 text-red-600 dark:text-red-400 px-3 py-2 rounded-xl">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>{getDiscrepancies(detail.items).length} discrepancia{getDiscrepancies(detail.items).length !== 1 ? "s" : ""}</strong> detectadas en esta recepción.
                </span>
              </div>
            )}

            {/* Checklist table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface">
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-center">Esperado</th>
                    <th className="px-3 py-2 text-center">Recibido</th>
                    <th className="px-3 py-2">Condición</th>
                    <th className="px-3 py-2">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={i} className={cn("border-t border-gray-100 dark:border-card-border", it.condition !== "ok" && "bg-red-50/30 dark:bg-red-950/10")}>
                      <td className="px-3 py-2.5 font-bold text-gray-700 dark:text-foreground">{it.product}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-center">{it.expectedQty}</td>
                      <td className={cn("px-3 py-2.5 font-bold text-center",
                        it.receivedQty < it.expectedQty ? "text-red-600" : "text-emerald-600"
                      )}>
                        {it.receivedQty}
                        {it.receivedQty !== it.expectedQty && (
                          <span className="ml-1 text-[10px]">({it.receivedQty > it.expectedQty ? "+" : ""}{it.receivedQty - it.expectedQty})</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", COND_MAP[it.condition].bg, COND_MAP[it.condition].color)}>
                          {COND_MAP[it.condition].label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{it.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
              {detail.photos > 0 && (
                <span className="flex items-center gap-1"><Camera className="h-4 w-4" /> {detail.photos} fotos</span>
              )}
              {detail.nonConformities > 0 && (
                <span className="flex items-center gap-1 text-red-500"><XCircle className="h-4 w-4" /> {detail.nonConformities} no conformidades</span>
              )}
              {detail.nonConformities === 0 && (
                <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Sin no conformidades</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New reception modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNew(false)}>
          <div
            className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 sm:p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Nueva recepción de mercadería</h3>
              <button onClick={() => setShowNew(false)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted">Proveedor</label>
                <input value={newForm.supplier} onChange={e => setNewForm(f => ({ ...f, supplier: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted">Nro. Orden de Compra</label>
                <input value={newForm.orderRef} onChange={e => setNewForm(f => ({ ...f, orderRef: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted">Fecha programada</label>
                <input type="date" value={newForm.scheduledDate} onChange={e => setNewForm(f => ({ ...f, scheduledDate: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted">Inspector</label>
                <input value={newForm.inspector} onChange={e => setNewForm(f => ({ ...f, inspector: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-sm text-gray-700 dark:text-foreground">Checklist de productos</h4>
                <button onClick={addChecklistRow} className="text-xs text-primary font-bold flex items-center gap-1 hover:underline">
                  <Plus className="h-3 w-3" /> Agregar fila
                </button>
              </div>
              <div className="space-y-2">
                {checklist.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 bg-gray-50 dark:bg-surface rounded-xl p-2">
                    <input
                      value={row.product} onChange={e => updateChecklistRow(idx, "product", e.target.value)}
                      placeholder="Producto" className="flex-1 min-w-32 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-xs"
                    />
                    <input type="number" min="0" value={row.expectedQty} onChange={e => updateChecklistRow(idx, "expectedQty", +e.target.value)}
                      placeholder="Esperado" className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-xs" />
                    <input type="number" min="0" value={row.receivedQty} onChange={e => updateChecklistRow(idx, "receivedQty", +e.target.value)}
                      placeholder="Recibido" className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-xs" />
                    <select value={row.condition} onChange={e => updateChecklistRow(idx, "condition", e.target.value as ItemCondition)}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-xs">
                      {Object.entries(COND_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <input value={row.notes} onChange={e => updateChecklistRow(idx, "notes", e.target.value)}
                      placeholder="Notas (opcional)" className="flex-1 min-w-24 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-xs" />
                    {checklist.length > 1 && (
                      <button onClick={() => removeChecklistRow(idx)} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500 transition">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
              <button onClick={saveReception} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Guardar recepción
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
