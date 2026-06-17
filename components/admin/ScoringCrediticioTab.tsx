"use client";
import { PageTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Shield, TrendingUp, AlertTriangle, CheckCircle, XCircle, Search, Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Customer {
  id: number | string;
  name: string;
  phone?: string;
  createdAt: string;
  totalPurchases?: number;
}

interface Fiado {
  id: string;
  customerId: number | string;
  customerName: string;
  amount: number;
  paidAmount?: number;
  dueDate?: string;
  status: string;
  createdAt: string;
}

type ScoreLevel = "EXCELENTE" | "BUENO" | "REGULAR" | "RIESGOSO" | "BLOQUEADO";

interface CustomerScore {
  customerId: number | string;
  customerName: string;
  phone?: string;
  score: number;
  level: ScoreLevel;
  fiadoActual: number;
  limiteRecomendado: number;
  fiadosTotal: number;
  fiadosOverdue: number;
  payRate: number;
}

// ── Scoring function (exactly as specified) ────────────────────────────────────

function calculateCreditScore(customer: {
  totalPurchases: number;
  fiadosPaid: number;
  fiadosTotal: number;
  fiadosOverdue: number;
  firstPurchaseDate: string;
}): { score: number; level: ScoreLevel } {
  let score = 50;

  // Historial de pago (40 pts max)
  if (customer.fiadosTotal > 0) {
    const payRate = customer.fiadosPaid / customer.fiadosTotal;
    score += Math.round(payRate * 40);
  } else {
    score += 20; // Sin historial = neutro
  }

  // Compras totales (20 pts max)
  score += Math.min(20, Math.round(customer.totalPurchases / 500));

  // Antigüedad (10 pts max)
  const months = Math.floor(
    (Date.now() - new Date(customer.firstPurchaseDate).getTime()) / (30 * 24 * 60 * 60 * 1000),
  );
  score += Math.min(10, months);

  // Penalización por morosos
  score -= customer.fiadosOverdue * 15;

  score = Math.max(0, Math.min(100, score));

  const level: ScoreLevel =
    score >= 80 ? "EXCELENTE" :
    score >= 60 ? "BUENO" :
    score >= 40 ? "REGULAR" :
    score >= 20 ? "RIESGOSO" :
    "BLOQUEADO";

  return { score, level };
}

function recommendedLimit(score: number): number {
  if (score >= 80) return 500;
  if (score >= 60) return 200;
  if (score >= 40) return 80;
  if (score >= 20) return 20;
  return 0;
}

// ── Config visual ──────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<ScoreLevel, {
  label: string;
  badge: string;
  bar: string;
  icon: React.ElementType;
}> = {
  EXCELENTE: {
    label: "Excelente",
    badge: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    bar: "var(--accent)",
    icon: CheckCircle,
  },
  BUENO: {
    label: "Bueno",
    badge: "bg-teal-100 dark:bg-teal-900/30 text-[var(--accent-dark)] dark:text-teal-400",
    bar: "#38a169",
    icon: TrendingUp,
  },
  REGULAR: {
    label: "Regular",
    badge: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    bar: "#ff6b5b",
    icon: AlertTriangle,
  },
  RIESGOSO: {
    label: "Riesgoso",
    badge: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    bar: "#f0503f",
    icon: AlertTriangle,
  },
  BLOQUEADO: {
    label: "Bloqueado",
    badge: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
    bar: "#e63946",
    icon: XCircle,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700", className)} />;
}

// ── Score bar ──────────────────────────────────────────────────────────────────

function ScoreBar({ score, level }: { score: number; level: ScoreLevel }) {
  const color = LEVEL_CONFIG[level].bar;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-[var(--dur-slow)]"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono font-bold text-[var(--text-secondary)] w-8 text-right shrink-0">
        {score}
      </span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ScoringCrediticioTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterLevel, setFilterLevel] = useState<ScoreLevel | "TODOS">("TODOS");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [custRes, fiadoRes] = await Promise.all([
        fetch("/api/customers"),
        fetch("/api/fiados"),
      ]);
      if (!custRes.ok) throw new Error(`Customers HTTP ${custRes.status}`);
      if (!fiadoRes.ok) throw new Error(`Fiados HTTP ${fiadoRes.status}`);

      const [custData, fiadoData] = await Promise.all([custRes.json(), fiadoRes.json()]);

      setCustomers(Array.isArray(custData) ? custData : custData?.items ?? []);
      setFiados(Array.isArray(fiadoData) ? fiadoData : fiadoData?.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Build scored list ─────────────────────────────────────────────────────────

  const scoredCustomers = useMemo((): CustomerScore[] => {
    return customers.map(c => {
      const cFiados = fiados.filter(f => String(f.customerId) === String(c.id));

      const fiadosTotal = cFiados.length;
      const fiadosPaid = cFiados.filter(f => f.status === "pagado").length;
      const fiadosOverdue = cFiados.filter(f => {
        if (f.status === "pagado") return false;
        if (!f.dueDate) return false;
        return new Date(f.dueDate) < new Date();
      }).length;

      const fiadoActual = cFiados
        .filter(f => f.status !== "pagado")
        .reduce((sum, f) => sum + ((f.amount ?? 0) - (f.paidAmount ?? 0)), 0);

      const { score, level } = calculateCreditScore({
        totalPurchases: c.totalPurchases ?? 0,
        fiadosPaid,
        fiadosTotal,
        fiadosOverdue,
        firstPurchaseDate: c.createdAt,
      });

      const payRate = fiadosTotal > 0 ? Math.round((fiadosPaid / fiadosTotal) * 100) : 100;

      return {
        customerId: c.id,
        customerName: c.name,
        phone: c.phone,
        score,
        level,
        fiadoActual,
        limiteRecomendado: recommendedLimit(score),
        fiadosTotal,
        fiadosOverdue,
        payRate,
      };
    });
  }, [customers, fiados]);

  // ── Filtered ──────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return scoredCustomers
      .filter(c => {
        if (filterLevel !== "TODOS" && c.level !== filterLevel) return false;
        if (search && !c.customerName.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }, [scoredCustomers, filterLevel, search]);

  // ── Summary counts ────────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const tally: Record<ScoreLevel | "TODOS", number> = {
      TODOS: scoredCustomers.length,
      EXCELENTE: 0, BUENO: 0, REGULAR: 0, RIESGOSO: 0, BLOQUEADO: 0,
    };
    scoredCustomers.forEach(c => { tally[c.level]++; });
    return tally;
  }, [scoredCustomers]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-primary" style={{ backgroundColor: "var(--accent)" }}>
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <PageTitle className="text-xl font-bold text-[var(--text-primary)]">Scoring Crediticio</PageTitle>
          <p className="text-xs text-[var(--text-tertiary)]">Evaluación de riesgo para créditos y fiados</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] p-4 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Error al cargar datos: {error}</span>
        </div>
      )}

      {/* Filtros de nivel */}
      <div className="flex items-center gap-2 flex-wrap overflow-x-auto pb-1">
        {(["TODOS", "EXCELENTE", "BUENO", "REGULAR", "RIESGOSO", "BLOQUEADO"] as (ScoreLevel | "TODOS")[]).map(lvl => {
          const isActive = filterLevel === lvl;
          const cfg = lvl !== "TODOS" ? LEVEL_CONFIG[lvl] : null;
          return (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={cn(
                "px-3 min-h-[44px] rounded-full text-xs font-medium transition-all",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                isActive
                  ? cfg ? cfg.badge + " ring-1 ring-current" : "bg-primary text-white"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700",
              )}
            >
              {lvl === "TODOS" ? "Todos" : LEVEL_CONFIG[lvl].label}
              <span className="ml-1.5 opacity-70">({counts[lvl]})</span>
            </button>
          );
        })}
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full pl-9 pr-4 h-12 rounded-lg text-sm border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-10 w-10 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">
            {search ? "No hay clientes que coincidan" : "No hay clientes registrados"}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {search ? "Intenta con otro nombre" : "Los clientes aparecerán aquí una vez que realicen compras"}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-x-auto ">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)] bg-gray-50/50 dark:bg-gray-800/30">
                  <th className="text-left px-4 py-3 text-xs text-[var(--text-tertiary)] font-medium">Cliente</th>
                  <th className="text-center px-4 py-3 text-xs text-[var(--text-tertiary)] font-medium">Nivel</th>
                  <th className="px-4 py-3 text-xs text-[var(--text-tertiary)] font-medium">Score</th>
                  <th className="text-right px-4 py-3 text-xs text-[var(--text-tertiary)] font-medium">Fiado actual</th>
                  <th className="text-right px-4 py-3 text-xs text-[var(--text-tertiary)] font-medium">Límite recom.</th>
                  <th className="text-right px-4 py-3 text-xs text-[var(--text-tertiary)] font-medium">Pago a tiempo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => {
                  const cfg = LEVEL_CONFIG[c.level];
                  const LevelIcon = cfg.icon;
                  return (
                    <tr
                      key={c.customerId || `row-${idx}`}
                      className={cn(
                        "border-b border-gray-50 dark:border-[var(--rule-base)] last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors",
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text-primary)] truncate max-w-[160px]">{c.customerName}</p>
                        {c.fiadosOverdue > 0 && (
                          <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{c.fiadosOverdue} fiado{c.fiadosOverdue > 1 ? "s" : ""} vencido{c.fiadosOverdue > 1 ? "s" : ""}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", cfg.badge)}>
                          <LevelIcon className="h-3 w-3" aria-hidden="true" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <ScoreBar score={c.score} level={c.level} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--text-secondary)]">
                        {c.fiadoActual > 0 ? (
                          <span className={c.fiadoActual > c.limiteRecomendado ? "text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold" : ""}>
                            {fmt(c.fiadoActual)}
                          </span>
                        ) : (
                          <span className="text-[var(--text-tertiary)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--text-secondary)]">
                        {c.limiteRecomendado > 0 ? fmt(c.limiteRecomendado) : (
                          <span className="text-[var(--data-error-500)] font-semibold">Sin crédito</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.fiadosTotal > 0 ? (
                          <span className={cn(
                            "font-mono text-xs font-semibold",
                            c.payRate >= 80 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" :
                            c.payRate >= 50 ? "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" :
                            "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
                          )}>
                            {c.payRate}%
                          </span>
                        ) : (
                          <span className="text-[var(--text-tertiary)] text-xs">Sin historial</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map((c, idx) => {
              const cfg = LEVEL_CONFIG[c.level];
              const LevelIcon = cfg.icon;
              return (
                <div
                  key={c.customerId || `card-${idx}`}
                  className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 "
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-primary)] truncate">{c.customerName}</p>
                      {c.fiadosOverdue > 0 && (
                        <p className="text-xs text-[var(--data-error-500)] mt-0.5">{c.fiadosOverdue} fiado(s) vencido(s)</p>
                      )}
                    </div>
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ml-2", cfg.badge)}>
                      <LevelIcon className="h-3 w-3" aria-hidden="true" />
                      {cfg.label}
                    </span>
                  </div>
                  <ScoreBar score={c.score} level={c.level} />
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div>
                      <p className="text-[var(--text-tertiary)]">Fiado actual</p>
                      <p className="font-mono font-semibold text-[var(--text-secondary)] mt-0.5">
                        {c.fiadoActual > 0 ? fmt(c.fiadoActual) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--text-tertiary)]">Límite</p>
                      <p className={cn(
                        "font-mono font-semibold mt-0.5",
                        c.limiteRecomendado > 0 ? "text-[var(--text-secondary)]" : "text-[var(--data-error-500)]",
                      )}>
                        {c.limiteRecomendado > 0 ? fmt(c.limiteRecomendado) : "Sin crédito"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[var(--text-tertiary)]">Pago</p>
                      <p className={cn(
                        "font-mono font-semibold mt-0.5",
                        c.fiadosTotal === 0 ? "text-[var(--text-tertiary)]" :
                        c.payRate >= 80 ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" :
                        c.payRate >= 50 ? "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" :
                        "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
                      )}>
                        {c.fiadosTotal > 0 ? `${c.payRate}%` : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-center text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] pt-1">
            Mostrando {filtered.length} de {scoredCustomers.length} clientes
          </p>
        </>
      )}
    </div>
  );
}
