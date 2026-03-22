"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CreditCard, Loader2, Plus, X, RefreshCw, Download, AlertTriangle,
  CheckCircle, Clock, Search, ChevronDown,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ARStatus = "pendiente" | "parcial" | "pagado" | "vencido";

type AccountReceivable = {
  id: string;
  customerName: string;
  customerPhone: string;
  description: string;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  issuedDate: string;
  status: ARStatus;
  notes?: string;
};

type PaymentRecord = {
  id: string;
  arId: string;
  amount: number;
  date: string;
  method: "efectivo" | "transferencia" | "yape" | "plin" | "otro";
};

const STATUS_LABEL: Record<ARStatus, string> = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado", vencido: "Vencido" };
const STATUS_COLOR: Record<ARStatus, string> = {
  pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  parcial:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pagado:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  vencido:   "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function getStatus(ar: AccountReceivable): ARStatus {
  const now = new Date();
  const due = new Date(ar.dueDate);
  if (ar.paidAmount >= ar.totalAmount) return "pagado";
  if (due < now && ar.paidAmount < ar.totalAmount) return "vencido";
  if (ar.paidAmount > 0) return "parcial";
  return "pendiente";
}

const EMPTY_FORM = { customerName: "", customerPhone: "", description: "", totalAmount: "", dueDate: "", notes: "" };

// ── Seed mock data ─────────────────────────────────────────────────────────────

