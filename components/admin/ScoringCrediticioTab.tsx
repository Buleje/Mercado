"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Shield, TrendingUp, AlertTriangle, CheckCircle, XCircle, Search, Users } from "lucide-react";
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
    badge: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    bar: "#00B4A6",
    icon: CheckCircle,
  },
  BUENO: {
    label: "Bueno",
    badge: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400",
    bar: "#38a169",
    icon: TrendingUp,
  },
  REGULAR: {
    label: "Regular",
    badge: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    bar: "#f97316",
    icon: AlertTriangle,
  },
  RIESGOSO: {
    label: "Riesgoso",
    badge: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
    bar: "#ea580c",
    icon: AlertTriangle,
  },
  BLOQUEADO: {
    label: "Bloqueado",
    badge: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
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
      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-200 w-8 text-right shrink-0">
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
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#00B4A6" }}>
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Scoring Crediticio</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Evaluación de riesgo para créditos y fiados</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Error al cargar datos: {error}</span>
        </div>
      )}

      {/* Filtros de nivel */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["TODOS", "EXCELENTE", "BUENO", "REGULAR", "RIESGOSO", "BLOQUEADO"] as (ScoreLevel | "TODOS")[]).map(lvl => {
          const isActive = filterLevel === lvl;
          const cfg = lvl !== "TODOS" ? LEVEL_CONFIG[lvl] : null;
          return (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={cn(
                "px-3 h-8 rounded-full text-xs font-medium transition-all",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
                isActive
                  ? cfg ? cfg.badge + " ring-1 ring-current" : "bg-[#00B4A6] text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full pl-9 pr-4 h-10 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 focus:border-[#00B4A6]"
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
          <Users className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {search ? "No hay clientes que coincidan" : "No hay clientes registrados"}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {search ? "Intenta con otro nombre" : "Los clientes aparecerán aquí una vez que realicen compras"}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden ">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium">Cliente</th>
                  <th className="text-center px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium">Nivel</th>
                  <th className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium">Score</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium">Fiado actual</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium">Límite recom.</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium">Pago a tiempo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const cfg = LEVEL_CONFIG[c.level];
                  const LevelIcon = cfg.icon;
                  return (
                    <tr
                      key={c.customerId}
                      className={cn(
                        "border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors",
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-white truncate max-w-[160px]">{c.customerName}</p>
                        {c.fiadosOverdue > 0 && (
                          <p className="text-xs text-red-500 dark:text-red-400">{c.fiadosOverdue} fiado{c.fiadosOverdue > 1 ? "s" : ""} vencido{c.fiadosOverdue > 1 ? "s" : ""}</p>
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
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-200">
                        {c.fiadoActual > 0 ? (
                          <span className={c.fiadoActual > c.limiteRecomendado ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                            {fmt(c.fiadoActual)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-200">
                        {c.limiteRecomendado > 0 ? fmt(c.limiteRecomendado) : (
                          <span className="text-red-500 font-semibold">Sin crédito</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.fiadosTotal > 0 ? (
                          <span className={cn(
                            "font-mono text-xs font-semibold",
                            c.payRate >= 80 ? "text-emerald-600 dark:text-emerald-400" :
                            c.payRate >= 50 ? "text-amber-600 dark:text-amber-400" :
                            "text-red-600 dark:text-red-400",
                          )}>
                            {c.payRate}%
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Sin historial</span>
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
            {filtered.map(c => {
              const cfg = LEVEL_CONFIG[c.level];
              const LevelIcon = cfg.icon;
              return (
                <div
                  key={c.customerId}
                  className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 "
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 dark:text-white truncate">{c.customerName}</p>
                      {c.fiadosOverdue > 0 && (
                        <p className="text-xs text-red-500 mt-0.5">{c.fiadosOverdue} fiado(s) vencido(s)</p>
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
                      <p className="text-gray-400">Fiado actual</p>
                      <p className="font-mono font-semibold text-gray-700 dark:text-gray-200 mt-0.5">
                        {c.fiadoActual > 0 ? fmt(c.fiadoActual) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Límite</p>
                      <p className={cn(
                        "font-mono font-semibold mt-0.5",
                        c.limiteRecomendado > 0 ? "text-gray-700 dark:text-gray-200" : "text-red-500",
                      )}>
                        {c.limiteRecomendado > 0 ? fmt(c.limiteRecomendado) : "Sin crédito"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400">Pago</p>
                      <p className={cn(
                        "font-mono font-semibold mt-0.5",
                        c.fiadosTotal === 0 ? "text-gray-400" :
                        c.payRate >= 80 ? "text-emerald-600 dark:text-emerald-400" :
                        c.payRate >= 50 ? "text-amber-600 dark:text-amber-400" :
                        "text-red-600 dark:text-red-400",
                      )}>
                        {c.fiadosTotal > 0 ? `${c.payRate}%` : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-center text-gray-400 dark:text-gray-600 pt-1">
            Mostrando {filtered.length} de {scoredCustomers.length} clientes
          </p>
        </>
      )}
    </div>
  );
}
