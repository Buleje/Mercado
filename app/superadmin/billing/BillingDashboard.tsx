"use client";

/**
 * BillingDashboard — Dashboard de billing platform-level.
 *
 * Consume GET /api/superadmin/billing-summary. Renderiza:
 *  - KPIs: MRR, ARR, paid, trial, canceled
 *  - Breakdown por plan (bars)
 *  - Trials activos (orden por días restantes ascendente)
 *  - Próximos cobros 7 días
 *  - Tabla de tenants con filtros (status, plan, search) + CSV export
 *  - Distribución por industria
 *
 * Atajos: `/` busca · `R` recarga · `Esc` limpia filtros
 */

import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  RefreshCw,
  Download,
  Search,
  AlertTriangle,
  Wallet,
  Users,
  TrendingUp,
  Clock,
  XCircle,
  ExternalLink,
  Loader2,
  CheckCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  DunningPanel,
  type MrrMovement,
  type Dunning,
} from "./DunningPanel";
import { BillingExecutiveSummary } from "./BillingExecutiveSummary";

// ── Types ──────────────────────────────────────────────────────────────────

interface TenantBillingRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  planLabel: string;
  industry: string;
  active: boolean;
  status: "paid" | "trial" | "canceled" | "free";
  monthlyPEN: number;
  source: "stripe" | "mp" | "none";
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  nextBillAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

interface BillingSummary {
  generatedAt: string;
  mrrPEN: number;
  arrPEN: number;
  mrrMovement: MrrMovement;
  dunning: Dunning;
  counts: {
    total: number;
    paid: number;
    trial: number;
    canceled: number;
    free: number;
    activeNonFree: number;
  };
  byPlan: Array<{
    plan: string;
    label: string;
    pricePEN: number;
    activeCount: number;
    mrrPEN: number;
  }>;
  byIndustry: Array<{ industry: string; count: number }>;
  upcoming7d: TenantBillingRow[];
  trials: TenantBillingRow[];
  tenants: TenantBillingRow[];
}

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtPEN = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPENDec = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) {
    const past = Math.abs(ms);
    const days = Math.floor(past / (1000 * 60 * 60 * 24));
    return days < 1 ? "vencido hoy" : `vencido hace ${days}d`;
  }
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days}d`;
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV(rows: TenantBillingRow[]) {
  const headers = [
    "Slug",
    "Nombre",
    "Plan",
    "Status",
    "MRR_PEN",
    "Source",
    "Industry",
    "TrialEndsAt",
    "TrialDaysLeft",
    "NextBillAt",
    "CancelAtPeriodEnd",
    "CreatedAt",
  ];
  const data = rows.map((r) => [
    r.slug,
    r.name,
    r.planLabel,
    r.status,
    r.monthlyPEN,
    r.source,
    r.industry,
    r.trialEndsAt ?? "",
    r.trialDaysLeft ?? "",
    r.nextBillAt ?? "",
    r.cancelAtPeriodEnd ? "yes" : "no",
    r.createdAt,
  ]);
  const csv =
    "﻿" +
    [headers, ...data].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `billing_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Status / source styles ─────────────────────────────────────────────────

const STATUS_META: Record<
  TenantBillingRow["status"],
  { label: string; pill: string; dot: string }
> = {
  paid: {
    label: "Pago",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  trial: {
    label: "Trial",
    pill: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
    dot: "bg-sky-500",
  },
  canceled: {
    label: "Cancelado",
    pill: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
    dot: "bg-rose-500",
  },
  free: {
    label: "Free",
    pill: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
    dot: "bg-slate-400",
  },
};

const SOURCE_LABEL: Record<TenantBillingRow["source"], string> = {
  stripe: "Stripe",
  mp: "Mercado Pago",
  none: "—",
};

// ── Stat Card ──────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  sub,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
}) {
  const ring = {
    default: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    warning: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    info: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  }[tone];

  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        {Icon && (
          <span
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl",
              ring,
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-3 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-[var(--surface-sunken)] h-28" />
        ))}
      </div>
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-40" />
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-64" />
    </div>
  );
}

// ── Plan bar (canónico) ────────────────────────────────────────────────────

