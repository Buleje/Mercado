"use client";

import { LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle, TrendingDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type CashRegister = {
  id: string;
  status?: string;
  openingAmount?: number;
  closingAmount?: number;
  movements?: { type: string; amount: number }[];
};

type Payable = {
  id: string;
  status: string;
  amount: number;
  paidAmount: number;
  dueDate?: string;
  supplierName?: string;
};

type Order = {
  id: string;
  status?: string;
  paymentMethod?: string;
  total?: number;
  deuda?: boolean;
  paymentStatus?: string;
};

type ProjectionData = {
  cashBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
  projection15d: number;
  isNegative: boolean;
  deficit: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function computeCashBalance(registers: CashRegister[]): number {
  const open = registers.find(r => r.status === "open" || r.status === "abierta");
  if (!open) {
    // Si no hay caja abierta, tomar la última cerrada
    if (registers.length === 0) return 0;
    const last = registers[registers.length - 1];
    return last.closingAmount ?? last.openingAmount ?? 0;
  }
  const base = open.openingAmount ?? 0;
  const inflow = (open.movements ?? [])
    .filter(m => m.type === "venta" || m.type === "ingreso")
    .reduce((s, m) => s + m.amount, 0);
  const outflow = (open.movements ?? [])
    .filter(m => m.type === "egreso")
    .reduce((s, m) => s + m.amount, 0);
  return base + inflow - outflow;
}

function computeAccountsReceivable(orders: Order[]): number {
  // Pedidos con deuda pendiente (fiados)
  return orders
    .filter(o => {
      const status = (o.status ?? "").toLowerCase();
      const isActive = status !== "cancelado" && status !== "cancelled" && status !== "entregado" && status !== "delivered";
      const isDebt = o.deuda === true || o.paymentStatus === "pendiente" || o.paymentMethod === "fiado";
      return isActive && isDebt;
    })
    .reduce((sum, o) => sum + (o.total ?? 0), 0);
}

function computeAccountsPayable(payables: Payable[]): number {
  return payables
    .filter(p => p.status === "pendiente" || p.status === "parcial")
    .reduce((sum, p) => sum + (p.amount - p.paidAmount), 0);
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CashFlowProjection() {
  const [projData, setProjData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Para detalles de cuentas por pagar proximas
  const [upcomingPayables, setUpcomingPayables] = useState<Payable[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cashRes, payablesRes, ordersRes] = await Promise.all([
        fetch("/api/cash-registers").then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/payables").then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/orders?deuda=true&limit=200").then(r => r.ok ? r.json() : []).catch(() => []),
      ]);

      const registers: CashRegister[] = Array.isArray(cashRes) ? cashRes : [];
      const payables: Payable[] = Array.isArray(payablesRes) ? payablesRes : [];
      const orders: Order[] = Array.isArray(ordersRes)
        ? ordersRes
        : (ordersRes?.data ?? ordersRes?.orders ?? []);

      const cashBalance = computeCashBalance(registers);
      const accountsReceivable = computeAccountsReceivable(orders);
      const accountsPayable = computeAccountsPayable(payables);

      // Proyeccion a 15 dias:
      // Efectivo disponible + cuentas por cobrar (lo que nos deben) - cuentas por pagar (lo que debemos)
      const projection15d = cashBalance + accountsReceivable - accountsPayable;
      const isNegative = projection15d < 0;
      const deficit = isNegative ? Math.abs(projection15d) : 0;

      // Payables con vencimiento en los proximos 15 dias
      const in15Days = new Date();
      in15Days.setDate(in15Days.getDate() + 15);
      const upcoming = payables
        .filter(p => {
          if (p.status !== "pendiente" && p.status !== "parcial") return false;
          if (!p.dueDate) return true;
          return new Date(p.dueDate) <= in15Days;
        })
        .sort((a, b) => {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        })
        .slice(0, 4);

      setUpcomingPayables(upcoming);
      setProjData({ cashBalance, accountsReceivable, accountsPayable, projection15d, isNegative, deficit });
    } catch {
      setError("No se pudo cargar el flujo de caja.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]  overflow-hidden">
      {/* Header */}
      <div className="bg-primary px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-white" />
          <span className="text-white font-semibold text-sm">Flujo de Caja Proyectado</span>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Subtitulo */}
      <div className="px-5 pt-3">
        <p className="text-xs text-[var(--text-tertiary)]">Proyeccion a 15 dias</p>
      </div>

      {/* Body */}
      <div className="p-5">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)] text-center py-6">{error}</p>
        ) : projData ? (
          <div className="space-y-6">
            {/* Alerta si proyeccion es negativa */}
            {projData.isNegative && (
              <div className="flex items-start gap-2 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 border border-[var(--data-error)] dark:border-[var(--data-error)] px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-[var(--data-error)] dark:text-[var(--data-error)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[var(--data-error)] dark:text-[var(--data-error)]">
                    Flujo negativo en 15 dias
                  </p>
                  <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)] mt-0.5">
                    Necesitas cubrir un deficit de {fmt(projData.deficit)}
                  </p>
                </div>
              </div>
            )}

            {/* Items del flujo */}
            <div className="space-y-2">
              {/* Efectivo actual */}
              <div className="flex items-center justify-between py-2 border-b border-[var(--rule-base)]">
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">Efectivo en caja</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Saldo actual disponible</p>
                </div>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {fmt(projData.cashBalance)}
                </span>
              </div>

              {/* Cuentas por cobrar */}
              <div className="flex items-center justify-between py-2 border-b border-[var(--rule-base)]">
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    <span className="text-[var(--data-success)] dark:text-[var(--data-success)] mr-1">+</span>
                    Cuentas por cobrar
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Fiados y pedidos pendientes de cobro</p>
                </div>
                <span className="text-sm font-semibold text-[var(--data-success)] dark:text-[var(--data-success)]">
                  + {fmt(projData.accountsReceivable)}
                </span>
              </div>

              {/* Cuentas por pagar */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    <span className="text-[var(--data-error)] mr-1">-</span>
                    Cuentas por pagar
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Proveedores pendientes de pago</p>
                </div>
                <span className="text-sm font-semibold text-[var(--data-error)] dark:text-[var(--data-error)]">
                  - {fmt(projData.accountsPayable)}
                </span>
              </div>
            </div>

            {/* Resultado proyeccion */}
            <div
              className={cn(
                "flex items-center justify-between rounded-lg px-4 py-3 border",
                projData.isNegative
                  ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 border-[var(--data-error)] dark:border-[var(--data-error)]"
                  : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30"
              )}
            >
              <div className="flex items-center gap-2">
                {projData.isNegative
                  ? <AlertTriangle className="h-4 w-4 text-[var(--data-error)] dark:text-[var(--data-error)]" />
                  : <CheckCircle className="h-4 w-4 text-[var(--data-success)] dark:text-[var(--data-success)]" />
                }
                <div>
                  <p className={cn(
                    "text-xs font-medium",
                    projData.isNegative
                      ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
                      : "text-[var(--data-success)] dark:text-[var(--data-success)]"
                  )}>
                    {projData.isNegative ? "Necesitas" : "Tendras disponible"}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">en 15 dias</p>
                </div>
              </div>
              <span className={cn(
                "text-lg font-bold",
                projData.isNegative
                  ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
                  : "text-[var(--data-success)] dark:text-[var(--data-success)]"
              )}>
                {projData.isNegative ? "- " : ""}{fmt(projData.projection15d)}
              </span>
            </div>

            {/* Proximos pagos a proveedores */}
            {upcomingPayables.length > 0 && (
              <div>
                <p className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] mb-2">
                  Proximos vencimientos (15 dias)
                </p>
                <ul className="space-y-1.5">
                  {upcomingPayables.map(p => {
                    const pending = p.amount - p.paidAmount;
                    const dueDateLabel = p.dueDate
                      ? new Date(p.dueDate).toLocaleDateString("es-PE", { day: "numeric", month: "short" })
                      : "Sin fecha";
                    return (
                      <li key={p.id} className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs text-[var(--text-secondary)] truncate">
                            {p.supplierName || "Proveedor"}
                          </p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Vence: {dueDateLabel}</p>
                        </div>
                        <span className="text-xs font-medium text-[var(--data-error)] dark:text-[var(--data-error)] ml-2 flex-shrink-0">
                          {fmt(pending)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