function seedMock(): AccountReceivable[] {
  const stored = typeof window !== "undefined" ? localStorage.getItem("ar_records") : null;
  if (stored) { try { return JSON.parse(stored); } catch {} }
  return [];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccountsReceivableTab() {
  const [records, setRecords] = useState<AccountReceivable[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ARStatus | "all">("all");
  const [selected, setSelected] = useState<AccountReceivable | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentRecord["method"]>("efectivo");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(() => {
    setLoading(true);
    const data = seedMock();
    // Recalculate statuses
    const updated = data.map(ar => ({ ...ar, status: getStatus(ar) }));
    setRecords(updated);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = (updated: AccountReceivable[]) => {
    const withStatus = updated.map(ar => ({ ...ar, status: getStatus(ar) }));
    setRecords(withStatus);
    if (typeof window !== "undefined") localStorage.setItem("ar_records", JSON.stringify(withStatus));
  };

  const handleCreate = async () => {
    if (!form.customerName.trim() || !form.totalAmount || !form.dueDate) return;
    setSaving(true);
    const newAR: AccountReceivable = {
      id: `ar-${Date.now()}`,
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      description: form.description.trim(),
      totalAmount: parseFloat(form.totalAmount),
      paidAmount: 0,
      dueDate: form.dueDate,
      issuedDate: new Date().toISOString().slice(0, 10),
      status: "pendiente",
      notes: form.notes,
    };
    persist([...records, newAR]);
    setForm(EMPTY_FORM);
    setShowForm(false);
    setSaving(false);
  };

  const handleRegisterPayment = () => {
    if (!selected || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return;
    const payment: PaymentRecord = { id: `pay-${Date.now()}`, arId: selected.id, amount, date: payDate, method: payMethod };
    setPayments(prev => [...prev, payment]);
    const updated = records.map(ar => {
      if (ar.id !== selected.id) return ar;
      const newPaid = Math.min(ar.totalAmount, ar.paidAmount + amount);
      return { ...ar, paidAmount: newPaid };
    });
    persist(updated);
    const updatedSelected = updated.find(ar => ar.id === selected.id) ?? null;
    setSelected(updatedSelected ? { ...updatedSelected, status: getStatus(updatedSelected) } : null);
    setPayAmount("");
  };

  const handleDelete = (id: string) => {
    if (!confirm("¿Eliminar esta cuenta por cobrar?")) return;
    persist(records.filter(r => r.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const filtered = records
    .filter(r => statusFilter === "all" || r.status === statusFilter)
    .filter(r => !search || r.customerName.toLowerCase().includes(search.toLowerCase()) || r.customerPhone.includes(search));

  const totalPending = records.filter(r => r.status !== "pagado").reduce((s, r) => s + (r.totalAmount - r.paidAmount), 0);
  const totalOverdue = records.filter(r => r.status === "vencido").reduce((s, r) => s + (r.totalAmount - r.paidAmount), 0);
  const countOverdue = records.filter(r => r.status === "vencido").length;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Cuentas por Cobrar
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Créditos otorgados a clientes y gestión de cobranza</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4 text-gray-500 dark:text-muted" />
          </button>
          <button onClick={() => exportToCSV(filtered.map(r => ({ cliente: r.customerName, telefono: r.customerPhone, descripcion: r.description, total: r.totalAmount, pagado: r.paidAmount, saldo: r.totalAmount - r.paidAmount, vencimiento: r.dueDate, estado: r.status })), "cuentas-por-cobrar")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nueva cuenta
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: "Total por cobrar", value: fmt(totalPending), icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Cuentas vencidas", value: fmt(totalOverdue), icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "Clientes en mora", value: String(countOverdue), icon: Clock, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Cuentas pagadas", value: String(records.filter(r => r.status === "pagado").length), icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <Icon className={cn("h-5 w-5 mb-2", color)} />
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* New form */}
      {showForm && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-foreground text-sm">Nueva cuenta por cobrar</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: "customerName", label: "Cliente", type: "text", placeholder: "Nombre completo" },
              { key: "customerPhone", label: "Teléfono", type: "text", placeholder: "9XXXXXXXX" },
              { key: "description", label: "Descripción", type: "text", placeholder: "Concepto..." },
              { key: "totalAmount", label: "Monto total (S/)", type: "number", placeholder: "0.00" },
              { key: "dueDate", label: "Fecha de vencimiento", type: "date", placeholder: "" },
              { key: "notes", label: "Notas", type: "text", placeholder: "Opcional..." },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label className="text-xs font-semibold text-gray-500 dark:text-muted block mb-1">{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-xl border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface">Cancelar</button>
            <button onClick={handleCreate} disabled={saving} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Guardando..." : "Crear"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "pendiente", "parcial", "vencido", "pagado"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize", statusFilter === s ? "bg-primary text-white" : "bg-white dark:bg-card border border-gray-200 dark:border-card-border text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
              {s === "all" ? "Todos" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-4">
          {/* List */}
          <div className="lg:col-span-2 space-y-3">
            {filtered.length === 0 && <p className="text-center py-10 text-gray-400 dark:text-muted text-sm">Sin registros encontrados.</p>}
            {filtered.map(ar => {
              const balance = ar.totalAmount - ar.paidAmount;
              const pctPaid = (ar.paidAmount / ar.totalAmount) * 100;
              return (
                <div
                  key={ar.id}
                  onClick={() => setSelected(ar)}
                  className={cn("bg-white dark:bg-card border rounded-2xl p-4 cursor-pointer hover:border-primary/40 transition-all", selected?.id === ar.id ? "border-primary shadow-sm" : "border-gray-200 dark:border-card-border")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-foreground text-sm">{ar.customerName}</p>
                      <p className="text-xs text-gray-500 dark:text-muted">{ar.description}</p>
                    </div>
                    <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full shrink-0", STATUS_COLOR[ar.status])}>{STATUS_LABEL[ar.status]}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-muted text-xs">Vence: {fmtDate(ar.dueDate)}</span>
                    <span className="font-extrabold text-gray-800 dark:text-foreground">{fmt(balance)} <span className="text-xs font-normal text-gray-400">pendiente</span></span>
                  </div>
                  {ar.paidAmount > 0 && (
                    <div className="mt-2">
                      <div className="w-full h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pctPaid}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-muted mt-0.5">{pctPaid.toFixed(0)}% pagado — {fmt(ar.paidAmount)} de {fmt(ar.totalAmount)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          <div>
            {selected ? (
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5 space-y-4 sticky top-20">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 dark:text-foreground text-sm">{selected.customerName}</h3>
                  <button onClick={() => setSelected(null)}><X className="h-4 w-4 text-gray-400" /></button>
                </div>
                <div className="space-y-2 text-sm">
                  <Row label="Teléfono" val={selected.customerPhone || "—"} />
                  <Row label="Descripción" val={selected.description || "—"} />
                  <Row label="Emitido" val={fmtDate(selected.issuedDate)} />
                  <Row label="Vencimiento" val={fmtDate(selected.dueDate)} />
                  <Row label="Total" val={fmt(selected.totalAmount)} bold />
                  <Row label="Pagado" val={fmt(selected.paidAmount)} />
                  <Row label="Saldo" val={fmt(selected.totalAmount - selected.paidAmount)} bold color={selected.status === "vencido" ? "text-red-500" : "text-primary"} />
                  {selected.notes && <Row label="Notas" val={selected.notes} />}
                </div>

                {selected.status !== "pagado" && (
                  <div className="border-t border-gray-100 dark:border-card-border pt-4 space-y-3">
                    <p className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide">Registrar pago</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-muted block mb-1">Monto</label>
                        <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-muted block mb-1">Fecha</label>
                        <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-muted block mb-1">Método</label>
                      <select value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentRecord["method"])} className="w-full text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
                        {["efectivo","transferencia","yape","plin","otro"].map(m => <option key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                      </select>
                    </div>
                    <button onClick={handleRegisterPayment} className="w-full py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors">Registrar pago</button>
                  </div>
                )}

                {/* Payment history */}
                {payments.filter(p => p.arId === selected.id).length > 0 && (
                  <div className="border-t border-gray-100 dark:border-card-border pt-3 space-y-2">
                    <p className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide">Pagos registrados</p>
                    {payments.filter(p => p.arId === selected.id).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-muted">{fmtDate(p.date)} · {p.method}</span>
                        <span className="font-bold text-emerald-600">{fmt(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => handleDelete(selected.id)} className="w-full py-2 rounded-xl border border-red-200 dark:border-red-900/40 text-red-500 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">Eliminar registro</button>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-surface rounded-2xl p-8 text-center text-gray-400 dark:text-muted text-sm">
                Selecciona una cuenta para ver detalles y registrar pagos
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, val, bold, color }: { label: string; val: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 dark:text-muted text-xs">{label}</span>
      <span className={cn("text-xs font-semibold text-gray-700 dark:text-foreground", bold && "font-bold", color)}>{val}</span>
    </div>
  );
}
