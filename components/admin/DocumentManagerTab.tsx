"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  FolderOpen, Download, Search, Plus, X,
  Eye, Trash2, FileText, FileCheck, AlertCircle, Clock,
  RefreshCw, FileSignature, Loader2,
} from "@buleje/design-system/icons";
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
  isContrato?: boolean;
  contratoNumero?: string;
  contratoMonto?: number;
};

interface ContratoAPI {
  id: string;
  número: string;
  tipo: string;
  estado: string;
  clienteNombre: string;
  clienteDoc: string;
  descripcion: string;
  monto: number;
  moneda: string;
  fecha: string;
  fechaVencimiento: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "\u2014";
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function daysUntil(iso: string) {
  if (!iso) return Infinity;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const CATEGORY_META: Record<DocCategory, { label: string; color: string }> = {
  factura:     { label: "Factura",     color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  contrato:    { label: "Contrato",    color: "bg-[var(--surface-sunken)] text-[var(--text-primary)]" },
  comprobante: { label: "Comprobante", color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  recibo:      { label: "Recibo",      color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]" },
  otro:        { label: "Otro",        color: "bg-[var(--rule-soft)] text-[var(--text-primary)] dark:bg-gray-700 dark:text-[var(--text-tertiary)]" },
};

const STATUS_META: Record<DocStatus, { label: string; color: string; icon: typeof FileCheck }> = {
  vigente:    { label: "Vigente",    color: "text-[var(--data-success-500)]", icon: FileCheck },
  "por-vencer": { label: "Por vencer", color: "text-[var(--data-warning-500)]", icon: Clock },
  vencido:    { label: "Vencido",    color: "text-[var(--data-error-500)]",     icon: AlertCircle },
  archivado:  { label: "Archivado",  color: "text-[var(--text-tertiary)]",    icon: FolderOpen },
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
  const [loadingContratos, setLoadingContratos] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  // Fetch contratos from API and merge into docs
  const fetchContratos = useCallback(async () => {
    setLoadingContratos(true);
    try {
      const res = await fetch("/api/contratos");
      if (res.ok) {
        const data = await res.json();
        const contratos: ContratoAPI[] = data.contratos || [];

        const contratoDocs: Doc[] = contratos
          .filter((c) => c.estado !== "ANULADO")
          .map((c) => {
            let status: DocStatus = "vigente";
            if (c.fechaVencimiento) {
              const days = daysUntil(c.fechaVencimiento);
              if (days < 0) status = "vencido";
              else if (days <= 30) status = "por-vencer";
            }
            if (c.estado === "VENCIDO") status = "vencido";

            const monedaSymbol = c.moneda === "USD" ? "US$" : "S/";

            return {
              id: c.id,
              name: `${c.número} - ${c.tipo} - ${c.clienteNombre}`,
              category: "contrato" as DocCategory,
              status,
              uploadDate: c.createdAt?.split("T")[0] || "",
              expiryDate: c.fechaVencimiento || "",
              size: `${monedaSymbol}${Number(c.monto).toFixed(2)}`,
              relatedTo: c.clienteNombre,
              notes: c.descripcion?.substring(0, 100) || "",
              isContrato: true,
              contratoNumero: c.número,
              contratoMonto: c.monto,
            };
          });

        // Merge: replace existing contrato docs and add new ones
        setDocs((prev) => {
          const nonContratoDocs = prev.filter((d) => !d.isContrato);
          return [...nonContratoDocs, ...contratoDocs];
        });
      }
    } catch {
      // silently fail
    } finally {
      setLoadingContratos(false);
    }
  }, []);

  useEffect(() => {
    fetchContratos();
  }, [fetchContratos]);

  // Renewal handler
  const handleRenew = async (doc: Doc) => {
    if (!doc.isContrato) return;
    setRenewingId(doc.id);
    try {
      // Extend the contract by 1 year from current expiry or today
      const currentExpiry = doc.expiryDate ? new Date(doc.expiryDate) : new Date();
      const newExpiry = new Date(currentExpiry);
      newExpiry.setFullYear(newExpiry.getFullYear() + 1);

      const res = await fetch(`/api/contratos/${doc.id}`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          estado: "ACTIVO",
          fechaVencimiento: newExpiry.toISOString().split("T")[0],
        }),
      });

      if (res.ok) {
        // Refresh contratos list
        await fetchContratos();
      }
    } catch {
      // silently fail
    } finally {
      setRenewingId(null);
    }
  };

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
    const contratosActivos = docs.filter(d => d.isContrato && (d.status === "vigente" || d.status === "por-vencer")).length;
    const contratosPorVencer = docs.filter(d => d.isContrato && d.status === "por-vencer").length;
    return { total: docs.length, vigentes, porVencer, vencidos, contratosActivos, contratosPorVencer };
  }, [docs]);

  function addDoc() {
    if (!form.name.trim()) return;
    const now = new Date().toISOString().split("T")[0];
    const newDoc: Doc = {
      id: `d${Date.now()}`, name: form.name.trim(), category: form.category, status: "vigente",
      uploadDate: now, expiryDate: form.expiryDate, size: "\u2014 KB", relatedTo: form.relatedTo.trim(), notes: form.notes.trim(),
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
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" /> Gestion Documental
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Repositorio central de documentos de la empresa</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => fetchContratos()} disabled={loadingContratos} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--accent-muted)]/50 transition-colors disabled:opacity-50">
            {loadingContratos ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            Sync contratos
          </button>
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Agregar
          </button>
          <button onClick={() => exportToCSV(filtered.map(d => ({ nombre: d.name, categoria: d.category, estado: d.status, fecha_carga: d.uploadDate, vencimiento: d.expiryDate || "\u2014", tamano: d.size, relacionado: d.relatedTo, notas: d.notes })), "documentos")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total docs", value: String(stats.total), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Vigentes", value: String(stats.vigentes), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Por vencer", value: String(stats.porVencer), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Vencidos", value: String(stats.vencidos), color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30" },
          { label: "Contratos activos", value: String(stats.contratosActivos), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(stats.porVencer > 0 || stats.vencidos > 0) && (
        <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-4 flex flex-wrap items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-sm">Documentos que necesitan atencion</p>
            <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-0.5">
              {stats.porVencer > 0 && <span>{stats.porVencer} próximo(s) a vencer. </span>}
              {stats.vencidos > 0 && <span className="font-bold">{stats.vencidos} vencido(s) — renovar o archivar.</span>}
              {stats.contratosPorVencer > 0 && (
                <span className="block mt-1 font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">
                  <FileSignature className="h-3 w-3 inline mr-0.5" />
                  {stats.contratosPorVencer} contrato(s) por vencer — usa la accion &ldquo;Renovar&rdquo; para extenderlos.
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5 space-y-3">
          <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)]">Nuevo documento</CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Nombre del documento *" className="col-span-full px-3 py-2 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
            <select value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value as DocCategory }))} className="px-3 py-2 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
              {(Object.keys(CATEGORY_META) as DocCategory[]).map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
            </select>
            <input type="date" value={form.expiryDate} onChange={e => setForm(prev => ({ ...prev, expiryDate: e.target.value }))} className="px-3 py-2 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" title="Vencimiento (opcional)" />
            <input value={form.relatedTo} onChange={e => setForm(prev => ({ ...prev, relatedTo: e.target.value }))} placeholder="Entidad relacionada" className="px-3 py-2 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
            <input value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Notas" className="px-3 py-2 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-surface">Cancelar</button>
            <button onClick={addDoc} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90">Guardar</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, entidad..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value as DocCategory | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todas las categorias</option>
          {(Object.keys(CATEGORY_META) as DocCategory[]).map(c => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
        </select>
        <select value={filterSt} onChange={e => setFilterSt(e.target.value as DocStatus | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as DocStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-[var(--surface-alt)] dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Documento</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Categoria</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Subido</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Vencimiento</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Relacionado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--text-tertiary)] text-sm">Sin documentos.</td></tr>}
              {filtered.map(d => {
                const cat = CATEGORY_META[d.category];
                const st = STATUS_META[d.status];
                const StIcon = st.icon;
                const daysTilExpiry = daysUntil(d.expiryDate);
                const isContratoPorVencer = d.isContrato && (d.status === "por-vencer" || d.status === "vencido");
                return (
                  <tr key={d.id} className={cn(
                    "hover:bg-[var(--surface-alt)]/50 dark:hover:bg-surface/30 transition-colors",
                    isContratoPorVencer && "bg-[var(--data-warning-50)]/30 dark:bg-amber-950/10"
                  )}>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {d.isContrato ? (
                          <FileSignature className="h-4 w-4 text-[var(--text-secondary)] shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                        )}
                        <div>
                          <p className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">{d.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)]">{d.size}</p>
                        </div>
                        {isContratoPorVencer && (
                          <span className="px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] animate-pulse">
                            {d.status === "vencido" ? "VENCIDO" : `${daysTilExpiry}d`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", cat.color)}>{cat.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("flex items-center gap-1 text-xs font-semibold", st.color)}><StIcon className="h-3 w-3" />{st.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)]">{fmtDate(d.uploadDate)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs">
                      {d.expiryDate ? (
                        <span className={cn("font-semibold", daysTilExpiry < 0 ? "text-[var(--data-error-500)]" : daysTilExpiry < 30 ? "text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]")}>
                          {fmtDate(d.expiryDate)} {daysTilExpiry < 0 ? "(vencido)" : daysTilExpiry < 30 ? `(${daysTilExpiry}d)` : ""}
                        </span>
                      ) : <span className="text-[var(--text-tertiary)]">{"\u2014"}</span>}
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{d.relatedTo}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => setDetail(d)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]"><Eye className="h-3.5 w-3.5" /></button>
                        {/* Renew button for contracts about to expire */}
                        {d.isContrato && (d.status === "por-vencer" || d.status === "vencido") && (
                          <button
                            onClick={() => handleRenew(d)}
                            disabled={renewingId === d.id}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--accent-muted)]/20 disabled:opacity-50"
                            title="Renovar contrato (+1 anio)"
                          >
                            {renewingId === d.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        {!d.isContrato && (
                          <button onClick={() => removeDoc(d.id)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
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
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm flex items-center gap-1.5">
                {detail.isContrato && <FileSignature className="h-4 w-4 text-[var(--text-secondary)]" />}
                Detalle del documento
              </CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Nombre", detail.name], ["Categoria", CATEGORY_META[detail.category].label],
                ["Estado", STATUS_META[detail.status].label], ["Subido", fmtDate(detail.uploadDate)],
                ["Vencimiento", detail.expiryDate ? fmtDate(detail.expiryDate) : "\u2014"], ["Tamano/Monto", detail.size],
                ["Relacionado", detail.relatedTo || "\u2014"], ["Notas", detail.notes || "\u2014"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                  <span className="text-[var(--text-secondary)] dark:text-muted">{k}</span>
                  <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-right">{v}</span>
                </div>
              ))}
            </div>
            {/* Quick actions for contratos */}
            {detail.isContrato && (
              <div className="pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap gap-2">
                {(detail.status === "por-vencer" || detail.status === "vencido") && (
                  <button
                    onClick={() => { handleRenew(detail); setDetail(null); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-xs font-bold hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" /> Renovar (+1 anio)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
