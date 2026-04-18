"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import {
  CreditCard, Plus, X, RefreshCw, Download, AlertTriangle,
  CheckCircle, Clock, Search } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import EmptyState from "@/components/admin/shared/EmptyState";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";

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
  pendiente: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",
  parcial:   "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  pagado:    "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  vencido:   "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]",
};
const STATUS_VARIANT: Record<ARStatus, BadgeVariant> = {
  pendiente: "warning",
  parcial:   "info",
  pagado:    "success",
  vencido:   "error",
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

type RiskLevel = "bajo" | "medio" | "alto";
function _getRiskLevel(balance: number): RiskLevel {
  if (balance > 200) return "alto";
  if (balance >= 50) return "medio";
  return "bajo";
}
const _RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; dot: string }> = {
  bajo:  { label: "Bajo",  color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", dot: "bg-[var(--accent-soft)]" },
  medio: { label: "Medio", color: "text-[var(--data-warning)]",   bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/20",    dot: "bg-[var(--data-warning)]" },
  alto:  { label: "Alto",  color: "text-[var(--data-error)]",     bg: "bg-[var(--data-error-50)] dark:bg-red-950/20",        dot: "bg-[var(--data-error)]" },
};

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Cargar fiados REALES de la base de datos
      const res = await fetch("/api/fiados");
      if (res.ok) {
        const fiados = await res.json();
        const arr = Array.isArray(fiados) ? fiados : [];
        // Mapear fiados de la DB al formato AccountReceivable
        const mapped: AccountReceivable[] = arr.map((f: any) => ({
          id: f.id,
          customerName: f.customerName || f.customerId || "Cliente",
          customerPhone: f.customerId || "",
          description: f.descripcion || "Fiado desde punto de venta",
          totalAmount: f.total ?? 0,
          paidAmount: (f.total ?? 0) - (f.saldo ?? 0),
          dueDate: f.fechaVence || new Date(Date.now() + 30 * 86400000).toISOString(),
          issuedDate: f.createdAt || new Date().toISOString(),
          status: "pendiente" as ARStatus,
          notes: f.descripcion,
        }));
        const updated = mapped.map(ar => ({ ...ar, status: getStatus(ar) }));
        setRecords(updated);
      } else {
        // Fallback a localStorage si la API falla
        const data = seedMock();
        const updated = data.map(ar => ({ ...ar, status: getStatus(ar) }));
        setRecords(updated);
      }
    } catch {
      // Fallback a localStorage
      const data = seedMock();
      const updated = data.map(ar => ({ ...ar, status: getStatus(ar) }));
      setRecords(updated);
    }
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
    try {
      // Crear fiado REAL en la base de datos
      const res = await fetch("/api/fiados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: form.customerPhone.trim() || form.customerName.trim(),
          total: parseFloat(form.totalAmount),
          descripcion: form.description.trim() || `Cuenta por cobrar - ${form.customerName.trim()}`,
          fechaVence: new Date(form.dueDate).toISOString(),
        }),
      });
      if (res.ok) {
        // Recargar desde la API para obtener datos reales
        await load();
        setForm(EMPTY_FORM);
        setShowForm(false);
      } else {
        const err = await res.json().catch(() => ({}));
        // Fallback a localStorage si la API falla
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
          notes: err.error || form.notes,
        };
        persist([...records, newAR]);
        setForm(EMPTY_FORM);
        setShowForm(false);
      }
    } catch {
      // Fallback local
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
    }
    setSaving(false);
  };

  const handleRegisterPayment = async () => {
    if (!selected || !payAmount) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) return;

    // Registrar pago en la API de fiados (si el ID es de la DB, no local)
    if (!selected.id.startsWith("ar-")) {
      try {
        await fetch(`/api/fiados/${selected.id}/pagar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ monto: amount }),
        });
        // Recargar datos reales
        await load();
        setPayAmount("");
        return;
      } catch { /* fallback a local */ }
    }

    // Fallback local
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
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Cuentas por Cobrar
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Créditos otorgados a clientes y gestión de cobranza</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
          </button>
          <button onClick={() => exportToCSV(filtered.map(r => ({ cliente: r.customerName, telefono: r.customerPhone, descripcion: r.description, total: r.totalAmount, pagado: r.paidAmount, saldo: r.totalAmount - r.paidAmount, vencimiento: r.dueDate, estado: r.status })), "cuentas-por-cobrar")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nueva cuenta
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: "Total por cobrar", value: fmt(totalPending), icon: CreditCard, color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Cuentas vencidas", value: fmt(totalOverdue), icon: AlertTriangle, color: "text-[var(--data-error)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30" },
          { label: "Clientes en mora", value: String(countOverdue), icon: Clock, color: "text-[var(--data-warning)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Cuentas pagadas", value: String(records.filter(r => r.status === "pagado").length), icon: CheckCircle, color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <Icon className={cn("h-5 w-5 mb-2", color)} />
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* New form */}
      {showForm && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm">Nueva cuenta por cobrar</CardTitle>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
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
                <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">{label}</label>
                <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface">Cancelar</button>
            <button onClick={handleCreate} disabled={saving} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Guardando..." : "Crear"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "pendiente", "parcial", "vencido", "pagado"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize", statusFilter === s ? "bg-primary text-white" : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
              {s === "all" ? "Todos" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} cols={4} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-4">
          {/* List */}
          <div className="lg:col-span-2 space-y-3">
            {filtered.length === 0 && (
              <EmptyState
                icon={CreditCard}
                title="Sin cuentas por cobrar"
                description="No hay cuentas por cobrar pendientes."
              />
            )}
            {filtered.map(ar => {
              const balance = ar.totalAmount - ar.paidAmount;
              const pctPaid = (ar.paidAmount / ar.totalAmount) * 100;
              return (
                <div
                  key={ar.id}
                  onClick={() => setSelected(ar)}
                  className={cn("bg-white dark:bg-card border rounded-xl p-4 cursor-pointer hover:border-primary/40 transition-all", selected?.id === ar.id ? "border-primary " : "border-[var(--rule-base)] dark:border-card-border")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm">{ar.customerName}</p>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{ar.description}</p>
                    </div>
                    <StatusBadge variant={STATUS_VARIANT[ar.status]} label={STATUS_LABEL[ar.status]} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)] dark:text-muted text-xs">Vence: {fmtDate(ar.dueDate)}</span>
                    <span className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{fmt(balance)} <span className="text-xs font-normal text-[var(--text-tertiary)]">pendiente</span></span>
                  </div>
                  {ar.paidAmount > 0 && (
                    <div className="mt-2">
                      <div className="w-full h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--accent-soft)] rounded-full transition-all" style={{ width: `${pctPaid}%` }} />
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted mt-0.5">{pctPaid.toFixed(0)}% pagado — {fmt(ar.paidAmount)} de {fmt(ar.totalAmount)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          <div>
            {selected ? (
              <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-4 sticky top-20">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm">{selected.customerName}</CardTitle>
                  <button onClick={() => setSelected(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
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
                  <div className="border-t border-[var(--rule-soft)] dark:border-card-border pt-4 space-y-3">
                    <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Registrar pago</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] dark:text-muted block mb-1">Monto</label>
                        <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
                      </div>
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] dark:text-muted block mb-1">Fecha</label>
                        <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] dark:text-muted block mb-1">Método</label>
                      <select value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentRecord["method"])} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
                        {["efectivo","transferencia","yape","plin","otro"].map(m => <option key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                      </select>
                    </div>
                    <button onClick={handleRegisterPayment} className="w-full py-2.5 rounded-lg bg-[var(--accent-soft)] text-white text-sm font-bold hover:bg-[var(--accent-soft)] transition-colors">Registrar pago</button>
                  </div>
                )}

                {/* Payment history */}
                {payments.filter(p => p.arId === selected.id).length > 0 && (
                  <div className="border-t border-[var(--rule-soft)] dark:border-card-border pt-3 space-y-2">
                    <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Pagos registrados</p>
                    {payments.filter(p => p.arId === selected.id).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)] dark:text-muted">{fmtDate(p.date)} · {p.method}</span>
                        <span className="font-bold text-[var(--data-success)]">{fmt(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => handleDelete(selected.id)} className="w-full py-2 rounded-lg border border-[var(--data-error)] dark:border-[var(--data-error)]/40 text-[var(--data-error)] text-xs font-semibold hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors">Eliminar registro</button>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-8 text-center text-[var(--text-tertiary)] dark:text-muted text-sm">
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
      <span className="text-[var(--text-secondary)] dark:text-muted text-xs">{label}</span>
      <span className={cn("text-xs font-semibold text-[var(--text-primary)] dark:text-foreground", bold && "font-bold", color)}>{val}</span>
    </div>
  );
}
