"use client";

import { useState } from "react";
import {
  DollarSign, Calendar, AlertTriangle,
  CheckCircle2, TrendingUp, Shield, MessageCircle,
  ChevronLeft, ChevronRight,
  UtensilsCrossed, Home, Package, User,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp-link";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { activateProps } from "@/components/admin/shared/a11y";

type FiadoStatus = "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";

type FiadoCuota = {
  id: string;
  fiadoId: string;
  monto: number;
  pagadoEn?: string;
  notas?: string;
  createdAt: string;
};

type Fiado = {
  id: string;
  tenantId: string;
  customerId: string;
  customerName?: string;
  total: number;
  saldo: number;
  descripcion?: string;
  status: FiadoStatus;
  fechaVence?: string;
  cuotas: FiadoCuota[];
  createdAt: string;
  updatedAt: string;
};

type RiskLevel = "ALTO" | "MEDIO" | "BAJO";

type ScoredFiado = Fiado & { diasVencido: number; riskScore: number; riskLevel: RiskLevel };

type TendenciaMorosidad = {
  cobradoEsteMes: number;
  prestadoEsteMes: number;
};

type ProyeccionCobro = {
  cobradoHoy: number;
  cobradoSemana: number;
  promedioDiario: number;
  totalPendiente: number;
  pctRecuperado: number;
  diasRestantes: number;
};

// FiadoMasAntiguo es un subconjunto de Fiado enriquecido con `dias`
type FiadoMasAntiguo = Fiado & { dias: number };

type PagosEstaSemana = {
  total: number;
  pagaron: number;
};

type MejorPagadorMes = {
  nombre: string;
  total: number;
};

/**
 * Vista del módulo Fiados — sub-tab activo.
 * Audit 2026-05-17: agregamos navegación interna porque FiadosModule tenía
 * 10+ widgets en una sola scroll vertical. Cada vista muestra sólo lo que
 * le toca.
 *
 *  - "all"      → comportamiento legacy (renderiza todo, default por compat).
 *  - "resumen"  → KPI + progreso + proyección + banners (pagaron, mejor pagador, más antiguo).
 *  - "analisis" → gráfica tendencia 12m + ranking riesgo + calendario + tags por zona.
 *  - "deudores" → ninguna sección de FiadoStats (la tabla la pinta FiadosModule).
 */
export type FiadoStatsView = "all" | "resumen" | "analisis" | "deudores";

type FiadoStatsProps = {
  fiados: Fiado[];
  loading: boolean;
  totalSaldo: number;
  tendenciaMorosidad: TendenciaMorosidad;
  proyeccionCobro: ProyeccionCobro;
  fiadoMasAntiguo: FiadoMasAntiguo | null;
  pagosEstaSemana: PagosEstaSemana;
  mejorPagadorMes: MejorPagadorMes | null;
  openDetail: (f: Fiado) => void;
  search: string;
  setSearch: (v: string) => void;
  setSelected: (f: Fiado) => void;
  setShowQuickClient?: (v: boolean) => void;
  statusFilter: FiadoStatus | "";
  setStatusFilter: (v: FiadoStatus | "") => void;
  FiadoTendenciaCobro: React.ComponentType;
  /** Sub-tab activo. Default "all" para preservar el render legacy. */
  view?: FiadoStatsView;
};

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }

