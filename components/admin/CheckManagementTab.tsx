"use client";

import { CardTitle, LoadingState, PageTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import {
  Wallet, Download, Search, Eye, X,
  Calendar, AlertTriangle, Clock, Ban, Loader2, RefreshCw, CheckCircle } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckType = "recibido" | "emitido";
type CheckStatus = "en-cartera" | "depositado" | "cobrado" | "pagado" | "rebotado" | "por-depositar" | "pendiente";

type Check = {
  id: string;
  number: string;
  bank: string;
  type: CheckType;
  amount: number;
  issueDate: string;
  dueDate: string;
  depositDate?: string;
  status: CheckStatus;
  party: string;
  notes: string;
};

type PayableRecord = {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
  description: string;
  createdAt: string;
  payments?: { date: string; amount: number; method?: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const STATUS_MAP: Record<CheckStatus, { label: string; color: string; bg: string }> = {
  "en-cartera":    { label: "En cartera",    color: "text-[var(--data-success-500)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"    },
  "por-depositar": { label: "Por depositar", color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30"  },
  depositado:      { label: "Depositado",    color: "text-[var(--text-secondary)]",  bg: "bg-[var(--surface-sunken)]"},
  cobrado:         { label: "Cobrado",       color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"},
  pagado:          { label: "Pagado",        color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]"},
  rebotado:        { label: "Rebotado",      color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30"      },
  pendiente:       { label: "Pendiente",     color: "text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30"},
};

// Convierte cuentas por pagar en registros de cheques "emitidos"
function payablesToChecks(payables: PayableRecord[]): Check[] {
  return payables.map((p, i) => {
    let status: CheckStatus = "pendiente";
    if (p.status === "pagado") status = "pagado";
    else if (p.status === "vencido") status = "rebotado";
    else if (p.status === "parcial") status = "depositado";

    return {
      id: p.id,
      number: `CHQ-${String(i + 1).padStart(4, "0")}`,
      bank: "BCP", // banco por defecto
      type: "emitido" as CheckType,
      amount: p.amount,
      issueDate: p.createdAt ? p.createdAt.split("T")[0] : new Date().toISOString().split("T")[0],
      dueDate: p.dueDate ? p.dueDate.split("T")[0] : new Date().toISOString().split("T")[0],
      depositDate: p.status === "pagado" ? (p.payments?.[p.payments.length - 1]?.date ?? undefined) : undefined,
      status,
      party: p.supplierName || p.supplierId || "Proveedor",
      notes: p.description || "",
    };
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckManagementTab() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<CheckType | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState<CheckStatus | "todos">("todos");
  const [detail, setDetail] = useState<Check | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    fetch("/api/payables")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PayableRecord[]) => {
        setChecks(payablesToChecks(Array.isArray(data) ? data : []));
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const pending = checks.filter((c) => !["pagado", "cobrado", "rebotado"].includes(c.status));
    const paid = checks.filter((c) => ["pagado", "cobrado"].includes(c.status));
    const bounced = checks.filter((c) => c.status === "rebotado").length;
    const toDeposit = checks.filter((c) => c.status === "por-depositar").length;
    const totalPending = pending.reduce((s, c) => s + c.amount, 0);
    const totalPaid = paid.reduce((s, c) => s + c.amount, 0);
    const bouncedRate = checks.length > 0 ? (bounced / checks.length) * 100 : 0;
    return { totalPending, totalPaid, bounced, toDeposit, bouncedRate, totalChecks: checks.length };
  }, [checks]);

  const filtered = useMemo(() => {
    let list = checks;
    if (filterType !== "todos") list = list.filter((c) => c.type === filterType);
    if (filterStatus !== "todos") list = list.filter((c) => c.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.party.toLowerCase().includes(q) ||
          c.number.includes(q) ||
          c.bank.toLowerCase().includes(q)
      );
    }
    return list;
  }, [checks, search, filterType, filterStatus]);

  if (loading) {
    return (
      <LoadingState message="Cargando cheques..." />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-10 w-10 text-[var(--data-error-500)]" />
        <p className="text-[var(--text-secondary)] dark:text-muted text-sm">Error cargando datos</p>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Gestión de Cheques
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">
            {stats.totalChecks} cheques registrados — portafolio de pagos a proveedores
          </p>
        </div>
        <button
          onClick={() =>
            exportToCSV(
              filtered.map((c) => ({
                número: c.number,
                banco: c.bank,
                tipo: c.type,
                monto: c.amount,
                emision: c.issueDate,
                vencimiento: c.dueDate,
                deposito: c.depositDate || "-",
                estado: STATUS_MAP[c.status]?.label ?? c.status,
                entidad: c.party,
              })),
              "cheques"
            )
          }
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Total pendiente",
            value: fmt(stats.totalPending),
            color: "text-[var(--data-warning-500)]",
            bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",
            icon: Clock,
          },
          {
            label: "Total pagado",
            value: fmt(stats.totalPaid),
            color: "text-[var(--data-success-500)]",
            bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
            icon: CheckCircle,
          },
          {
            label: "Por depositar",
            value: String(stats.toDeposit),
            color: "text-[var(--data-success-500)]",
            bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
            icon: Calendar,
          },
          {
            label: "Rebotados / Tasa",
            value: `${stats.bounced} (${Number(stats.bouncedRate).toFixed(1)}%)`,
            color: stats.bounced > 0 ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]",
            bg: stats.bounced > 0 ? "bg-[var(--data-error-50)] dark:bg-red-950/30" : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
            icon: Ban,
          },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Alertas */}
      {stats.bounced > 0 && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/40 rounded-xl p-3 flex flex-wrap items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
              Alerta: {stats.bounced} cheque(s) rebotado(s)
            </p>
            <p className="text-xs text-[var(--data-error-500)]/80">
              Revisar y contactar a los proveedores correspondientes
            </p>
          </div>
        </div>
      )}

      {/* Distribución visual por estado */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground mb-3">Distribución por estado</CardTitle>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_MAP) as CheckStatus[]).map((s) => {
            const count = checks.filter((c) => c.status === s).length;
            if (count === 0) return null;
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(filterStatus === s ? "todos" : s)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                  STATUS_MAP[s].bg,
                  STATUS_MAP[s].color,
                  filterStatus === s
                    ? "ring-2 ring-offset-1 ring-primary"
                    : "border-transparent hover:scale-105"
                )}
              >
                {STATUS_MAP[s].label}
                <span className="bg-white/60 dark:bg-black/20 rounded-full px-1.5 py-0.5">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por entidad, número, banco..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-xl bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="px-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-xl bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground"
        >
          <option value="todos">Todos</option>
          <option value="recibido">Recibidos</option>
          <option value="emitido">Emitidos</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
          className="px-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-xl bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground"
        >
          <option value="todos">Todos los estados</option>
          {(Object.entries(STATUS_MAP) as [CheckStatus, typeof STATUS_MAP[CheckStatus]][]).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-[var(--surface-alt)] dark:bg-surface">
                <th className="px-4 py-3">Nro</th>
                <th className="px-4 py-3">Banco</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Entidad</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Vencimiento</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const statusMeta = STATUS_MAP[c.status] ?? STATUS_MAP.pendiente;
                const isOverdue = new Date(c.dueDate) < new Date() && !["pagado", "cobrado"].includes(c.status);
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-t border-[var(--rule-soft)] dark:border-card-border hover:bg-[var(--surface-alt)] dark:hover:bg-accent/20",
                      c.status === "rebotado" && "bg-[var(--data-error-50)]/50 dark:bg-red-950/10",
                      isOverdue && "bg-[var(--data-warning-50)]/30 dark:bg-amber-950/5"
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-bold text-[var(--text-primary)] dark:text-foreground">
                      {c.number}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{c.bank}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full",
                          c.type === "recibido"
                            ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)]"
                            : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)]"
                        )}
                      >
                        {c.type === "recibido" ? "Recibido" : "Emitido"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-[var(--text-primary)] dark:text-foreground">{c.party}</td>
                    <td className="px-4 py-3 font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(c.amount)}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-[var(--text-secondary)] flex items-center gap-1",
                        isOverdue && "text-[var(--data-warning-500)] font-bold"
                      )}
                    >
                      <Calendar className="h-3 w-3" />
                      {new Date(c.dueDate).toLocaleDateString("es-PE")}
                      {isOverdue && " (vencido)"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full",
                          statusMeta.bg,
                          statusMeta.color
                        )}
                      >
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDetail(c)}
                        className="text-primary hover:underline text-xs font-bold"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[var(--text-tertiary)] dark:text-muted text-sm">
                    {checks.length === 0
                      ? "No hay cuentas por pagar registradas aún."
                      : "No se encontraron cheques con los filtros seleccionados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detalle */}
      {detail && (
        <div
          className="modal-backdrop p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-6 w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">
                Cheque #{detail.number}
              </CardTitle>
              <button onClick={() => setDetail(null)}>
                <X className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Banco", detail.bank],
                ["Tipo", detail.type === "recibido" ? "Recibido" : "Emitido"],
                ["Entidad", detail.party],
                ["Monto", fmt(detail.amount)],
                ["Emisión", new Date(detail.issueDate).toLocaleDateString("es-PE")],
                ["Vencimiento", new Date(detail.dueDate).toLocaleDateString("es-PE")],
                ["Depósito", detail.depositDate ? new Date(detail.depositDate).toLocaleDateString("es-PE") : "—"],
                ["Estado", (STATUS_MAP[detail.status] ?? STATUS_MAP.pendiente).label],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <p className="text-xs text-[var(--text-tertiary)]">{k}</p>
                  <p className="font-bold text-[var(--text-primary)] dark:text-foreground">{v}</p>
                </div>
              ))}
            </div>
            {detail.notes && (
              <p className="text-xs text-[var(--text-tertiary)] italic border-t border-[var(--rule-soft)] dark:border-card-border pt-2">
                {detail.notes}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
