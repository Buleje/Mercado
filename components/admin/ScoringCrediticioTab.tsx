"use client";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import EmptyState from "@/components/admin/shared/EmptyState";
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
  // Rampa de riesgo sobre tokens del DS. Antes las barras eran 4 hex sueltos
  // (#38a169, #ff6b5b, #f0503f, #e63946) que no existen en la paleta: en dark
  // quedaban fuera de tono y ningún cambio de tema los tocaba. Y "Regular" y
  // "Riesgoso" compartían EXACTAMENTE el mismo badge, así que en la tabla los
  // dos niveles se veían idénticos.
  EXCELENTE: {
    label: "Excelente",
    badge: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    bar: "var(--data-success-500)",
    icon: CheckCircle,
  },
  BUENO: {
    label: "Bueno",
    badge: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
    bar: "var(--accent)",
    icon: TrendingUp,
  },
  REGULAR: {
    label: "Regular",
    badge: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    bar: "var(--data-warning-500)",
    icon: AlertTriangle,
  },
  RIESGOSO: {
    label: "Riesgoso",
    badge: "bg-[var(--data-warning-500)]/25 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)] ring-1 ring-inset ring-[var(--data-warning-500)]/40",
    bar: "var(--data-warning-700)",
    icon: AlertTriangle,
  },
  BLOQUEADO: {
    label: "Bloqueado",
    badge: "bg-[var(--data-error-500)]/12 text-[var(--data-error-500)]",
    bar: "var(--data-error-500)",
    icon: XCircle,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-[var(--surface-sunken)] dark:bg-[var(--rule-soft)]", className)} />;
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

  /** KPIs de cabecera — el mismo tipo de resumen que abre "Por cobrar". */
  const resumen = useMemo(() => {
    const total = scoredCustomers.length;
    const scorePromedio = total
      ? Math.round(scoredCustomers.reduce((s, c) => s + c.score, 0) / total)
      : 0;
    const limiteTotal = scoredCustomers.reduce((s, c) => s + c.limiteRecomendado, 0);
    const enRiesgo = counts.RIESGOSO + counts.BLOQUEADO;
    const sobreLimite = scoredCustomers.filter(c => c.fiadoActual > c.limiteRecomendado).length;
    return [
      { label: "Clientes evaluados", value: String(total), hint: `${counts.EXCELENTE + counts.BUENO} en buen nivel`, icon: Users, tone: "var(--accent)" },
      { label: "Score promedio", value: String(scorePromedio), hint: "sobre 100 puntos", icon: TrendingUp, tone: "var(--data-success-500)" },
      { label: "Límite recomendado", value: fmt(limiteTotal), hint: "suma de toda la cartera", icon: Shield, tone: "var(--accent)" },
      { label: "Para mirar de cerca", value: String(enRiesgo), hint: sobreLimite > 0 ? `${sobreLimite} pasado(s) de su límite` : "riesgosos y bloqueados", icon: AlertTriangle, tone: enRiesgo > 0 ? "var(--data-warning-700)" : "var(--text-tertiary)" },
    ];
  }, [scoredCustomers, counts]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header estándar del panel (AdminModuleHeader), igual que sus hermanos
          de Mi Plata. Antes era un div armado a mano con un PageTitle suelto,
          así que se perdía el `font-display` que AdminModuleHeader aplica al
          título: al lado de "Por cobrar" o "Fiados" se leía como otra
          aplicación. `as="h2"` porque el hub Mi Plata ya puso el h1. */}
      <AdminModuleHeader
        as="h2"
        title="Scoring crediticio"
        description="Cuánto riesgo tiene cada cliente antes de fiarle"
        icon={Shield}
      />

      {/* Resumen — los hermanos de Mi Plata abren con KPIs y este tab no tenía
          ninguno: el dueño veía la tabla cruda sin saber cómo venía la cartera. */}
      {!loading && scoredCustomers.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {resumen.map((k) => {
            const KIcon = k.icon;
            return (
              <div
                key={k.label}
                className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-sunken)]"
                    style={{ color: k.tone }}
                  >
                    <KIcon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">{k.label}</p>
                </div>
                <p className="mt-3 text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">{k.value}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{k.hint}</p>
              </div>
            );
          })}
        </div>
      )}

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
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] dark:hover:bg-[var(--rule-base)]",
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
          className="w-full pl-9 pr-4 h-12 rounded-lg text-sm border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
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
        // EmptyState del panel (10 consumidores) en vez del div a mano: mismo
        // encuadre, mismo tamaño de ícono y misma jerarquía que el resto.
        <EmptyState
          icon={Users}
          title={search || filterLevel !== "TODOS" ? "Ningún cliente coincide" : "Todavía no hay clientes para evaluar"}
          description={
            search || filterLevel !== "TODOS"
              ? "Probá con otro nombre o quitá el filtro de nivel."
              : "En cuanto tus clientes compren o les fíes, acá vas a ver su score."
          }
          action={
            search || filterLevel !== "TODOS"
              ? { label: "Limpiar filtros", onClick: () => { setSearch(""); setFilterLevel("TODOS"); } }
              : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-x-auto ">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
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
                        "border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] last:border-0 hover:bg-[var(--surface-sunken)] transition-colors",
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
