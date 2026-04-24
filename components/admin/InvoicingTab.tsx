"use client";

import { CardTitle } from "@buleje/design-system";

import { useState } from "react";
import {
  FileText, Plus, X, Download, Search, Printer,
  CheckCircle, Clock, AlertTriangle, Send, Loader2,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceType = "factura" | "boleta" | "nota_credito" | "nota_debito";
type InvoiceStatus = "borrador" | "emitida" | "anulada" | "pagada";

type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number; // 0.18 = IGV 18%
};

type Invoice = {
  id: string;
  serie: string;
  number: string;
  type: InvoiceType;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  customerName: string;
  customerDoc: string;    // RUC/DNI
  customerDocType: "ruc" | "dni" | "ce";
  customerEmail: string;
  customerAddress: string;
  items: InvoiceItem[];
  subtotal: number;
  igv: number;
  total: number;
  notes?: string;
};

const TYPE_LABEL: Record<InvoiceType, string> = { factura: "Factura", boleta: "Boleta", nota_credito: "Nota Crédito", nota_debito: "Nota Débito" };
const STATUS_LABEL: Record<InvoiceStatus, string> = { borrador: "Borrador", emitida: "Emitida", anulada: "Anulada", pagada: "Pagada" };
const STATUS_COLOR: Record<InvoiceStatus, string> = {
  borrador: "bg-gray-100 text-[var(--text-secondary)] dark:bg-surface dark:text-muted",
  emitida:  "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  anulada:  "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]",
  pagada:   "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
};
const TYPE_COLOR: Record<InvoiceType, string> = {
  factura:      "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  boleta:       "bg-[var(--data-info-100)] text-[var(--data-info)] dark:bg-[var(--data-info)]/30 dark:text-[var(--data-info)]",
  nota_credito: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  nota_debito:  "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",
};

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function calcTotals(items: InvoiceItem[]) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const igv = items.reduce((s, i) => s + i.quantity * i.unitPrice * i.taxRate, 0);
  return { subtotal, igv, total: subtotal + igv };
}

const SEED: Invoice[] = [];