function PlanBar({
  label,
  value,
  max,
  amount,
  pricePEN,
  onClick,
  active,
}: {
  label: string;
  value: number;
  max: number;
  amount: number;
  pricePEN: number;
  /** Click → filtra la tabla por este plan (función nueva). */
  onClick?: () => void;
  active?: boolean;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="font-extrabold text-sm text-[var(--text-primary)]">
          {label}
          <span className="ml-1.5 text-xs font-bold text-[var(--text-tertiary)]">
            {fmtPEN(pricePEN)}/mes
          </span>
        </span>
        <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
          {value}{" "}
          <span className="text-xs font-bold text-[var(--text-tertiary)]">
            · {fmtPEN(amount)}
          </span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-500"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        title={active ? "Quitar filtro" : `Filtrar tabla por ${label}`}
        className={cn(
          "w-full text-left rounded-lg -mx-1.5 px-1.5 py-1 transition-colors",
          active ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]/30" : "hover:bg-[var(--surface-sunken)]/60",
        )}
      >
        {inner}
      </button>
    );
  }
  return <div>{inner}</div>;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function BillingDashboard() {
  const [data, setData] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | TenantBillingRow["status"]
  >("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  // Funciones nuevas (Brandon 2026-06-19): filtro por fuente de pago, toggle
  // "en riesgo" (cancela al fin del período) y ordenamiento por columna.
  const [sourceFilter, setSourceFilter] = useState<"all" | "stripe" | "mp" | "none">("all");
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [sort, setSort] = useState<{ key: "name" | "mrr" | "next"; dir: "asc" | "desc" }>({ key: "mrr", dir: "desc" });

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  const searchRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback(
    (text: string, tone: ToastTone = "info") => {
      const id = toastIdRef.current++;
      setToasts((prev) => [...prev, { id, text, tone }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        3000,
      );
    },
    [],
  );

  // ── Debounce ────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // ── Fetch ───────────────────────────────────────────────────────────────
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      setError(null);
      try {
        const res = await fetch("/api/superadmin/billing-summary", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          setError(`HTTP ${res.status}`);
          return;
        }
        const json = (await res.json()) as BillingSummary;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de red");
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // ── Auto refresh ────────────────────────────────────────────────────────
  useVisiblePolling(() => void load(true), 60_000, autoRefresh);

  // ── Keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || tag === "select";

      if (e.key === "Escape" && !inField) {
        setSearchRaw("");
        setStatusFilter("all");
        setPlanFilter("all");
        setSourceFilter("all");
        setAtRiskOnly(false);
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void load();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [load]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const planOptions = useMemo(
    () =>
      data
        ? Array.from(
            new Map(
              data.tenants.map((t) => [t.plan, t.planLabel]),
            ).entries(),
          )
        : [],
    [data],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.tenants.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (planFilter !== "all" && t.plan !== planFilter) return false;
      if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
      if (atRiskOnly && !t.cancelAtPeriodEnd) return false;
      if (!q) return true;
      return (
        t.slug.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.industry.toLowerCase().includes(q) ||
        t.planLabel.toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter, planFilter, sourceFilter, atRiskOnly]);

  // Ordenamiento (función nueva): por nombre / MRR / próximo cobro. Los nulos
  // de "próximo" van al final siempre.
  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name) * dir;
      if (sort.key === "mrr") return (a.monthlyPEN - b.monthlyPEN) * dir;
      const av = a.nextBillAt ? new Date(a.nextBillAt).getTime() : Number.POSITIVE_INFINITY;
      const bv = b.nextBillAt ? new Date(b.nextBillAt).getTime() : Number.POSITIVE_INFINITY;
      if (av === bv) return 0;
      return av < bv ? -dir : dir;
    });
  }, [filtered, sort]);

  const toggleSort = useCallback((key: "name" | "mrr" | "next") => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }, []);

  const atRiskCount = useMemo(() => (data ? data.tenants.filter((t) => t.cancelAtPeriodEnd).length : 0), [data]);

  // ── Render error ────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div
        role="alert"
        className="rounded-2xl border-2 border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30 p-5"
      >
        <p className="flex items-center gap-2 text-base font-bold text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-5 w-5" aria-hidden />
          No se pudo cargar el resumen de billing
        </p>
        <p className="mt-1 text-sm text-rose-600 dark:text-rose-300/80">
          {error}
        </p>
        <button
          onClick={() => load()}
          className="mt-3 inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
      </div>
    );
  }

  if (loading && !data) return <Skeleton />;
  if (!data) return null;

  const maxPlanCount = Math.max(1, ...data.byPlan.map((p) => p.activeCount));

  return (
    <div className="space-y-5">
      <Toasts toasts={toasts} />

      {/* ── Resumen ejecutivo (veredicto + MRR en riesgo) ─── */}
      <BillingExecutiveSummary
        mrrPEN={data.mrrPEN}
        counts={data.counts}
        dunning={data.dunning}
        movement={data.mrrMovement}
      />

      {/* ── Action bar ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void load()}
          disabled={refreshing}
          title="Recargar (R)"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", refreshing && "animate-spin")}
            aria-hidden
          />
          Recargar
        </button>
        <label className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer hover:border-[var(--accent)]/40">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Auto 60s
        </label>
        <button
          onClick={() => exportCSV(filtered)}
          disabled={filtered.length === 0}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50 transition"
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV ({filtered.length})
        </button>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          Generado:{" "}
          {new Date(data.generatedAt).toLocaleTimeString("es-PE", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* ── KPIs principales ────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi
          label="MRR consolidado"
          value={fmtPEN(data.mrrPEN)}
          sub={`ARR ${fmtPEN(data.arrPEN)}`}
          tone="success"
          icon={Wallet}
        />
        <Kpi
          label="Tenants pagados"
          value={String(data.counts.paid)}
          sub={`${data.counts.total} totales`}
          tone="success"
          icon={Users}
        />
        <Kpi
          label="Trials activos"
          value={String(data.counts.trial)}
          sub="Conversión esperada"
          tone="info"
          icon={Clock}
        />
        <Kpi
          label="Cancelados"
          value={String(data.counts.canceled)}
          sub={`Free: ${data.counts.free}`}
          tone={data.counts.canceled > 0 ? "danger" : "default"}
          icon={XCircle}
        />
      </div>

      {/* ── Movimiento de MRR + Cobranza/riesgo (dunning) ─ */}
      <DunningPanel movement={data.mrrMovement} dunning={data.dunning} />

      {/* ── 2-col: Plan breakdown + Próximos cobros ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              MRR por plan
            </h3>
            <span className="text-xs font-bold text-[var(--text-tertiary)]">
              {data.byPlan.length} planes activos
            </span>
          </div>
          {data.byPlan.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] py-6 text-center">
              Sin suscripciones pagas todavía
            </p>
          ) : (
            <div className="space-y-3.5">
              {data.byPlan.map((p) => (
                <PlanBar
                  key={p.plan}
                  label={p.label}
                  value={p.activeCount}
                  max={maxPlanCount}
                  amount={p.mrrPEN}
                  pricePEN={p.pricePEN}
                  active={planFilter === p.plan}
                  onClick={() => setPlanFilter(planFilter === p.plan ? "all" : p.plan)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
          <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Top industrias
          </h3>
          {data.byIndustry.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Sin datos</p>
          ) : (
            <ul className="space-y-1">
              {data.byIndustry.slice(0, 6).map((it) => (
                <li key={it.industry}>
                  <button
                    type="button"
                    onClick={() => setSearchRaw(it.industry)}
                    title={`Filtrar tabla por ${it.industry.replace(/_/g, " ")}`}
                    className="flex w-full items-center justify-between gap-2 rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-[var(--surface-sunken)]/60 transition-colors"
                  >
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate capitalize text-left">
                      {it.industry.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm font-extrabold tabular-nums text-[var(--text-tertiary)]">
                      {it.count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Trials + Próximos vencimientos ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Trials activos"
          empty="Sin trials"
          icon={Clock}
          rows={data.trials.slice(0, 8)}
          renderMeta={(r) => (
            <span
              className={cn(
                "text-xs font-extrabold",
                (r.trialDaysLeft ?? 99) <= 3
                  ? "text-rose-700 dark:text-rose-300"
                  : (r.trialDaysLeft ?? 99) <= 7
                    ? "text-teal-700 dark:text-teal-300"
                    : "text-emerald-700 dark:text-emerald-300",
              )}
            >
              {r.trialDaysLeft != null ? `${r.trialDaysLeft}d` : "—"}
            </span>
          )}
        />
        <Panel
          title="Próximos cobros · 7 días"
          empty="Ningún cobro próximo"
          icon={TrendingUp}
          rows={data.upcoming7d.slice(0, 8)}
          renderMeta={(r) => (
            <span className="text-xs font-extrabold tabular-nums text-[var(--text-primary)]">
              {fmtPEN(r.monthlyPEN)}
              <span className="ml-1 font-bold text-[var(--text-tertiary)]">
                · {fmtRelative(r.nextBillAt)}
              </span>
            </span>
          )}
        />
      </div>

      {/* ── Filtros tabla ──────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3 space-y-2.5">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Buscar tenant, slug, industria, plan…"
            aria-label="Buscar tenants"
            className="w-full h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] pl-9 pr-3 text-base sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as "all" | TenantBillingRow["status"],
              )
            }
            aria-label="Filtrar por estado"
            className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="all">Todos los estados</option>
            <option value="paid">Pagados</option>
            <option value="trial">Trials</option>
            <option value="canceled">Cancelados</option>
            <option value="free">Free</option>
          </select>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            aria-label="Filtrar por plan"
            className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="all">Todos los planes</option>
            {planOptions.map(([plan, label]) => (
              <option key={plan} value={plan}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as "all" | "stripe" | "mp" | "none")}
            aria-label="Filtrar por fuente de pago"
            className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="all">Toda fuente</option>
            <option value="stripe">Stripe</option>
            <option value="mp">Mercado Pago</option>
            <option value="none">Sin fuente</option>
          </select>
        </div>
        {atRiskCount > 0 && (
          <button
            type="button"
            onClick={() => setAtRiskOnly((v) => !v)}
            aria-pressed={atRiskOnly}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors",
              atRiskOnly
                ? "bg-rose-600 text-white"
                : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            En riesgo (cancela) <span className="tabular-nums opacity-80">{atRiskCount}</span>
          </button>
        )}
      </div>

      {/* ── Tabla / cards ──────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-12 text-center">
          <p className="text-sm font-bold text-[var(--text-primary)]">
            Ningún tenant coincide con los filtros
          </p>
          <button
            onClick={() => {
              setSearchRaw("");
              setStatusFilter("all");
              setPlanFilter("all");
              setSourceFilter("all");
              setAtRiskOnly(false);
            }}
            className="mt-3 h-10 px-4 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="md:hidden space-y-2.5">
            {sorted.map((t) => (
              <TenantCard key={t.id} t={t} />
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-left text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                  <th className="px-4 py-3">
                    <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-[var(--text-primary)] transition-colors">
                      Tienda <span className="text-[10px]" aria-hidden>{sort.key === "name" ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 font-extrabold">Plan</th>
                  <th className="px-3 py-3 font-extrabold text-center">
                    Status
                  </th>
                  <th className="px-3 py-3 text-right">
                    <button type="button" onClick={() => toggleSort("mrr")} className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-[var(--text-primary)] transition-colors">
                      MRR (PEN) <span className="text-[10px]" aria-hidden>{sort.key === "mrr" ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 hidden lg:table-cell">
                    <button type="button" onClick={() => toggleSort("next")} className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-[var(--text-primary)] transition-colors">
                      Próximo <span className="text-[10px]" aria-hidden>{sort.key === "next" ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
                    </button>
                  </th>
                  <th className="px-3 py-3 font-extrabold hidden xl:table-cell">
                    Source
                  </th>
                  <th className="pr-4 pl-3 py-3 font-extrabold text-right">
                    Tenant
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {sorted.map((t) => {
                  const s = STATUS_META[t.status];
                  return (
                    <tr
                      key={t.id}
                      className="transition hover:bg-[var(--surface-sunken)]/50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold text-[var(--text-primary)] truncate">
                          {t.name}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)] font-mono truncate">
                          {t.slug}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-sm font-bold text-[var(--text-primary)]">
                        {t.planLabel}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
                            s.pill,
                          )}
                        >
                          <span
                            className={cn("h-1.5 w-1.5 rounded-full", s.dot)}
                          />
                          {s.label}
                        </span>
                        {t.cancelAtPeriodEnd && (
                          <p className="text-[length:var(--ts-2xs)] text-rose-700 dark:text-rose-300 mt-0.5">
                            cancela
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-bold tabular-nums text-[var(--text-primary)]">
                        {t.monthlyPEN > 0 ? fmtPENDec(t.monthlyPEN) : "—"}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell text-xs text-[var(--text-secondary)]">
                        {t.status === "trial" && t.trialDaysLeft != null
                          ? `Trial · ${t.trialDaysLeft}d`
                          : fmtRelative(t.nextBillAt)}
                        {t.nextBillAt && (
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                            {fmtDate(t.nextBillAt)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden xl:table-cell text-xs text-[var(--text-secondary)]">
                        {SOURCE_LABEL[t.source]}
                      </td>
                      <td className="pr-4 pl-3 py-3 text-right">
                        <Link
                          href={`/superadmin/tenants?slug=${t.slug}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline"
                        >
                          {t.slug}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-right">
        Mostrando {filtered.length} de {data.counts.total} tenants ·{" "}
        <Link
          href="/superadmin/tenants"
          className="text-[var(--accent)] hover:underline font-bold"
        >
          Ver módulo Tenants
        </Link>
      </p>
    </div>
  );
}

// ── Panel reusable (trials / upcoming) ─────────────────────────────────────

function Panel({
  title,
  empty,
  rows,
  icon: Icon,
  renderMeta,
}: {
  title: string;
  empty: string;
  rows: TenantBillingRow[];
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  renderMeta: (r: TenantBillingRow) => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
        <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {title}
        </h3>
        <span className="ml-auto text-xs font-bold text-[var(--text-tertiary)]">
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-2">
          <CheckCircle className="h-4 w-4" />
          {empty}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)]">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <Link
                  href={`/superadmin/tenants?slug=${r.slug}`}
                  className="font-bold text-sm text-[var(--text-primary)] hover:text-[var(--accent)] truncate block"
                >
                  {r.name}
                </Link>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                  {r.planLabel} · {r.slug}
                </p>
              </div>
              <div className="shrink-0 text-right">{renderMeta(r)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Tenant card (mobile) ────────────────────────────────────────────────────

function TenantCard({ t }: { t: TenantBillingRow }) {
  const s = STATUS_META[t.status];
  return (
    <li className="rounded-2xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-base text-[var(--text-primary)] truncate">
            {t.name}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] font-mono truncate">
            {t.slug}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0",
            s.pill,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
          {s.label}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 text-sm">
        <div>
          <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Plan
          </dt>
          <dd className="font-bold text-[var(--text-primary)]">
            {t.planLabel}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            MRR
          </dt>
          <dd className="font-extrabold text-[var(--text-primary)] tabular-nums">
            {t.monthlyPEN > 0 ? fmtPENDec(t.monthlyPEN) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Próximo
          </dt>
          <dd className="text-[var(--text-secondary)] truncate">
            {t.status === "trial" && t.trialDaysLeft != null
              ? `Trial · ${t.trialDaysLeft}d`
              : fmtRelative(t.nextBillAt)}
          </dd>
        </div>
        <div>
          <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Source
          </dt>
          <dd className="text-[var(--text-secondary)]">
            {SOURCE_LABEL[t.source]}
          </dd>
        </div>
      </dl>
      <div className="mt-3 pt-3 border-t border-[var(--rule-soft)]">
        <Link
          href={`/superadmin/tenants?slug=${t.slug}`}
          className="inline-flex items-center gap-1.5 h-11 px-3 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
        >
          Ver tenant
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </li>
  );
}

// ── Toasts ─────────────────────────────────────────────────────────────────

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur",
            t.tone === "success" && "bg-emerald-600 text-white",
            t.tone === "error" && "bg-rose-600 text-white",
            t.tone === "info" && "bg-slate-800 text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
