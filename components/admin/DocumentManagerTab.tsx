"use client";

import { useState, useMemo } from "react";
import {
  FolderOpen, Download, Search, Plus, X,
  Eye, Trash2, FileText, FileCheck, AlertCircle, Clock,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DocCategory = "factura" | "contrato" | "comprobante" | "recibo" | "otro";
type DocStatus = "vigente" | "por-vencer" | "vencido" | "archivado";

type Doc = {
  id: string;
  name: string;
  category: DocCategory;
  status: DocStatus;
  uploadDate: string;
  expiryDate: string;
  size: string;
  relatedTo: string;
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function daysUntil(iso: string) {
  if (!iso) return Infinity;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const CATEGORY_META: Record<DocCategory, { label: string; color: string }> = {
  factura:     { label: "Factura",     color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  contrato:    { label: "Contrato",    color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  comprobante: { label: "Comprobante", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  recibo:      { label: "Recibo",      color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  otro:        { label: "Otro",        color: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
};

const STATUS_META: Record<DocStatus, { label: string; color: string; icon: typeof FileCheck }> = {
  vigente:    { label: "Vigente",    color: "text-emerald-600", icon: FileCheck },
  "por-vencer": { label: "Por vencer", color: "text-amber-600", icon: Clock },
  vencido:    { label: "Vencido",    color: "text-red-500",     icon: AlertCircle },
  archivado:  { label: "Archivado",  color: "text-gray-400",    icon: FolderOpen },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: Doc[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DocumentManagerTab() {
  const [docs, setDocs] = useState<Doc[]>(SEED);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<DocCategory | "todos">("todos");
  const [filterSt, setFilterSt] = useState<DocStatus | "todos">("todos");
  const [detail, setDetail] = useState<Doc | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "factura" as DocCategory, expiryDate: "", relatedTo: "", notes: "" });

  const filtered = useMemo(() => {
    let list = [...docs];
    if (filterCat !== "todos") list = list.filter(d => d.category === filterCat);
    if (filterSt !== "todos") list = list.filter(d => d.status === filterSt);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.relatedTo.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.uploadDate.localeCompare(a.uploadDate));
  }, [docs, filterCat, filterSt, search]);

  const stats = useMemo(() => {
    const vigentes = docs.filter(d => d.status === "vigente").length;
    const porVencer = docs.filter(d => d.status === "por-vencer").length;
    const vencidos = docs.filter(d => d.status === "vencido").length;
    return { total: docs.length, vigentes, porVencer, vencidos };
  }, [docs]);

  function addDoc() {
    if (!form.name.trim()) return;
    const now = new Date().toISOString().split("T")[0];
    const newDoc: Doc = {
      id: `d${Date.now()}`, name: form.name.trim(), category: form.category, status: "vigente",
      uploadDate: now, expiryDate: form.expiryDate, size: "— KB", relatedTo: form.relatedTo.trim(), notes: form.notes.trim(),
    };
    setDocs(prev => [newDoc, ...prev]);
    setForm({ name: "", category: "factura", expiryDate: "", relatedTo: "", notes: "" });
    setShowForm(false);
  }

  function removeDoc(id: string) {
    setDocs(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" /> Gestión Documental
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Repositorio central de documentos de la empresa</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Agregar
          </button>
          <button onClick={() => exportToCSV(filtered.map(d => ({ nombre: d.name, categoria: d.category, estado: d.status, fecha_carga: d.uploadDate, vencimiento: d.expiryDate || "—", tamaño: d.size, relacionado: d.relatedTo, notas: d.notes })), "documentos")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total docs", value: String(stats.total), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Vigentes", value: String(stats.vigentes), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Por vencer", value: String(stats.porVencer), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Vencidos", value: String(stats.vencidos), color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(stats.porVencer > 0 || stats.vencidos > 0) && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-wrap items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-700 dark:text-amber-400 text-sm">Documentos que necesitan atención</p>
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
              {stats.porVencer > 0 && <span>{stats.porVencer} próximo(s) a vencer. </span>}
              {stats.vencidos > 0 && <span className="font-bold">{stats.vencidos} vencido(s) — renovar o archivar.</span>}
            </p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5 space-y-3">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground">Nuevo documento</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Nombre del documento *" className="col-span-full px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <select value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value as DocCategory }))} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground">
              {(Object.keys(CATEGORY_META) as DocCategory[]).map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
            </select>
            <input type="date" value={form.expiryDate} onChange={e => setForm(prev => ({ ...prev, expiryDate: e.target.value }))} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" title="Vencimiento (opcional)" />
            <input value={form.relatedTo} onChange={e => setForm(prev => ({ ...prev, relatedTo: e.target.value }))} placeholder="Entidad relacionada" className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <input value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Notas" className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-surface">Cancelar</button>
            <button onClick={addDoc} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90">Guardar</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, entidad..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value as DocCategory | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todas las categorías</option>
          {(Object.keys(CATEGORY_META) as DocCategory[]).map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
        </select>
        <select value={filterSt} onChange={e => setFilterSt(e.target.value as DocStatus | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as DocStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-gray-200 dark:border-card-border">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Documento</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Categoría</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Subido</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Vencimiento</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Relacionado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Sin documentos.</td></tr>}
              {filtered.map(d => {
                const cat = CATEGORY_META[d.category];
                const st = STATUS_META[d.status];
                const StIcon = st.icon;
                const daysTilExpiry = daysUntil(d.expiryDate);
                return (
                  <tr key={d.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-foreground text-sm">{d.name}</p>
                          <p className="text-xs text-gray-400">{d.size}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", cat.color)}>{cat.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("flex items-center gap-1 text-xs font-semibold", st.color)}><StIcon className="h-3 w-3" />{st.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500">{fmtDate(d.uploadDate)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs">
                      {d.expiryDate ? (
                        <span className={cn("font-semibold", daysTilExpiry < 0 ? "text-red-500" : daysTilExpiry < 30 ? "text-amber-600" : "text-gray-500")}>
                          {fmtDate(d.expiryDate)} {daysTilExpiry < 0 ? "(vencido)" : daysTilExpiry < 30 ? `(${daysTilExpiry}d)` : ""}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-600 dark:text-muted">{d.relatedTo}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => setDetail(d)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"><Eye className="h-3.5 w-3.5" /></button>
                        <button onClick={() => removeDoc(d.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm">Detalle del documento</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Nombre", detail.name], ["Categoría", CATEGORY_META[detail.category].label],
                ["Estado", STATUS_META[detail.status].label], ["Subido", fmtDate(detail.uploadDate)],
                ["Vencimiento", detail.expiryDate ? fmtDate(detail.expiryDate) : "—"], ["Tamaño", detail.size],
                ["Relacionado", detail.relatedTo || "—"], ["Notas", detail.notes || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                  <span className="text-gray-500 dark:text-muted">{k}</span>
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