const EMPTY_ITEM: InvoiceItem = { description: "", quantity: 1, unitPrice: 0, taxRate: 0.18 };

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoicingTab() {
  const [invoices, setInvoices] = useState<Invoice[]>(SEED);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<InvoiceType | "all">("all");
  const [statusFilter, _setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    type: "boleta" as InvoiceType,
    customerName: "",
    customerDoc: "",
    customerDocType: "dni" as Invoice["customerDocType"],
    customerEmail: "",
    customerAddress: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [formItems, setFormItems] = useState<InvoiceItem[]>([{ ...EMPTY_ITEM }]);
  const [verifyingDni, setVerifyingDni] = useState(false);
  const [dniMsg, setDniMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { subtotal, igv, total } = calcTotals(formItems);

  const getNextNumber = (type: InvoiceType) => {
    const serie = type === "boleta" ? "B001" : type === "factura" ? "F001" : type === "nota_credito" ? "NC01" : "ND01";
    const existing = invoices.filter(i => i.serie === serie);
    const next = (existing.length + 1).toString().padStart(8, "0");
    return { serie, number: next };
  };

  async function handleVerifyDni(doc: string) {
    if (!/^\d{8}$/.test(doc)) return;
    setVerifyingDni(true);
    setDniMsg(null);
    try {
      const res = await fetch(`/api/reniec/dni/${encodeURIComponent(doc)}`);
      const data = await res.json() as Record<string, string>;
      if (!res.ok) {
        setDniMsg({ ok: false, text: (data.error as string) ?? "No se pudo consultar RENIEC." });
        return;
      }
      const nombreCompleto: string = data.nombreCompleto ?? "";
      if (!form.customerName.trim() && nombreCompleto) {
        setForm(p => ({ ...p, customerName: nombreCompleto }));
      }
      setDniMsg({ ok: true, text: nombreCompleto ? nombreCompleto : "DNI válido." });
    } catch {
      setDniMsg({ ok: false, text: "Error de conexión con RENIEC." });
    } finally {
      setVerifyingDni(false);
    }
  }

  const handleCreate = () => {
    if (!form.customerName.trim() || formItems.some(i => !i.description)) return;
    const { serie, number } = getNextNumber(form.type);
    const { subtotal, igv, total } = calcTotals(formItems);
    const inv: Invoice = {
      id: `inv-${Date.now()}`,
      serie, number,
      type: form.type,
      status: "borrador",
      issueDate: form.issueDate,
      dueDate: form.dueDate,
      customerName: form.customerName,
      customerDoc: form.customerDoc,
      customerDocType: form.customerDocType,
      customerEmail: form.customerEmail,
      customerAddress: form.customerAddress,
      items: formItems,
      subtotal, igv, total,
      notes: form.notes,
    };
    setInvoices(prev => [...prev, inv]);
    setShowForm(false);
    setFormItems([{ ...EMPTY_ITEM }]);
    setForm(p => ({ ...p, customerName: "", customerDoc: "", customerEmail: "", customerAddress: "", notes: "" }));
    setDniMsg(null);
  };

  const handleChangeStatus = (id: string, status: InvoiceStatus) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null);
  };

  const handleDelete = (id: string) => {
    if (!confirm("¿Eliminar este comprobante?")) return;
    setInvoices(prev => prev.filter(i => i.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const handleUpdateItem = (idx: number, field: keyof InvoiceItem, value: string | number) => {
    setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const filtered = invoices
    .filter(i => typeFilter === "all" || i.type === typeFilter)
    .filter(i => statusFilter === "all" || i.status === statusFilter)
    .filter(i => !search || i.customerName.toLowerCase().includes(search.toLowerCase()) || `${i.serie}-${i.number}`.includes(search));

  const totalEmitted = invoices.filter(i => i.status !== "anulada" && i.status !== "borrador").reduce((s, i) => s + i.total, 0);
  const totalIGV = invoices.filter(i => i.status !== "anulada" && i.status !== "borrador").reduce((s, i) => s + i.igv, 0);
  const countDraft = invoices.filter(i => i.status === "borrador").length;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Toolbar — header propio eliminado; el header del módulo lo provee FacturacionModule via AdminModuleHeader */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => exportToCSV(filtered.map(i => ({ tipo: TYPE_LABEL[i.type], serie_número: `${i.serie}-${i.number}`, cliente: i.customerName, ruc_dni: i.customerDoc, fecha: i.issueDate, subtotal: i.subtotal, igv: i.igv, total: i.total, estado: STATUS_LABEL[i.status] })), "comprobantes")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Nuevo comprobante
        </button>
      </div>

      {/* KPIs — uniform surface; intent sólo en value cuando está activo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        {([
          { label: "Total facturado", value: fmt(totalEmitted), icon: FileText, tone: "neutral" as const },
          { label: "IGV generado", value: fmt(totalIGV), icon: AlertTriangle, tone: (totalIGV > 0 ? "warning" : "neutral") as "neutral" | "warning" },
          { label: "En borrador", value: String(countDraft), icon: Clock, tone: "neutral" as const },
          { label: "Comprobantes emitidos", value: String(invoices.filter(i => i.status === "emitida" || i.status === "pagada").length), icon: CheckCircle, tone: "neutral" as const },
        ]).map(({ label, value, icon: Icon, tone }) => {
          const iconCls =
            tone === "warning" ? "text-[var(--data-warning)]" : "text-[var(--text-secondary)]";
          const valueCls =
            tone === "warning" ? "text-[var(--data-warning)]" : "text-[var(--text-primary)]";
          return (
            <div key={label} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] dark:bg-card p-4">
              <Icon className={cn("h-5 w-5 mb-2", iconCls)} />
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">{label}</p>
              <p className={cn("text-xl font-extrabold tabular-nums", valueCls)}>{value}</p>
            </div>
          );
        })}
      </div>

      {/* New invoice form */}
      {showForm && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-5">
          <div className="flex items-center justify-between">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm">Nuevo comprobante</CardTitle>
            <button onClick={() => { setShowForm(false); setDniMsg(null); }}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
          </div>

          {/* Type selector */}
          <div className="flex gap-2 flex-wrap">
            {(["boleta", "factura", "nota_credito", "nota_debito"] as InvoiceType[]).map(t => (
              <button key={t} onClick={() => setForm(p => ({ ...p, type: t }))} className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors", form.type === t ? "bg-primary text-white border-primary" : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Cliente</label>
              <input type="text" value={form.customerName} onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))} placeholder="Nombre o razón social" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Tipo doc.</label>
              <select value={form.customerDocType} onChange={e => setForm(p => ({ ...p, customerDocType: e.target.value as Invoice["customerDocType"] }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                <option value="dni">DNI</option>
                <option value="ruc">RUC</option>
                <option value="ce">CE</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Número doc.</label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={form.customerDoc}
                  onChange={e => { setForm(p => ({ ...p, customerDoc: e.target.value })); setDniMsg(null); }}
                  placeholder="20XXXXXXXXX / 12345678"
                  className="flex-1 min-w-0 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground"
                />
                {form.customerDocType === "dni" && form.customerDoc.length === 8 && (
                  <button
                    type="button"
                    onClick={() => handleVerifyDni(form.customerDoc)}
                    disabled={verifyingDni}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-1.5 shrink-0 hover:bg-primary/90 transition-colors"
                  >
                    {verifyingDni ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Verificar
                  </button>
                )}
              </div>
              {form.customerDocType === "dni" && dniMsg && (
                <p className={`mt-1 text-xs font-medium ${dniMsg.ok ? "text-[var(--data-success)]" : "text-[var(--data-error)]"}`}>
                  {dniMsg.text}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Email</label>
              <input type="email" value={form.customerEmail} onChange={e => setForm(p => ({ ...p, customerEmail: e.target.value }))} placeholder="cliente@email.com" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Fecha emisión</label>
              <input type="date" value={form.issueDate} onChange={e => setForm(p => ({ ...p, issueDate: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Fecha vencimiento</label>
              <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Líneas del comprobante</p>
              <button onClick={() => setFormItems(p => [...p, { ...EMPTY_ITEM }])} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Agregar línea</button>
            </div>
            {formItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2 items-start">
                <div className="col-span-4">
                  {idx === 0 && <label className="text-xs text-[var(--text-tertiary)] dark:text-muted block mb-1">Descripción</label>}
                  <input type="text" value={item.description} onChange={e => handleUpdateItem(idx, "description", e.target.value)} placeholder="Producto/Servicio" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
                </div>
                <div className="col-span-2">
                  {idx === 0 && <label className="text-xs text-[var(--text-tertiary)] dark:text-muted block mb-1">Cant.</label>}
                  <input type="number" value={item.quantity} onChange={e => handleUpdateItem(idx, "quantity", parseFloat(e.target.value) || 0)} min="0" step="1" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
                </div>
                <div className="col-span-3">
                  {idx === 0 && <label className="text-xs text-[var(--text-tertiary)] dark:text-muted block mb-1">Precio unit.</label>}
                  <input type="number" value={item.unitPrice} onChange={e => handleUpdateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} min="0" step="0.01" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
                </div>
                <div className="col-span-2">
                  {idx === 0 && <label className="text-xs text-[var(--text-tertiary)] dark:text-muted block mb-1">Total</label>}
                  <div className="py-2 text-sm font-semibold text-[var(--text-primary)] dark:text-foreground">{fmt(item.quantity * item.unitPrice)}</div>
                </div>
                <div className="col-span-1 flex items-end pb-2">
                  {formItems.length > 1 && (
                    <button onClick={() => setFormItems(p => p.filter((_, i) => i !== idx))} className="text-[var(--data-error)] hover:text-[var(--data-error)] transition-colors"><X className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-end space-y-1 text-sm pt-2 border-t border-[var(--rule-soft)] dark:border-card-border">
              <div className="space-y-1 text-right">
                <p className="text-[var(--text-secondary)] dark:text-muted">Subtotal: <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{fmt(subtotal)}</span></p>
                <p className="text-[var(--text-secondary)] dark:text-muted">IGV (18%): <span className="font-semibold text-[var(--data-warning)]">{fmt(igv)}</span></p>
                <p className="text-[var(--text-primary)] dark:text-foreground font-bold">Total: <span className="text-primary text-base">{fmt(total)}</span></p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted">Cancelar</button>
            <button onClick={handleCreate} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90">Crear comprobante</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente o N° comprobante..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["all", "boleta", "factura", "nota_credito", "nota_debito"] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)} className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors", typeFilter === t ? "bg-primary text-white border-primary" : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
              {t === "all" ? "Todos" : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-y-hidden overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-soft)] dark:border-card-border">
            <tr>
              <th className="text-left px-3 sm:px-6 py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Serie-Núm.</th>
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Tipo</th>
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Cliente</th>
              <th className="text-left px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase hidden sm:table-cell">Fecha</th>
              <th className="text-right px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Total</th>
              <th className="text-center px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase">Estado</th>
              <th className="text-center px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-secondary)] dark:text-muted text-xs uppercase hidden sm:table-cell">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-card-border">
            {filtered.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors cursor-pointer" onClick={() => setSelected(selected?.id === inv.id ? null : inv)}>
                <td className="px-3 sm:px-6 py-3 font-mono text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{inv.serie}-{inv.number}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3">
                  <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", TYPE_COLOR[inv.type])}>{TYPE_LABEL[inv.type]}</span>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-primary)] dark:text-foreground">
                  <p className="font-semibold">{inv.customerName}</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{inv.customerDocType.toUpperCase()} {inv.customerDoc}</p>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted hidden sm:table-cell">{fmtDate(inv.issueDate)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">
                  {fmt(inv.total)}
                  <div className="text-xs font-normal text-[var(--data-warning)]">IGV {fmt(inv.igv)}</div>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                  <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", STATUS_COLOR[inv.status])}>{STATUS_LABEL[inv.status]}</span>
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-center hidden sm:table-cell" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1">
                    {inv.status === "borrador" && (
                      <button onClick={() => handleChangeStatus(inv.id, "emitida")} className="p-1.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors" title="Emitir"><Send className="h-3.5 w-3.5" /></button>
                    )}
                    {inv.status === "emitida" && (
                      <button onClick={() => handleChangeStatus(inv.id, "pagada")} className="p-1.5 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors" title="Marcar pagado"><CheckCircle className="h-3.5 w-3.5" /></button>
                    )}
                    <button className="p-1.5 rounded-lg bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-accent transition-colors" title="Imprimir"><Printer className="h-3.5 w-3.5" /></button>
                    {inv.status !== "pagada" && (
                      <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error)] hover:bg-[var(--data-error-100)] dark:hover:bg-[var(--data-error)]/30 transition-colors" title="Anular"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center py-10 text-[var(--text-tertiary)] dark:text-muted text-sm">Sin comprobantes encontrados.</p>}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="modal-backdrop p-4" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{TYPE_LABEL[selected.type]} {selected.serie}-{selected.number}</p>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{fmtDate(selected.issueDate)}</p>
              </div>
              <button onClick={() => setSelected(null)}><X className="h-5 w-5 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-1 text-sm">
              <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{selected.customerName}</p>
              <p className="text-[var(--text-secondary)] dark:text-muted">{selected.customerDocType.toUpperCase()} {selected.customerDoc}</p>
              {selected.customerAddress && <p className="text-[var(--text-secondary)] dark:text-muted">{selected.customerAddress}</p>}
              {selected.customerEmail && <p className="text-[var(--text-secondary)] dark:text-muted">{selected.customerEmail}</p>}
            </div>
            <div className="space-y-2">
              {selected.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-[var(--text-primary)] dark:text-foreground">{item.description}</p>
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{item.quantity} × {fmt(item.unitPrice)}</p>
                  </div>
                  <span className="font-semibold text-[var(--text-primary)] dark:text-foreground">{fmt(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--rule-soft)] dark:border-card-border pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-[var(--text-secondary)] dark:text-muted"><span>Subtotal</span><span>{fmt(selected.subtotal)}</span></div>
              <div className="flex justify-between text-[var(--data-warning)]"><span>IGV (18%)</span><span>{fmt(selected.igv)}</span></div>
              <div className="flex justify-between font-extrabold text-[var(--text-primary)] dark:text-foreground text-base"><span>Total</span><span>{fmt(selected.total)}</span></div>
            </div>
            {selected.notes && <p className="text-xs text-[var(--text-tertiary)] dark:text-muted italic">{selected.notes}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <button className="flex-1 flex flex-wrap items-center justify-center gap-2 py-2.5 rounded-lg bg-gray-100 dark:bg-surface text-[var(--text-primary)] dark:text-foreground text-sm font-semibold hover:bg-gray-200 dark:hover:bg-accent transition-colors">
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              {selected.status === "borrador" && (
                <button onClick={() => { handleChangeStatus(selected.id, "emitida"); setSelected(null); }} className="flex-1 flex flex-wrap items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
                  <Send className="h-4 w-4" /> Emitir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
