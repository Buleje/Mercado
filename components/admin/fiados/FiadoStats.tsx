"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useMemo } from "react";
import {
  DollarSign, Calendar, AlertTriangle, CreditCard,
  CheckCircle2, TrendingUp, Shield, MessageCircle,
  ChevronLeft, ChevronRight, Search, Plus, Clock, XCircle, Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

type FiadoStatus = "ACTIVO" | "PAGADO" | "VENCIDO" | "CANCELADO";

const STATUS_META: Record<FiadoStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  ACTIVO:    { label: "Activo",    color: "text-amber-700 dark:text-amber-400",   bg: "bg-amber-100 dark:bg-amber-900/30",   icon: Clock },
  PAGADO:    { label: "Pagado",    color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", icon: CheckCircle2 },
  VENCIDO:   { label: "Vencido",   color: "text-red-700 dark:text-red-400",       bg: "bg-red-100 dark:bg-red-900/30",       icon: XCircle },
  CANCELADO: { label: "Cancelado", color: "text-gray-600 dark:text-gray-400",     bg: "bg-gray-100 dark:bg-gray-800/50",     icon: Ban },
};

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }

export default function FiadoStats({ fiados, loading, totalSaldo, tendenciaMorosidad, proyeccionCobro, fiadoMasAntiguo, pagosEstaSemana, mejorPagadorMes, openDetail, search, setSearch, setSelected, statusFilter, setStatusFilter, FiadoTendenciaCobro }: any) {
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
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4">
            {/* KPI inline */}
            <div className="flex gap-4 overflow-x-auto flex-1 scrollbar-hide">
              <div className="flex items-center gap-1.5 shrink-0">
                <DollarSign className="h-3.5 w-3.5 text-[#00B4A6]" />
                <span className="text-xs text-gray-500">Total:</span>
                <span className="text-xs font-mono font-bold text-gray-900 dark:text-white">{formatCurrency(totalPendienteKpi)}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs text-gray-500">Cobrado:</span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(cobradoHoyKpi)}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs text-gray-500">Vencidos:</span>
                <span className={cn("text-xs font-mono font-bold", vencidosCountKpi > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white")}>{vencidosCountKpi}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <TrendingUp className="h-3.5 w-3.5 text-[#f97316]" />
                <span className="text-xs text-gray-500">Tasa:</span>
                <span className="text-xs font-mono font-bold text-gray-900 dark:text-white">{tasaRecupKpi.toFixed(1)}%</span>
              </div>
            </div>
            {/* Pills semaforo */}
            <div className="flex gap-1.5 shrink-0 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {alDiaC}
              </span>
              {porVencerC > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> {porVencerC}
                </span>
              )}
              {vencidoC > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {vencidoC}
                </span>
              )}
              {bloqueadoC > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-700 dark:bg-gray-500" /> {bloqueadoC}
                </span>
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
          <div className="rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-700 dark:text-white">Cobro del mes: {formatCurrency(cobrado)} de {formatCurrency(meta)} ({pct}%)</span>
              {pct > 80 ? (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Casi todo cobrado!</span>
              ) : pct < 30 ? (
                <span className="text-xs font-bold text-red-600 dark:text-red-400">Falta mucho por cobrar</span>
              ) : null}
            </div>
            <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2">
              <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct > 80 ? "#22c55e" : pct < 30 ? "#ef4444" : "#00B4A6" }} />
            </div>
          </div>
        );
      })()}

      {/* Mejora 19 (ronda 3): Proyeccion de cobro */}
      {!loading && fiados.length > 0 && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-[#00B4A6]" />
            <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Proyeccion de cobro</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="text-center">
              <p className="text-lg font-extrabold text-[#00B4A6]">{formatCurrency(proyeccionCobro.cobradoHoy)}</p>
              <p className="text-[10px] text-gray-400 dark:text-muted uppercase">Cobrado hoy</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold text-gray-900 dark:text-white">{formatCurrency(proyeccionCobro.cobradoSemana)}</p>
              <p className="text-[10px] text-gray-400 dark:text-muted uppercase">Esta semana</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold text-amber-600">{formatCurrency(proyeccionCobro.promedioDiario)}</p>
              <p className="text-[10px] text-gray-400 dark:text-muted uppercase">Promedio/dia</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-extrabold text-red-600">{formatCurrency(proyeccionCobro.totalPendiente)}</p>
              <p className="text-[10px] text-gray-400 dark:text-muted uppercase">Pendiente</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 mb-2">
            <div className="h-2 rounded-full transition-all bg-[#00B4A6]" style={{ width: `${Math.min(100, proyeccionCobro.pctRecuperado)}%` }} />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {proyeccionCobro.promedioDiario > 0 ? (
              <>Si cobras <span className="font-bold text-[#00B4A6]">{formatCurrency(proyeccionCobro.promedioDiario)}/dia</span>, recuperas todo en <span className="font-bold">{proyeccionCobro.diasRestantes} dias</span></>
            ) : (
              <span className="text-amber-600 font-bold">Aun no has cobrado esta semana — empieza hoy!</span>
            )}
          </p>
        </div>
      )}

      {/* Mejora QW-11g: Fiados agrupados por zona/tipo */}
      {!loading && fiados.length > 0 && (() => {
        // Agrupar por prefijo del nombre (zona aproximada)
        const TAG_MAP: Record<string, { emoji: string; color: string; bg: string }> = {
          restaurante: { emoji: "\uD83C\uDF7D\uFE0F", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" },
          vecino: { emoji: "\uD83C\uDFE0", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30" },
          mayorista: { emoji: "\uD83D\uDCE6", color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
          otro: { emoji: "\uD83D\uDC64", color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-100 dark:bg-zinc-700" },
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
                <button key={tag} onClick={() => setSearch(tag === "vecino" ? "" : tag.slice(0, 5))}
                  className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors hover:opacity-80", meta.bg, meta.color)}>
                  {meta.emoji} {tag.charAt(0).toUpperCase() + tag.slice(1)}: {formatCurrency(data.saldo)} ({data.count})
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Mejora P-9: Clientes que pagaron esta semana */}
      {!loading && pagosEstaSemana.total > 0 && (
        <div className={cn(
          "rounded-xl px-4 py-2.5 text-xs font-bold",
          pagosEstaSemana.pagaron === pagosEstaSemana.total
            ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30"
            : pagosEstaSemana.pagaron > pagosEstaSemana.total / 2
            ? "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/20"
            : "bg-gray-50 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700"
        )}>
          {pagosEstaSemana.pagaron === pagosEstaSemana.total
            ? `Todos al dia! (${pagosEstaSemana.total} clientes)`
            : pagosEstaSemana.pagaron > pagosEstaSemana.total / 2
            ? `Mas de la mitad ya pago! ${pagosEstaSemana.pagaron} de ${pagosEstaSemana.total} clientes esta semana`
            : `${pagosEstaSemana.pagaron} de ${pagosEstaSemana.total} clientes ya pagaron esta semana`}
        </div>
      )}

      {/* Mejora P-10: Mejor pagador del mes */}
      {!loading && mejorPagadorMes && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 px-4 py-2.5 flex items-center gap-2">
          <span className="text-sm">🌟</span>
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
            Mejor pagador: {mejorPagadorMes.nombre} — {formatCurrency(mejorPagadorMes.total)} este mes
          </span>
        </div>
      )}

      {/* Mejora QW-7: Fiado mas antiguo destacado */}
      {fiadoMasAntiguo && (
        <div className="rounded-xl border border-red-200 dark:border-red-800/30 bg-red-50 dark:bg-red-900/20 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">Fiado mas antiguo</p>
            <p className="text-sm text-red-800 dark:text-red-300 mt-0.5 truncate">
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
                className="text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                Cobrar ahora
              </a>
            )}
            <button
              onClick={() => setSelected(fiadoMasAntiguo)}
              className="text-xs font-bold text-red-600 hover:underline px-2 py-1.5"
            >
              Ver detalle
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 flex gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por cliente..."
              aria-label="Buscar fiados"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/30"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowQuickClient(true)}
            className="shrink-0 h-[38px] w-[38px] flex items-center justify-center rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-[#00B4A6] hover:text-white hover:border-[#00B4A6] text-gray-500 transition-colors"
            title="Crear cliente rapido"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {(["", "ACTIVO", "PAGADO", "VENCIDO", "CANCELADO"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors",
                statusFilter === s
                  ? "bg-[#00B4A6] text-white"
                  : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10"
              )}
            >
              {s === "" ? "Todos" : STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Mejora 16: Gráfica de cobro mensual */}
      <FiadoTendenciaCobro />

      {/* Mejora 19: Ranking de deudores por riesgo */}
      {(() => {
        const activos = fiados.filter(f => (f.status === "ACTIVO" || f.status === "VENCIDO") && f.saldo > 0);
        if (activos.length === 0) {
          return (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 text-center">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Sin deudores pendientes — Excelente!</p>
            </div>
          );
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const scored = activos.map(f => {
          const vence = f.fechaVence ? new Date(f.fechaVence) : null;
          const diasVencido = vence ? Math.max(0, Math.floor((now.getTime() - new Date(vence).getTime()) / (1000 * 60 * 60 * 24))) : 0;
          const riskScore = f.saldo * (1 + diasVencido / 10);
          let riskLevel: "ALTO" | "MEDIO" | "BAJO" = "BAJO";
          if (f.saldo > 200 && diasVencido > 30) riskLevel = "ALTO";
          else if (f.saldo > 100 || diasVencido > 15) riskLevel = "MEDIO";
          return { ...f, diasVencido, riskScore, riskLevel };
        }).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);

        const riskColors = {
          ALTO: { bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-200 dark:border-red-800", text: "text-red-700 dark:text-red-400", badge: "bg-red-100 text-red-700" },
          MEDIO: { bg: "bg-amber-50 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-400", badge: "bg-amber-100 text-amber-700" },
          BAJO: { bg: "bg-emerald-50 dark:bg-emerald-950/20", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-400", badge: "bg-emerald-100 text-emerald-700" },
        };

        return (
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-red-500" /> Top Deudores por Riesgo
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {scored.map(f => {
                const colors = riskColors[f.riskLevel];
                return (
                  <div
                    key={f.id}
                    className={cn("rounded-xl border p-3 cursor-pointer hover:shadow-md transition-shadow", colors.bg, colors.border)}
                    onClick={() => openDetail(f)}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{f.customerName || f.customerId}</p>
                      <span className={cn("text-[9px] font-extrabold px-1.5 py-0.5 rounded-full", colors.badge)}>
                        {f.riskLevel}
                      </span>
                    </div>
                    <p className={cn("text-sm font-extrabold", colors.text)}>
                      {formatCurrency(f.saldo)}
                      {f.diasVencido > 0 && <span className="text-[10px] font-normal ml-1">· {f.diasVencido}d vencido</span>}
                    </p>
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          openDetail(f);
                        }}
                        className="flex-1 text-[10px] font-bold text-center py-1 rounded-lg bg-white/80 dark:bg-white/10 text-gray-700 dark:text-foreground hover:bg-white transition-colors"
                      >
                        Cobrar
                      </button>
                      {f.customerId && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            const nombre = f.customerName || f.customerId;
                            const msg = `Hola ${nombre}, te recordamos que tienes un pendiente de S/${f.saldo.toFixed(2)} en Buleje. Cuando puedas pasa a regularizarlo!`;
                            const cleanPhone = f.customerId.replace(/\D/g, "");
                            window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
                          }}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
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
                esHoy ? "ring-2 ring-blue-500" : "",
                tieneVencidos ? "bg-red-50 dark:bg-red-950/20" : "",
                fiadosDia.length > 0 ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5" : "",
                calDiaSeleccionado === diaKey ? "bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20" : ""
              )}
            >
              <span className={cn("text-xs font-bold", esHoy ? "text-blue-600" : "text-gray-700 dark:text-gray-300")}>{d}</span>
              {fiadosDia.length > 0 && (
                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                  <span className={cn("w-2 h-2 rounded-full", tieneVencidos ? "bg-red-500" : "bg-amber-500")} />
                  <span className="text-[9px] font-bold text-gray-500">{fiadosDia.length}</span>
                </div>
              )}
            </button>
          );
        }

        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[#00B4A6]" /> Calendario de Vencimientos
              </p>
              <p className="text-xs text-gray-500">
                Este mes: {countMes} fiados vencen · Total: {formatCurrency(totalMes)}
              </p>
            </div>
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-sm overflow-hidden p-3">
              {/* Nav */}
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setCalMes(p => { const d = new Date(p.year, p.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; })} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                  <ChevronLeft className="h-4 w-4 text-gray-500" />
                </button>
                <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{mesNombre}</p>
                <button onClick={() => setCalMes(p => { const d = new Date(p.year, p.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; })} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              {/* Header dias */}
              <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                {["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-1">{d}</div>
                ))}
              </div>
              {/* Grid dias */}
              <div className="grid grid-cols-7 gap-0.5">
                {celdas}
              </div>
              {sinVence > 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 text-center">{sinVence} fiados activos sin fecha de vencimiento</p>
              )}
            </div>
            {/* Detalle del dia seleccionado */}
            {calDiaSeleccionado && porDia[calDiaSeleccionado] && (
              <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 space-y-2">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  Fiados que vencen el {new Date(calDiaSeleccionado).toLocaleDateString("es-PE", { day: "2-digit", month: "long" })}
                </p>
                {porDia[calDiaSeleccionado].map(f => (
                  <div key={f.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{f.customerName || f.customerId}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(f.saldo)}</p>
                    </div>
                    <button
                      onClick={() => {
                        const cleanPhone = f.customerId.replace(/\D/g, "");
                        const msg = `Hola ${f.customerName || f.customerId}, te recordamos que tienes un pendiente de S/${f.saldo.toFixed(2)} en Buleje.`;
                        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
                      }}
                      className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
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
