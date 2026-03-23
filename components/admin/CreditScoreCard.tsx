"use client";
 

import { useState, useEffect, useCallback } from "react";
import { Loader2, ShieldAlert, ShieldCheck, AlertTriangle, TrendingUp, Clock, CreditCard, User } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Order {
  id: string;
  createdAt: string;
  total: number;
  payment?: string;
  status?: string;
  paidAt?: string;
  dueDate?: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  creditLimit?: number;
  pendingBalance?: number;
  createdAt?: string;
}

interface ScoreBreakdown {
  paysOnTime: number;        // +30
  seniority: number;         // +20
  avgTicket: number;         // +20
  unpaidOverdue: number;     // -30 each
  latePaidFiados: number;    // -20 each
}

interface CreditResult {
  score: number;
  color: "green" | "yellow" | "red";
  label: string;
  recommendation: string;
  breakdown: ScoreBreakdown;
  totalPending: number;
  maxCredit: number;
}

interface CreditScoreCardProps {
  customerPhone: string;
  className?: string;
}

// ── Score calculation ─────────────────────────────────────────────────────────

function calcScore(customer: Customer, orders: Order[]): CreditResult {
  const now = new Date();
  let score = 50; // base

  const breakdown: ScoreBreakdown = {
    paysOnTime: 0,
    seniority: 0,
    avgTicket: 0,
    unpaidOverdue: 0,
    latePaidFiados: 0,
  };

  // Seniority (>6 months)
  if (customer.createdAt) {
    const months = (now.getTime() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (months >= 6) {
      score += 20;
      breakdown.seniority = 20;
    }
  }

  const paidOrders = orders.filter((o) => o.payment === "fiado" || o.payment === "credito");
  const fiadoOrders = paidOrders;

  // Average ticket
  if (orders.length > 0) {
    const avg = orders.reduce((s, o) => s + (o.total ?? 0), 0) / orders.length;
    if (avg >= 30) {
      score += 20;
      breakdown.avgTicket = 20;
    }
  }

  // Unpaid overdue fiados
  const unpaidOverdue = fiadoOrders.filter((o) => {
    const isUnpaid = !o.paidAt && o.status !== "pagado";
    const dueDate = o.dueDate ? new Date(o.dueDate) : null;
    const overdue = dueDate ? dueDate < now : false;
    const oldEnough = (now.getTime() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24) > 30;
    return isUnpaid && (overdue || oldEnough);
  });
  const unpaidPenalty = Math.min(unpaidOverdue.length * 30, 60);
  score -= unpaidPenalty;
  breakdown.unpaidOverdue = -unpaidPenalty;

  // Late paid fiados
  const latePaid = fiadoOrders.filter((o) => {
    if (!o.paidAt || !o.dueDate) return false;
    return new Date(o.paidAt) > new Date(o.dueDate);
  });
  const latePenalty = Math.min(latePaid.length * 20, 40);
  score -= latePenalty;
  breakdown.latePaidFiados = -latePenalty;

  // On-time payers
  const onTimePaid = fiadoOrders.filter((o) => {
    if (!o.paidAt) return false;
    const onTime = !o.dueDate || new Date(o.paidAt) <= new Date(o.dueDate);
    return onTime;
  });
  if (onTimePaid.length > 0 && onTimePaid.length >= fiadoOrders.length * 0.7) {
    score += 30;
    breakdown.paysOnTime = 30;
  }

  score = Math.max(0, Math.min(100, score));

  // Pending balance
  const totalPending = customer.pendingBalance ?? 0;

  // Credit recommendation
  const color: "green" | "yellow" | "red" = score >= 70 ? "green" : score >= 40 ? "yellow" : "red";
  const maxCredit = score >= 70 ? 200 : score >= 40 ? 50 : 0;

  const label = score >= 70 ? "Confiable" : score >= 40 ? "Precaucion" : "No recomendado";
  const recommendation =
    score >= 70
      ? `Puede fiar hasta S/ ${maxCredit.toFixed(2)}`
      : score >= 40
      ? `Limite bajo — maximo S/ ${maxCredit.toFixed(2)}`
      : totalPending > 0
      ? `Tiene S/ ${totalPending.toFixed(2)} pendiente sin pagar`
      : "Historial insuficiente o deudas antiguas";

  return { score, color, label, recommendation, breakdown, totalPending, maxCredit };
}

// ── Gauge SVG ─────────────────────────────────────────────────────────────────

function GaugeCircle({ score, color }: { score: number; color: "green" | "yellow" | "red" }) {
  const r = 52;
  const cx = 64;
  const cy = 64;
  const circumference = Math.PI * r; // half circle
  const progress = (score / 100) * circumference;

  const strokeColor = color === "green" ? "#10b981" : color === "yellow" ? "#f59e0b" : "#ef4444";
  const textColor = color === "green" ? "text-emerald-500" : color === "yellow" ? "text-amber-500" : "text-red-500";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="128" height="72" viewBox="0 0 128 72" fill="none" className="overflow-visible">
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          stroke="#e5e7eb"
          className="dark:[stroke:#374151]"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        {/* Progress */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          stroke={strokeColor}
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className={cn("text-4xl font-black -mt-4", textColor)}>{score}</div>
      <div className="text-xs text-gray-400 dark:text-muted -mt-1">de 100</div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreditScoreCard({ customerPhone, className }: CreditScoreCardProps) {
  const [result, setResult] = useState<CreditResult | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (phone: string) => {
    if (!phone) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const [custRes, ordersRes] = await Promise.all([
        fetch(`/api/customers/${encodeURIComponent(phone)}`),
        fetch(`/api/customers/${encodeURIComponent(phone)}/orders`),
      ]);

      if (!custRes.ok) throw new Error("Cliente no encontrado");

      const custData: Customer = await custRes.json();
      const ordersData = ordersRes.ok ? await ordersRes.json() : [];
      const orders: Order[] = Array.isArray(ordersData) ? ordersData : (ordersData.orders ?? []);

      setCustomer(custData);
      setResult(calcScore(custData, orders));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (customerPhone) load(customerPhone);
  }, [customerPhone, load]);

  const colorClasses = {
    green: {
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      icon: ShieldCheck,
      iconColor: "text-emerald-500",
      bar: "bg-emerald-500",
      border: "border-emerald-200 dark:border-emerald-800",
    },
    yellow: {
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      icon: AlertTriangle,
      iconColor: "text-amber-500",
      bar: "bg-amber-400",
      border: "border-amber-200 dark:border-amber-800",
    },
    red: {
      badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      icon: ShieldAlert,
      iconColor: "text-red-500",
      bar: "bg-red-500",
      border: "border-red-200 dark:border-red-800",
    },
  };

  return (
    <div className={cn("rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-card-border bg-gray-50 dark:bg-gray-900/50">
        <CreditCard className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-gray-900 dark:text-foreground">Score de confianza para fiado</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
            <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* No phone */}
        {!loading && !error && !customerPhone && (
          <div className="flex flex-col items-center gap-2 py-6 text-gray-300 dark:text-gray-600">
            <User className="h-8 w-8" />
            <p className="text-sm">Ingresa un telefono para calcular el score</p>
          </div>
        )}

        {/* Result */}
        {!loading && result && customer && (
          <>
            {/* Customer name */}
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-foreground">{customer.name}</span>
            </div>

            {/* Gauge */}
            <div className="flex justify-center">
              <GaugeCircle score={result.score} color={result.color} />
            </div>

            {/* Label badge + recommendation */}
            <div className={cn("flex items-start gap-2 px-3 py-3 rounded-xl border", colorClasses[result.color].border, `${result.color === "green" ? "bg-emerald-50 dark:bg-emerald-950/20" : result.color === "yellow" ? "bg-amber-50 dark:bg-amber-950/20" : "bg-red-50 dark:bg-red-950/20"}`)}>
              {(() => {
                const Icon = colorClasses[result.color].icon;
                return <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", colorClasses[result.color].iconColor)} />;
              })()}
              <div>
                <span className={cn("text-xs font-bold", colorClasses[result.color].badge.split(" ").filter(c => c.startsWith("text-")).join(" "))}>
                  {result.label}
                </span>
                <p className="text-sm text-gray-700 dark:text-foreground mt-0.5">{result.recommendation}</p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase tracking-wide">Detalle del score</p>
              {[
                { label: "Paga puntualmente", value: result.breakdown.paysOnTime, icon: Clock },
                { label: "Antiguedad (>6 meses)", value: result.breakdown.seniority, icon: TrendingUp },
                { label: "Ticket promedio (>S/30)", value: result.breakdown.avgTicket, icon: CreditCard },
                { label: "Fiados vencidos sin pagar", value: result.breakdown.unpaidOverdue, icon: ShieldAlert },
                { label: "Fiados pagados tarde", value: result.breakdown.latePaidFiados, icon: AlertTriangle },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", value >= 0 ? "text-emerald-500" : "text-red-400")} />
                  <span className="text-xs text-gray-600 dark:text-muted flex-1">{label}</span>
                  <span className={cn("text-xs font-bold", value > 0 ? "text-emerald-600 dark:text-emerald-400" : value < 0 ? "text-red-500" : "text-gray-400")}>
                    {value > 0 ? `+${value}` : value === 0 ? "—" : value}
                  </span>
                </div>
              ))}
            </div>

            {/* Pending balance */}
            {result.totalPending > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">Deuda pendiente actual</span>
                <span className="text-sm font-bold text-red-600 dark:text-red-400">
                  S/ {result.totalPending.toFixed(2)}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
