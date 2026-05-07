"use client";

import { useState } from "react";
import {
  DollarSign, Calendar, AlertTriangle,
  CheckCircle2, TrendingUp, Shield, MessageCircle,
  ChevronLeft, ChevronRight, Search, Plus, Clock, XCircle, Ban,
  UtensilsCrossed, Home, Package, User,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/admin/shared/StatusBadge";

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
};

/**
 * STATUS_META — mapeo estado -> variante semantica StatusBadge.
 * ADR-074 Phase 2: eliminamos los bg-amber-100/emerald-100/red-100/gray-100
 * hardcoded. La variante es lo único que importa; el color cae via tokens.
 */
const STATUS_META: Record<FiadoStatus, { label: string; variant: "warning" | "success" | "error" | "neutral"; icon: typeof CheckCircle2 }> = {
  ACTIVO: { label: "Activo", variant: "warning", icon: Clock },
  PAGADO: { label: "Pagado", variant: "success", icon: CheckCircle2 },
  VENCIDO: { label: "Vencido", variant: "error", icon: XCircle },
  CANCELADO: { label: "Cancelado", variant: "neutral", icon: Ban },
};

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }

export default function FiadoStats({ fiados, loading, totalSaldo, tendenciaMorosidad, proyeccionCobro, fiadoMasAntiguo, pagosEstaSemana, mejorPagadorMes, openDetail, search, setSearch, setSelected, setShowQuickClient, statusFilter, setStatusFilter, FiadoTendenciaCobro }: FiadoStatsProps) {
  const [calMes, setCalMes] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calDiaSeleccionado, setCalDiaSeleccionado] = useState<string | null>(null);

  return (
    <>
      {!loading && fiados.length > 0 && (() => {
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

      {/* Mejora QW-11f: Progreso de cobro del mes */}
      {!loading && (tendenciaMorosidad.cobradoEsteMes > 0 || tendenciaMorosidad.prestadoEsteMes > 0 || totalSaldo > 0) && (() => {
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

      {/* Mejora 19 (ronda 3): Proyección de cobro */}
      {!loading && fiados.length > 0 && (
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

      {/* Mejora QW-11g: Fiados agrupados por zona/tipo */}
      {!loading && fiados.length > 0 && (() => {
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

      {/* Mejora P-9: Clientes que pagaron esta semana */}
      {!loading && pagosEstaSemana.total > 0 && (() => {
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

      {/* Mejora P-10: Mejor pagador del mes */}
      {!loading && mejorPagadorMes && (
        <div
          className="rounded-xl border border-[var(--rule-soft)] px-4 py-2.5 flex items-center gap-2"
          style={{ background: "color-mix(in oklch, var(--data-success) 10%, transparent)" }}
        >
          <span className="text-xs font-bold text-[var(--data-success-500)]">
            Mejor pagador: {mejorPagadorMes.nombre} — {formatCurrency(mejorPagadorMes.total)} este mes
          </span>
        </div>
      )}

      {/* Mejora QW-7: Fiado mas antiguo destacado */}
      {fiadoMasAntiguo && (
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
            {fiadoMasAntiguo.customerId && (
              <a
                href={`https://wa.me/51${fiadoMasAntiguo.customerId.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${fiadoMasAntiguo.customerName || ""}! Le recuerdo que tiene un saldo pendiente de ${formatCurrency(fiadoMasAntiguo.saldo)} en Buleje. Gracias!`)}`}
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

      {/* Mejora 16: Gráfica de cobro mensual */}
      <FiadoTendenciaCobro />

      {/* Mejora 19: Ranking de deudores por riesgo */}
      {(() => {
        const activos = fiados.filter(f => (f.status === "ACTIVO" || f.status === "VENCIDO") && f.saldo > 0);
        if (activos.length === 0) {
          return (
            <div
              className="border border-[var(--rule-soft)] rounded-xl p-4 text-center"
              style={{ background: "color-mix(in oklch, var(--data-success) 10%, transparent)" }}
            >
              <p className="text-sm font-bold text-[var(--data-success-500)]">Sin deudores pendientes — Excelente!</p>
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

        // Risk levels mapeados a variantes StatusBadge + tono semantico
        const riskTone: Record<RiskLevel, { badgeVariant: "error" | "warning" | "success"; dataVar: string }> = {
          ALTO: { badgeVariant: "error", dataVar: "var(--data-error)" },
          MEDIO: { badgeVariant: "warning", dataVar: "var(--data-warning)" },
          BAJO: { badgeVariant: "success", dataVar: "var(--data-success)" },
        };

        return (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-[var(--text-primary)]" /> Top Deudores por Riesgo
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {scored.map(f => {
                const tone = riskTone[f.riskLevel];
                return (
                  <div
                    key={f.id}
                    className="rounded-lg border border-[var(--rule-soft)] p-3 cursor-pointer hover:shadow-[var(--shadow-sm)] transition-shadow"
                    style={{ background: `color-mix(in oklch, ${tone.dataVar} 8%, transparent)` }}
                    onClick={() => openDetail(f)}
                  >
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate">{f.customerName || f.customerId}</p>
                      <StatusBadge variant={tone.badgeVariant} label={f.riskLevel} size="sm" />
                    </div>
                    <p className="text-sm font-extrabold tabular-nums" style={{ color: tone.dataVar }}>
                      {formatCurrency(f.saldo)}
                      {f.diasVencido > 0 && <span className="text-xs font-normal ml-1">· {f.diasVencido}d vencido</span>}
                    </p>
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          openDetail(f);
                        }}
                        className="flex-1 text-xs font-bold text-center py-1 rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] transition-colors border border-[var(--rule-soft)]"
                      >
                        Cobrar
                      </button>
                      {f.customerId && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            const nombre = f.customerName || f.customerId;
                            const msg = `Hola ${nombre}, te recordamos que tienes un pendiente de S/${Number(f.saldo).toFixed(2)} en Buleje. Cuando puedas pasa a regularizarlo!`;
                            const cleanPhone = f.customerId.replace(/\D/g, "");
                            window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
                          }}
                          // WhatsApp brand color (#25D366) — excepcion documentada (no token equivalent)
                          className="text-xs font-bold px-2 py-1 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                        >
                          <MessageCircle className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Mejora M2: Calendario de Vencimientos de Fiados */}
      {(() => {
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

        const mesNombre = primerDia.toLocaleDateString("es-PE", { month: "long", year: "numeric" });

        const celdas: React.ReactNode[] = [];
        // Celdas vacias al inicio
        for (let i = 0; i < startDay; i++) celdas.push(<div key={`empty-${i}`} className="p-1 min-h-[50px]" />);
        // Dias del mes
        for (let d = 1; d <= diasMes; d++) {
          const diaKey = `${calMes.year}-${String(calMes.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const fiadosDia = porDia[diaKey] || [];
          const esHoy = diaKey === hoyStr;
          const esPasado = new Date(calMes.year, calMes.month, d) < hoy;
          const tieneVencidos = esPasado && fiadosDia.length > 0;

          celdas.push(
            <button
              key={diaKey}
              onClick={() => fiadosDia.length > 0 && setCalDiaSeleccionado(calDiaSeleccionado === diaKey ? null : diaKey)}
              className={cn(
                "p-1 min-h-[50px] rounded-lg text-center transition-colors relative",
                esHoy && "ring-2 ring-[var(--data-success-500)]",
                tieneVencidos && "bg-[color-mix(in_oklch,var(--data-error)_8%,transparent)]",
                fiadosDia.length > 0 && "cursor-pointer hover:bg-[var(--surface-sunken)]",
                calDiaSeleccionado === diaKey && "bg-[color-mix(in_oklch,var(--accent)_12%,transparent)]",
              )}
            >
              <span
                className={cn(
                  "text-xs font-bold",
                  esHoy ? "text-[var(--data-success-500)]" : "text-[var(--text-primary)]",
                )}
              >
                {d}
              </span>
              {fiadosDia.length > 0 && (
                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      tieneVencidos ? "bg-[var(--data-error-500)]" : "bg-[var(--data-warning-500)]",
                    )}
                  />
                  <span className="text-xs font-bold text-[var(--text-secondary)]">{fiadosDia.length}</span>
                </div>
              )}
            </button>
          );
        }

        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[var(--text-primary)]" /> Calendario de Vencimientos
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Este mes: {countMes} fiados vencen · Total: {formatCurrency(totalMes)}
              </p>
            </div>
            <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden p-3">
              {/* Nav */}
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setCalMes(p => { const d = new Date(p.year, p.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                  className="p-1 rounded-lg hover:bg-[var(--surface-sunken)]"
                >
                  <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
                <p className="text-sm font-bold text-[var(--text-primary)] capitalize">{mesNombre}</p>
                <button
                  onClick={() => setCalMes(p => { const d = new Date(p.year, p.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                  className="p-1 rounded-lg hover:bg-[var(--surface-sunken)]"
                >
                  <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
              {/* Header dias */}
              <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map(d => (
                  <div key={d} className="text-center text-xs font-bold text-[var(--text-tertiary)] py-1">{d}</div>
                ))}
              </div>
              {/* Grid dias */}
              <div className="grid grid-cols-7 gap-0.5">{celdas}</div>
              {sinVence > 0 && (
                <p className="text-xs text-[var(--data-warning-500)] mt-2 text-center">
                  {sinVence} fiados activos sin fecha de vencimiento
                </p>
              )}
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
                        const cleanPhone = f.customerId.replace(/\D/g, "");
                        const msg = `Hola ${f.customerName || f.customerId}, te recordamos que tienes un pendiente de S/${Number(f.saldo).toFixed(2)} en Buleje.`;
                        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
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
