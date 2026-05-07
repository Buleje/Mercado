"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PackageCheck, Download, Search, Eye, X,
  Camera, AlertTriangle, CheckCircle2, XCircle,
  ScanLine, ClipboardList, Plus, Check, Loader2, Sparkles,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

interface PendingOC {
  id: string;
  supplierId?: string;
  supplierName?: string;
  status?: string;
  total?: number;
  createdAt?: string;
  items?: Array<{ name?: string; quantity?: number; unit?: string }>;
}

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
  programada:   { label: "Programada",  color: "text-[var(--data-success-500)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  "en-proceso": { label: "En proceso",  color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  aceptada:     { label: "Aceptada",    color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  parcial:      { label: "Parcial",     color: "text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30" },
  rechazada:    { label: "Rechazada",   color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30" },
};

const COND_MAP: Record<ItemCondition, { label: string; color: string; bg: string }> = {
  ok:       { label: "OK",       color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  "dañado": { label: "Dañado",   color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20" },
  vencido:  { label: "Vencido",  color: "text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
  faltante: { label: "Faltante", color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" },
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

  // Órdenes pendientes de recibir (para el dropdown del modal)
  const [pendingOCs, setPendingOCs] = useState<PendingOC[]>([]);
  const [selectedOcId, setSelectedOcId] = useState("");

  // New reception form
  const [newForm, setNewForm] = useState({
    supplier: "", orderRef: "", scheduledDate: new Date().toISOString().slice(0, 10), inspector: "",
  });
  const [checklist, setChecklist] = useState<ReceptionItem[]>([{ ...EMPTY_CHECKLIST }]);
  const [saving, setSaving] = useState(false);

  // Carga recepciones con cache localStorage stale-while-revalidate
  useEffect(() => {
    const KEY = "admin-recepciones-cache";
    const TTL = 60 * 1000;
    let active = true;

    // 1. Hidratar instantaneo desde cache
    try {
      const cached = localStorage.getItem(KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: Reception[]; ts: number };
        if (Array.isArray(data)) {
          setReceptions(data);
          setLoading(false);
          if (Date.now() - ts < TTL) return;
        }
      }
    } catch { /* ignore */ }

    // 2. Refrescar de red
    fetch("/api/compras/recepciones").then(r => r.ok ? r.json() : []).then((data: Reception[]) => {
      if (!active) return;
      setReceptions(data);
      setLoading(false);
      try { localStorage.setItem(KEY, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota */ }
    }).catch(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, []);

  // Carga OCs pendientes al abrir el modal de nueva recepción
  const loadPendingOCs = useCallback(async () => {
    try {
      const res = await fetch("/api/purchases", { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      const all: PendingOC[] = Array.isArray(json) ? json : (json?.purchases ?? []);
      // Solo mostrar OCs pendientes / parciales / auto_generated
      const pending = all.filter((p) => {
        const s = (p.status ?? "").toLowerCase();
        return s === "pendiente" || s === "parcial" || s === "auto_generated" || s === "ordered" || s === "draft";
      });
      setPendingOCs(pending);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (showNew) void loadPendingOCs();
  }, [showNew, loadPendingOCs]);

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
    const res = await fetch("/api/compras/recepciones", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const created: Reception = await res.json();
      setReceptions(prev => {
        const next = [created, ...prev];
        try { localStorage.setItem("admin-recepciones-cache", JSON.stringify({ data: next, ts: Date.now() })); } catch { /* quota */ }
        return next;
      });
    }
    setSaving(false);
    setShowNew(false);
    setNewForm({ supplier: "", orderRef: "", scheduledDate: new Date().toISOString().slice(0, 10), inspector: "" });
    setChecklist([{ ...EMPTY_CHECKLIST }]);
    setSelectedOcId("");
  };

  // Al elegir una OC del dropdown — auto-llena proveedor + items
  const applyOC = useCallback((ocId: string) => {
    setSelectedOcId(ocId);
    if (!ocId) return;
    const oc = pendingOCs.find((p) => p.id === ocId);
    if (!oc) return;
    setNewForm((f) => ({
      ...f,
      supplier: oc.supplierName ?? f.supplier,
      orderRef: oc.id,
    }));
    if (oc.items && oc.items.length > 0) {
      setChecklist(oc.items.map((it) => ({
        product: it.name ?? "",
        expectedQty: Number(it.quantity ?? 0),
        receivedQty: Number(it.quantity ?? 0),
        condition: "ok" as ItemCondition,
        notes: "",
      })));
    }
  }, [pendingOCs]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground">
            Recepción de Mercadería
          </SectionTitle>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToCSV(receptions.map(r => ({
              ref: r.ref, oc: r.orderRef, proveedor: r.supplier,
              programada: r.scheduledDate, recibida: r.receivedDate ?? "-",
              estado: STATUS_MAP[r.status].label, inspector: r.inspector,
              items: r.items.length, fotos: r.photos, no_conformidades: r.nonConformities,
            })), "recepciones")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition"
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

      {/* KPI summary minimalista */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Programadas",      value: stats.scheduled,    icon: ClipboardList, color: "text-[var(--text-primary)]"  },
          { label: "En proceso",       value: stats.inProgress,   icon: ScanLine,      color: "text-[var(--data-warning-500)]"  },
          { label: "Aceptadas",        value: stats.accepted,     icon: CheckCircle2,  color: "text-[var(--data-success-500)]"  },
          { label: "No conformidades", value: stats.totalNonConf, icon: AlertTriangle, color: stats.totalNonConf > 0 ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)]" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-[var(--rule-base)] rounded-xl p-4 flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] truncate">{label}</p>
              <p className={cn("text-2xl font-extrabold tabular-nums leading-none mt-1.5", color)}>{value}</p>
            </div>
            <Icon className={cn("h-5 w-5 shrink-0", color)} />
          </div>
        ))}
      </div>

      {/* Filter pills + buscador */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: "todos",       label: "Todos",      count: receptions.length },
          { id: "programada",  label: "Programadas", count: stats.scheduled  },
          { id: "en-proceso",  label: "En proceso",  count: stats.inProgress },
          { id: "aceptada",    label: "Aceptadas",   count: stats.accepted   },
        ] as const).map((p) => (
          <button
            key={p.id}
            onClick={() => setFilterStatus(p.id as typeof filterStatus)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
              filterStatus === p.id
                ? "bg-[var(--text-primary)] text-white border-[var(--text-primary)]"
                : "bg-white text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]"
            )}
          >
            {p.label}
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums min-w-[20px] text-center",
              filterStatus === p.id ? "bg-white/25" : "bg-[var(--surface-sunken)]"
            )}>
              {p.count}
            </span>
          </button>
        ))}
        <div className="relative ml-auto flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proveedor, ref, OC..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-[var(--rule-base)] rounded-lg bg-white text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-surface">
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
                    <tr key={r.id} className="border-t border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20 transition">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{r.ref}</div>
                        <div className="font-mono text-xs text-[var(--text-tertiary)]">{r.orderRef}</div>
                      </td>
                      <td className="px-4 py-3 font-bold text-[var(--text-primary)] dark:text-foreground">{r.supplier}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-muted text-xs">{fmtDate(r.scheduledDate)}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-muted text-xs">{r.receivedDate ? fmtDate(r.receivedDate) : "—"}</td>
                      <td className="px-4 py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{r.inspector || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", STATUS_MAP[r.status].bg, STATUS_MAP[r.status].color)}>
                          {STATUS_MAP[r.status].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.photos > 0 ? (
                          <span className="flex items-center justify-center gap-0.5 text-xs text-[var(--text-secondary)]">
                            <Camera className="h-3 w-3" />{r.photos}
                          </span>
                        ) : <span className="text-[var(--text-tertiary)] text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.nonConformities > 0 ? (
                          <span className="bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] text-xs font-bold px-2 py-0.5 rounded-full">
                            {r.nonConformities}
                          </span>
                        ) : discrepancies.length === 0 ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--data-success-500)] mx-auto" />
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
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-[var(--text-tertiary)]">Sin recepciones que mostrar</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div
            className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 sm:p-6 w-full max-w-2xl space-y-4 max-h-[85vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{detail.ref}</CardTitle>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">OC: {detail.orderRef} · {detail.supplier}</p>
                {detail.inspector && <p className="text-xs text-[var(--text-tertiary)]">Inspector: {detail.inspector}</p>}
              </div>
              <button onClick={() => setDetail(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-surface">
                <X className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            </div>

            {/* Discrepancy alert */}
            {getDiscrepancies(detail.items).length > 0 && (
              <div className="flex items-start gap-2 text-xs bg-[var(--data-error-50)] dark:bg-red-950/10 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] px-3 py-2 rounded-xl">
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
                  <tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-surface">
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-center">Esperado</th>
                    <th className="px-3 py-2 text-center">Recibido</th>
                    <th className="px-3 py-2">Condición</th>
                    <th className="px-3 py-2">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={i} className={cn("border-t border-[var(--rule-soft)] dark:border-card-border", it.condition !== "ok" && "bg-[var(--data-error-50)]/30 dark:bg-red-950/10")}>
                      <td className="px-3 py-2.5 font-bold text-[var(--text-primary)] dark:text-foreground">{it.product}</td>
                      <td className="px-3 py-2.5 text-[var(--text-secondary)] text-center">{it.expectedQty}</td>
                      <td className={cn("px-3 py-2.5 font-bold text-center",
                        it.receivedQty < it.expectedQty ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]"
                      )}>
                        {it.receivedQty}
                        {it.receivedQty !== it.expectedQty && (
                          <span className="ml-1 text-xs">({it.receivedQty > it.expectedQty ? "+" : ""}{it.receivedQty - it.expectedQty})</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", COND_MAP[it.condition].bg, COND_MAP[it.condition].color)}>
                          {COND_MAP[it.condition].label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[var(--text-tertiary)]">{it.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
              {detail.photos > 0 && (
                <span className="flex items-center gap-1"><Camera className="h-4 w-4" /> {detail.photos} fotos</span>
              )}
              {detail.nonConformities > 0 && (
                <span className="flex items-center gap-1 text-[var(--data-error-500)]"><XCircle className="h-4 w-4" /> {detail.nonConformities} no conformidades</span>
              )}
              {detail.nonConformities === 0 && (
                <span className="flex items-center gap-1 text-[var(--data-success-500)]"><CheckCircle2 className="h-4 w-4" /> Sin no conformidades</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New reception modal */}
      {showNew && (
        <div className="modal-backdrop p-4" onClick={() => setShowNew(false)}>
          <div
            className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 sm:p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Nueva recepción de mercadería</CardTitle>
              <button onClick={() => setShowNew(false)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>

            {/* Dropdown OC pendiente — auto-completa todo */}
            {pendingOCs.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">Auto-completar desde OC pendiente</p>
                </div>
                <select
                  value={selectedOcId}
                  onChange={(e) => applyOC(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-white text-sm"
                >
                  <option value="">— Elegir orden de compra —</option>
                  {pendingOCs.map((oc) => (
                    <option key={oc.id} value={oc.id}>
                      {oc.id} · {oc.supplierName ?? "Sin proveedor"} · {oc.items?.length ?? 0} items{oc.total ? ` · S/${Number(oc.total).toFixed(2)}` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Al elegir, se rellenan proveedor, ref y los items del checklist con la cantidad esperada.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Proveedor</label>
                <input value={newForm.supplier} onChange={e => setNewForm(f => ({ ...f, supplier: e.target.value }))}
                  placeholder="Distribuidora ABC"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Nro. Orden de Compra</label>
                <input value={newForm.orderRef} onChange={e => setNewForm(f => ({ ...f, orderRef: e.target.value }))}
                  placeholder="OC-001"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-mono" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Fecha programada</label>
                <input type="date" value={newForm.scheduledDate} onChange={e => setNewForm(f => ({ ...f, scheduledDate: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Inspector</label>
                <input value={newForm.inspector} onChange={e => setNewForm(f => ({ ...f, inspector: e.target.value }))}
                  placeholder="Nombre del responsable"
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm" />
              </div>
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">Checklist de productos</h4>
                <button onClick={addChecklistRow} className="text-xs text-primary font-bold flex items-center gap-1 hover:underline">
                  <Plus className="h-3 w-3" /> Agregar fila
                </button>
              </div>
              <div className="space-y-2">
                {checklist.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 bg-gray-50 dark:bg-surface rounded-xl p-2">
                    <input
                      value={row.product} onChange={e => updateChecklistRow(idx, "product", e.target.value)}
                      placeholder="Producto" className="flex-1 min-w-32 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-xs"
                    />
                    <input type="number" min="0" value={row.expectedQty} onChange={e => updateChecklistRow(idx, "expectedQty", +e.target.value)}
                      placeholder="Esperado" className="w-20 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-xs" />
                    <input type="number" min="0" value={row.receivedQty} onChange={e => updateChecklistRow(idx, "receivedQty", +e.target.value)}
                      placeholder="Recibido" className="w-20 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-xs" />
                    <select value={row.condition} onChange={e => updateChecklistRow(idx, "condition", e.target.value as ItemCondition)}
                      className="px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-xs">
                      {Object.entries(COND_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <input value={row.notes} onChange={e => updateChecklistRow(idx, "notes", e.target.value)}
                      placeholder="Notas (opcional)" className="flex-1 min-w-24 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-xs" />
                    {checklist.length > 1 && (
                      <button onClick={() => removeChecklistRow(idx)} className="p-1 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
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