export default function FiadoStats({ fiados, loading, totalSaldo, tendenciaMorosidad, proyeccionCobro, fiadoMasAntiguo, pagosEstaSemana, mejorPagadorMes, openDetail, setSearch, setSelected, FiadoTendenciaCobro, view = "all" }: FiadoStatsProps) {
  const [calMes, setCalMes] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calDiaSeleccionado, setCalDiaSeleccionado] = useState<string | null>(null);

  // Sub-tab visibility flags. KPI inline (header bar) se muestra SIEMPRE
  // excepto en "deudores" (la tabla ya tiene sus propios contadores).
  const showHeaderKpi = view === "all" || view === "resumen" || view === "analisis";
  const showResumen = view === "all" || view === "resumen";
  const showAnalisis = view === "all" || view === "analisis";
  const waAntiguo = fiadoMasAntiguo
    ? waLink(
        fiadoMasAntiguo.customerId,
        `Hola ${fiadoMasAntiguo.customerName || ""}! Le recuerdo que tiene un saldo pendiente de ${formatCurrency(fiadoMasAntiguo.saldo)} en Buleje. Gracias!`,
      )
    : null;

  return (
    <>
      {showHeaderKpi && !loading && fiados.length > 0 && (() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const todayStart = now.getTime();
        const activos = fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO");
        const totalPendienteKpi = activos.reduce((s, f) => s + f.saldo, 0);
        const cobradoHoyKpi = fiados.reduce((s, f) => s + f.cuotas.filter(c => {
          try { return new Date(c.createdAt).getTime() >= todayStart; } catch { return false; }
        }).reduce((ss, c) => ss + c.monto, 0), 0);
        const vencidosCountKpi = activos.filter(f => f.fechaVence && new Date(f.fechaVence) < now).length;
        const totalPrestado = fiados.reduce((s, f) => s + f.total, 0);
        const totalCobrado = fiados.reduce((s, f) => s + f.cuotas.reduce((ss, c) => ss + c.monto, 0), 0);
        const tasaRecupKpi = totalPrestado > 0 ? (totalCobrado / totalPrestado) * 100 : 0;

        // Pills data
        const alDiaC = activos.filter(f => !f.fechaVence || new Date(f.fechaVence).getTime() > now.getTime() + 7 * 86400000).length;
        const porVencerC = activos.filter(f => { if (!f.fechaVence) return false; const v = new Date(f.fechaVence).getTime(); return v >= now.getTime() && v <= now.getTime() + 7 * 86400000; }).length;
        const vencidoC = activos.filter(f => { if (!f.fechaVence) return false; const v = new Date(f.fechaVence).getTime(); return v < now.getTime() && v >= now.getTime() - 60 * 86400000; }).length;
        const bloqueadoC = activos.filter(f => { if (!f.fechaVence) return false; return new Date(f.fechaVence).getTime() < now.getTime() - 60 * 86400000; }).length;

        return (
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 bg-[var(--surface-sunken)] rounded-xl p-4">
            {/* KPI inline — iconos neutrales, solo los valores numericos llevan tono semantico */}
            <div className="flex gap-4 overflow-x-auto flex-1 scrollbar-hide">
              <div className="flex items-center gap-1.5 shrink-0">
                <DollarSign className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                <span className="text-xs text-[var(--text-secondary)]">Total:</span>
                <span className="text-xs font-mono font-bold text-[var(--text-primary)]">{formatCurrency(totalPendienteKpi)}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                <span className="text-xs text-[var(--text-secondary)]">Cobrado:</span>
                <span className="text-xs font-mono font-bold text-[var(--data-success-500)]">{formatCurrency(cobradoHoyKpi)}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                <span className="text-xs text-[var(--text-secondary)]">Vencidos:</span>
                <span className={cn("text-xs font-mono font-bold", vencidosCountKpi > 0 ? "text-[var(--data-error-500)]" : "text-[var(--text-primary)]")}>{vencidosCountKpi}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <TrendingUp className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                <span className="text-xs text-[var(--text-secondary)]">Tasa:</span>
                <span className="text-xs font-mono font-bold text-[var(--text-primary)]">{tasaRecupKpi.toFixed(1)}%</span>
              </div>
            </div>
            {/* Pills semaforo */}
            <div className="flex gap-1.5 shrink-0 flex-wrap">
              <StatusBadge variant="success" label={String(alDiaC)} dot size="sm" />
              {porVencerC > 0 && (
                <StatusBadge variant="warning" label={String(porVencerC)} dot size="sm" pulse />
              )}
              {vencidoC > 0 && (
                <StatusBadge variant="error" label={String(vencidoC)} dot size="sm" />
              )}
              {bloqueadoC > 0 && (
                <StatusBadge variant="neutral" label={String(bloqueadoC)} dot size="sm" />
              )}
            </div>
          </div>
        );
      })()}

      {/* Mejora QW-11f: Progreso de cobro del mes — tab Resumen */}
      {showResumen && !loading && (tendenciaMorosidad.cobradoEsteMes > 0 || tendenciaMorosidad.prestadoEsteMes > 0 || totalSaldo > 0) && (() => {
        const meta = tendenciaMorosidad.prestadoEsteMes + totalSaldo;
        const cobrado = tendenciaMorosidad.cobradoEsteMes;
        const pct = meta > 0 ? Math.min(100, Math.round((cobrado / meta) * 100)) : 0;
        return (
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-[var(--text-primary)]">Cobro del mes: {formatCurrency(cobrado)} de {formatCurrency(meta)} ({pct}%)</span>
              {pct > 80 ? (
                <span className="text-xs font-bold text-[var(--data-success-500)]">Casi todo cobrado!</span>
              ) : pct < 30 ? (
                <span className="text-xs font-bold text-[var(--data-error-500)]">Falta mucho por cobrar</span>
              ) : null}
            </div>
            <div className="w-full bg-[var(--surface-sunken)] rounded-full h-2">
              <div
                className={cn(
                  "h-2 rounded-full transition-all",
                  pct > 80 ? "bg-[var(--data-success-500)]" : pct < 30 ? "bg-[var(--data-error-500)]" : "bg-[var(--accent)]",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* Mejora 19 (ronda 3): Proyección de cobro — tab Resumen */}
      {showResumen && !loading && fiados.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-[var(--text-primary)]" />
            <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Proyección de cobro</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
            <div className="text-center">
              <p className="text-lg font-extrabold text-[var(--accent)] tabular-nums">{formatCurrency(proyeccionCobro.cobradoHoy)}</p>
              <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-[var(--ls-wider)]">Cobrado hoy</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold text-[var(--text-primary)] tabular-nums">{formatCurrency(proyeccionCobro.cobradoSemana)}</p>
              <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-[var(--ls-wider)]">Esta semana</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold text-[var(--data-warning-500)] tabular-nums">{formatCurrency(proyeccionCobro.promedioDiario)}</p>
              <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-[var(--ls-wider)]">Promedio/día</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold text-[var(--data-error-500)] tabular-nums">{formatCurrency(proyeccionCobro.totalPendiente)}</p>
              <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-[var(--ls-wider)]">Pendiente</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-[var(--surface-sunken)] rounded-full h-2 mb-2">
            <div className="h-2 rounded-full transition-all bg-[var(--accent)]" style={{ width: `${Math.min(100, proyeccionCobro.pctRecuperado)}%` }} />
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {proyeccionCobro.promedioDiario > 0 ? (
              <>Si cobras <span className="font-bold text-[var(--accent)]">{formatCurrency(proyeccionCobro.promedioDiario)}/día</span>, recuperas todo en <span className="font-bold">{proyeccionCobro.diasRestantes} días</span></>
            ) : (
              <span className="text-[var(--data-warning-500)] font-bold">Aún no has cobrado esta semana — ¡empieza hoy!</span>
            )}
          </p>
        </div>
      )}

      {/* Mejora QW-11g: Fiados agrupados por zona/tipo — tab Análisis */}
      {showAnalisis && !loading && fiados.length > 0 && (() => {
        // Agrupar por prefijo del nombre (zona aproximada)
        // ADR-074 Phase 2: todos los tags usan el mismo surface neutro +
        // icono neutral. El tipo de zona se identifica por el ICONO, no
        // por colores saturados.
        const TAG_MAP: Record<string, { Icon: LucideIcon }> = {
          restaurante: { Icon: UtensilsCrossed },
          vecino: { Icon: Home },
          mayorista: { Icon: Package },
          otro: { Icon: User },
        };
        // Agrupar activos por etiqueta del customerName (detectar palabras clave)
        const activos = fiados.filter(f => f.status === "ACTIVO" || f.status === "VENCIDO");
        const groups: Record<string, { count: number; saldo: number }> = {};
        for (const f of activos) {
          const name = (f.customerName || "").toLowerCase();
          const tag = name.includes("restaur") || name.includes("rest") ? "restaurante"
            : name.includes("mayor") || name.includes("distrib") ? "mayorista"
            : "vecino";
          if (!groups[tag]) groups[tag] = { count: 0, saldo: 0 };
          groups[tag].count++;
          groups[tag].saldo += f.saldo;
        }
        const entries = Object.entries(groups);
        if (entries.length <= 1 && activos.length < 3) return null;
        return (
          <div className="flex flex-wrap gap-2">
            {entries.map(([tag, data]) => {
              const meta = TAG_MAP[tag] || TAG_MAP.otro;
              return (
                <button
                  key={tag}
                  onClick={() => setSearch(tag === "vecino" ? "" : tag.slice(0, 5))}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)]"
                >
                  <meta.Icon className="h-3.5 w-3.5 text-[var(--text-secondary)]" strokeWidth={1.75} />
                  {tag.charAt(0).toUpperCase() + tag.slice(1)}: {formatCurrency(data.saldo)} ({data.count})
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Mejora P-9: Clientes que pagaron esta semana — tab Resumen */}
      {showResumen && !loading && pagosEstaSemana.total > 0 && (() => {
        const allPaid = pagosEstaSemana.pagaron === pagosEstaSemana.total;
        const mostPaid = pagosEstaSemana.pagaron > pagosEstaSemana.total / 2;
        const tone = allPaid ? "success" : mostPaid ? "success" : "neutral";
        const intensity = allPaid ? "18%" : mostPaid ? "10%" : "0%";
        const text = allPaid
          ? `Todos al dia! (${pagosEstaSemana.total} clientes)`
          : mostPaid
            ? `Mas de la mitad ya pago! ${pagosEstaSemana.pagaron} de ${pagosEstaSemana.total} clientes esta semana`
            : `${pagosEstaSemana.pagaron} de ${pagosEstaSemana.total} clientes ya pagaron esta semana`;
        const bgVar = tone === "success" ? `color-mix(in oklch, var(--data-success) ${intensity}, transparent)` : "var(--surface-sunken)";
        const textColor = tone === "success" ? "var(--data-success)" : "var(--text-secondary)";
        return (
          <div
            className="rounded-xl px-4 py-2.5 text-xs font-bold border border-[var(--rule-soft)]"
            style={{ background: bgVar, color: textColor }}
          >
            {text}
          </div>
        );
      })()}

      {/* Mejora P-10: Mejor pagador del mes — tab Resumen */}
      {showResumen && !loading && mejorPagadorMes && (
        <div
          className="rounded-xl border border-[var(--rule-soft)] px-4 py-2.5 flex items-center gap-2"
          style={{ background: "color-mix(in oklch, var(--data-success) 10%, transparent)" }}
        >
          <span className="text-xs font-bold text-[var(--data-success-500)]">
            Mejor pagador: {mejorPagadorMes.nombre} — {formatCurrency(mejorPagadorMes.total)} este mes
          </span>
        </div>
      )}

      {/* Mejora QW-7: Fiado mas antiguo destacado — tab Resumen */}
      {showResumen && fiadoMasAntiguo && (
        <div
          className="rounded-xl border border-[var(--rule-soft)] p-3 flex flex-col sm:flex-row sm:items-center gap-2"
          style={{ background: "color-mix(in oklch, var(--data-error) 8%, transparent)" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[var(--data-error-500)]">Fiado mas antiguo</p>
            <p className="text-sm text-[var(--text-primary)] mt-0.5 truncate">
              <span className="font-bold">{fiadoMasAntiguo.customerName || fiadoMasAntiguo.customerId}</span>
              {" · "}<span className="font-bold">{formatCurrency(fiadoMasAntiguo.saldo)}</span>
              {" · "}hace {fiadoMasAntiguo.dias} dias
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {waAntiguo && (
              <a
                href={waAntiguo}
                target="_blank" rel="noopener noreferrer"
                // WhatsApp brand color (#25D366) — no token equivalent, se mantiene como excepcion documentada
                className="text-xs font-bold text-white bg-[#25D366] hover:opacity-90 px-3 py-1.5 rounded-lg transition-opacity"
              >
                Cobrar ahora
              </a>
            )}
            <button
              onClick={() => setSelected(fiadoMasAntiguo)}
              className="text-xs font-bold text-[var(--data-error-500)] hover:underline px-2 py-1.5"
            >
              Ver detalle
            </button>
          </div>
        </div>
      )}

      {/* NOTE: Search + status chips se renderizan en FiadosModule (parent) — NO duplicar aquí */}

      {/* Mejora 16: Gráfica de cobro mensual — tab Análisis */}
      {showAnalisis && <FiadoTendenciaCobro />}

      {/* Audit 2026-05-17: Antigüedad de la deuda (aging buckets).
          Estándar contable — el dueño ve qué deudas son recuperables vs
          tóxicas. 4 buckets: 0-7d / 8-30d / 31-60d / +60d (perdidas). */}
      {showAnalisis && (() => {
        const activos = fiados.filter(f => (f.status === "ACTIVO" || f.status === "VENCIDO") && f.saldo > 0);
        if (activos.length === 0) return null;

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const buckets = [
          { key: "fresca", label: "Al día (0-7d)", desc: "Sin vencer o recién vencidas", min: -Infinity, max: 7, count: 0, total: 0, tone: "var(--data-success)" },
          { key: "media", label: "8-30 días", desc: "Cobranza temprana", min: 8, max: 30, count: 0, total: 0, tone: "var(--data-warning)" },
          { key: "vencida", label: "31-60 días", desc: "Cobranza intensiva", min: 31, max: 60, count: 0, total: 0, tone: "var(--data-error)" },
          { key: "perdida", label: "+60 días", desc: "Riesgo de pérdida", min: 61, max: Infinity, count: 0, total: 0, tone: "var(--data-error)" },
        ];

        for (const f of activos) {
          const vence = f.fechaVence ? new Date(f.fechaVence) : new Date(f.createdAt);
          const dias = Math.max(0, Math.floor((now.getTime() - vence.getTime()) / 86400000));
          const b = buckets.find(b => dias >= b.min && dias <= b.max);
          if (b) { b.count++; b.total += f.saldo; }
        }

        const totalDeuda = buckets.reduce((s, b) => s + b.total, 0);

        return (
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Antigüedad de la deuda</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Cuánto te deben distribuido por días de atraso</p>
              </div>
              <p className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">{formatCurrency(totalDeuda)}</p>
            </div>
            {/* Barra apilada visual */}
            <div className="flex h-2 rounded-full overflow-hidden bg-[var(--surface-sunken)] mb-3">
              {buckets.map(b => {
                const pct = totalDeuda > 0 ? (b.total / totalDeuda) * 100 : 0;
                if (pct === 0) return null;
                return (
                  <div
                    key={b.key}
                    style={{ width: `${pct}%`, background: b.tone }}
                    title={`${b.label}: ${formatCurrency(b.total)} (${pct.toFixed(0)}%)`}
                  />
                );
              })}
            </div>
            {/* Grid de 4 tarjetitas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {buckets.map(b => {
                const pct = totalDeuda > 0 ? (b.total / totalDeuda) * 100 : 0;
                return (
                  <div
                    key={b.key}
                    className="rounded-lg p-3 border border-[var(--rule-soft)]"
                    style={{ background: `color-mix(in oklch, ${b.tone} 8%, transparent)` }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: b.tone }} />
                      <span className="text-xs font-bold text-[var(--text-primary)]">{b.label}</span>
                    </div>
                    <p className="text-base font-extrabold tabular-nums" style={{ color: b.tone }}>
                      {formatCurrency(b.total)}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {b.count} {b.count === 1 ? "fiado" : "fiados"} · {pct.toFixed(0)}%
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Mejora 19: Top deudores por riesgo (mejorado audit 2026-05-17) — tab Análisis */}
      {showAnalisis && (() => {
        const activos = fiados.filter(f => (f.status === "ACTIVO" || f.status === "VENCIDO") && f.saldo > 0);
        if (activos.length === 0) {
          return (
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-xl p-6 flex flex-col items-center gap-2 text-center">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-[var(--data-success-500)]" strokeWidth={2} />
              </div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Sin deudores pendientes</p>
              <p className="text-xs text-[var(--text-secondary)] max-w-xs">
                Cuando empieces a fiar, verás aquí el ranking de quién te debe más y cuánto se atrasa.
              </p>
            </div>
          );
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const scored: ScoredFiado[] = activos.map(f => {
          const vence = f.fechaVence ? new Date(f.fechaVence) : null;
          const diasVencido = vence ? Math.max(0, Math.floor((now.getTime() - new Date(vence).getTime()) / (1000 * 60 * 60 * 24))) : 0;
          const riskScore = f.saldo * (1 + diasVencido / 10);
          let riskLevel: RiskLevel = "BAJO";
          if (f.saldo > 200 && diasVencido > 30) riskLevel = "ALTO";
          else if (f.saldo > 100 || diasVencido > 15) riskLevel = "MEDIO";
          return { ...f, diasVencido, riskScore, riskLevel };
        }).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);

        const maxSaldo = Math.max(...scored.map(s => s.saldo));

        const riskTone: Record<RiskLevel, { badgeVariant: "error" | "warning" | "success"; dataVar: string; label: string }> = {
          ALTO: { badgeVariant: "error", dataVar: "var(--data-error)", label: "Riesgo alto" },
          MEDIO: { badgeVariant: "warning", dataVar: "var(--data-warning)", label: "Riesgo medio" },
          BAJO: { badgeVariant: "success", dataVar: "var(--data-success)", label: "Al día" },
        };

        return (
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Top deudores
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Ordenado por riesgo (saldo + días de atraso). Los {Math.min(5, scored.length)} más urgentes.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {scored.map((f, idx) => {
                const tone = riskTone[f.riskLevel];
                const pctBar = maxSaldo > 0 ? (f.saldo / maxSaldo) * 100 : 0;
                const name = f.customerName || `Cliente ${(f.customerId || "").slice(-4)}`;
                const initial = name.charAt(0).toUpperCase();
                return (
                  <div
                    key={f.id}
                    {...activateProps(() => openDetail(f))}
                    className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:shadow-[var(--shadow-sm)] transition-shadow cursor-pointer overflow-hidden"
                  >
                    <div className="flex items-center gap-3 p-3">
                      {/* Avatar circular numerado por riesgo */}
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0"
                        style={{ background: `color-mix(in oklch, ${tone.dataVar} 18%, transparent)`, color: tone.dataVar }}
                      >
                        {initial}
                      </div>
                      {/* Info principal */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                            {idx === 0 && <span className="text-[var(--text-tertiary)] mr-1">#{idx + 1}</span>}
                            {name}
                          </p>
                          <StatusBadge variant={tone.badgeVariant} label={tone.label} size="sm" />
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] truncate">
                          {f.descripcion ? f.descripcion : "Sin descripción"}
                          {f.diasVencido > 0 && (
                            <span className="ml-1 font-bold text-[var(--data-error-500)]">
                              · {f.diasVencido} {f.diasVencido === 1 ? "día atrasado" : "días atrasados"}
                            </span>
                          )}
                        </p>
                        {/* Barra de proporción visual */}
                        <div className="mt-1.5 h-1.5 w-full bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pctBar}%`, background: tone.dataVar }}
                          />
                        </div>
                      </div>
                      {/* Monto + acciones */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <p className="text-lg font-extrabold tabular-nums leading-none" style={{ color: tone.dataVar }}>
                          {formatCurrency(f.saldo)}
                        </p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={e => { e.stopPropagation(); openDetail(f); }}
                            className="text-xs font-bold px-2.5 py-1 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
                          >
                            Cobrar
                          </button>
                          {f.customerId && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                const nombre = f.customerName || f.customerId;
                                const msg = `Hola ${nombre}, te recordamos que tienes un pendiente de S/${Number(f.saldo).toFixed(2)} en Buleje. Cuando puedas pasa a regularizarlo!`;
                                const wa = waLink(f.customerId, msg);
                                if (wa) window.open(wa, "_blank");
                              }}
                              aria-label="Enviar recordatorio por WhatsApp"
                              className="text-xs font-bold p-1.5 rounded-lg bg-[#25D366]/12 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Mejora M2: Calendario de Vencimientos de Fiados — tab Análisis */}
      {showAnalisis && (() => {
        const activosConVence = fiados.filter(f => (f.status === "ACTIVO" || f.status === "VENCIDO") && f.fechaVence);
        const sinVence = fiados.filter(f => (f.status === "ACTIVO" || f.status === "VENCIDO") && !f.fechaVence).length;

        const primerDia = new Date(calMes.year, calMes.month, 1);
        const ultimoDia = new Date(calMes.year, calMes.month + 1, 0);
        const diasMes = ultimoDia.getDate();
        const startDay = (primerDia.getDay() + 6) % 7; // Lun=0

        // Agrupar fiados por dia de vencimiento
        const porDia: Record<string, typeof activosConVence> = {};
        let totalMes = 0;
        let countMes = 0;
        for (const f of activosConVence) {
          const d = new Date(f.fechaVence!);
          if (d.getFullYear() === calMes.year && d.getMonth() === calMes.month) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            if (!porDia[key]) porDia[key] = [];
            porDia[key].push(f);
            totalMes += f.saldo;
            countMes++;
          }
        }

        const hoyStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // Audit 2026-05-17 (mejoras Análisis): "Mayo De 2026" → "Mayo 2026".
        // Intl en es-PE devuelve "mayo de 2026" — quitamos el " de " manualmente.
        const mesNombre = primerDia
          .toLocaleDateString("es-PE", { month: "long", year: "numeric" })
          .replace(/ de /i, " ");

        const celdas: React.ReactNode[] = [];
        // Celdas vacias al inicio
        for (let i = 0; i < startDay; i++) celdas.push(<div key={`empty-${i}`} className="p-1 min-h-[44px]" />);
        // Dias del mes
        for (let d = 1; d <= diasMes; d++) {
          const diaKey = `${calMes.year}-${String(calMes.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const fiadosDia = porDia[diaKey] || [];
          const esHoy = diaKey === hoyStr;
          const esPasado = new Date(calMes.year, calMes.month, d) < hoy;
          const tieneVencidos = esPasado && fiadosDia.length > 0;
          const tienePorVencer = !esPasado && fiadosDia.length > 0;
          const montoDia = fiadosDia.reduce((s, f) => s + f.saldo, 0);

          celdas.push(
            <button
              key={diaKey}
              onClick={() => fiadosDia.length > 0 && setCalDiaSeleccionado(calDiaSeleccionado === diaKey ? null : diaKey)}
              aria-label={fiadosDia.length > 0 ? `Día ${d}: ${fiadosDia.length} fiados, S/${montoDia.toFixed(2)}` : `Día ${d}: sin vencimientos`}
              className={cn(
                "p-1 min-h-[44px] rounded-lg text-center transition-colors relative flex flex-col items-center justify-start gap-0.5",
                esHoy && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-raised)]",
                tieneVencidos && "bg-[color-mix(in_oklch,var(--data-error)_10%,transparent)] border border-[var(--data-error-500)]/20",
                tienePorVencer && "bg-[color-mix(in_oklch,var(--data-warning)_10%,transparent)] border border-[var(--data-warning-500)]/20",
                fiadosDia.length > 0 && "cursor-pointer hover:bg-[var(--surface-sunken)]",
                calDiaSeleccionado === diaKey && "bg-[color-mix(in_oklch,var(--accent)_18%,transparent)] ring-1 ring-[var(--accent)]",
              )}
            >
              <span
                className={cn(
                  "text-xs font-bold leading-tight",
                  esHoy ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
                )}
              >
                {d}
              </span>
              {fiadosDia.length > 0 && (
                <span
                  className={cn(
                    "text-[length:var(--ts-2xs)] font-bold tabular-nums leading-none",
                    tieneVencidos ? "text-[var(--data-error-500)]" : "text-[var(--data-warning-500)]",
                  )}
                >
                  S/{montoDia >= 1000 ? `${(montoDia / 1000).toFixed(1)}k` : montoDia.toFixed(0)}
                </span>
              )}
            </button>
          );
        }

        return (
          <div className="space-y-2">
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Calendario de vencimientos
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {countMes > 0
                    ? `${countMes} ${countMes === 1 ? "fiado vence" : "fiados vencen"} este mes · Total ${formatCurrency(totalMes)}`
                    : "Sin vencimientos este mes"}
                </p>
              </div>
              {/* Leyenda compacta */}
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-[var(--data-warning-500)]" />
                  <span className="text-[var(--text-secondary)]">Por vencer</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-sm bg-[var(--data-error-500)]" />
                  <span className="text-[var(--text-secondary)]">Vencido</span>
                </span>
              </div>
            </div>
            <div className="rounded-lg">
              {/* Nav del mes */}
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setCalMes(p => { const d = new Date(p.year, p.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                  aria-label="Mes anterior"
                  className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
                <p className="text-sm font-bold text-[var(--text-primary)] capitalize">{mesNombre}</p>
                <button
                  onClick={() => setCalMes(p => { const d = new Date(p.year, p.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                  aria-label="Mes siguiente"
                  className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
              {/* Header dias */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => (
                  <div key={d} className="text-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] py-1">{d}</div>
                ))}
              </div>
              {/* Grid dias */}
              <div className="grid grid-cols-7 gap-1">{celdas}</div>
              {sinVence > 0 && (
                <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-[var(--data-warning-50)] border border-[var(--data-warning-500)]/30">
                  <AlertTriangle className="h-3.5 w-3.5 text-[var(--data-warning-500)] shrink-0" />
                  <p className="text-xs font-semibold text-[var(--data-warning-500)]">
                    {sinVence} {sinVence === 1 ? "fiado activo" : "fiados activos"} sin fecha de vencimiento — agrégala para que aparezcan en el calendario.
                  </p>
                </div>
              )}
            </div>
            </div>
            {/* Detalle del día seleccionado */}
            {calDiaSeleccionado && porDia[calDiaSeleccionado] && (
              <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3 space-y-2">
                <p className="text-xs font-bold text-[var(--text-primary)]">
                  Fiados que vencen el {new Date(calDiaSeleccionado).toLocaleDateString("es-PE", { day: "2-digit", month: "long" })}
                </p>
                {porDia[calDiaSeleccionado].map(f => (
                  <div key={f.id} className="flex items-center gap-3 p-2 bg-[var(--surface-sunken)] rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate">{f.customerName || f.customerId}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{formatCurrency(f.saldo)}</p>
                    </div>
                    <button
                      onClick={() => {
                        const msg = `Hola ${f.customerName || f.customerId}, te recordamos que tienes un pendiente de S/${Number(f.saldo).toFixed(2)} en Buleje.`;
                        const wa = waLink(f.customerId, msg);
                        if (wa) window.open(wa, "_blank");
                      }}
                      // WhatsApp brand color (#25D366) — excepcion documentada (no token equivalent)
                      className="shrink-0 px-2 py-1 rounded-lg text-xs font-bold bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                    >
                      Cobrar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </>
  );
}
