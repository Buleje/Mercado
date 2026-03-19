"use client";

import { useState, useMemo, useEffect, startTransition } from "react";
import {
  Calculator, Download, X, Eye,
  CheckCircle2, AlertTriangle, TrendingDown, TrendingUp,
  Banknote, Coins, Info, RefreshCw, ExternalLink,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type AuditStatus = "pendiente" | "conforme" | "sobrante" | "faltante";

type CashDenomination = {
  type: "billete" | "moneda";
  value: number;
  count: number;
};

type CashAudit = {
  id: string;
  date: string;
  shift: string;
  cashier: string;
  expectedAmount: number;
  countedAmount: number;
  difference: number;
  status: AuditStatus;
  denominations: CashDenomination[];
  salesCount: number;
  closedBy: string;
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const STATUS_MAP: Record<AuditStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  pendiente: { label: "Pendiente", color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30", icon: AlertTriangle },
  conforme:  { label: "Conforme",  color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30", icon: CheckCircle2 },
  sobrante:  { label: "Sobrante",  color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30", icon: TrendingUp },
  faltante:  { label: "Faltante",  color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30", icon: TrendingDown },
};

type CashRegisterRaw = {
  id: string;
  openedAt: string;
  closedAt?: string | null;
  openingAmount: number;
  closingAmount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  status: string;
  notes?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; }
}
function shiftLabel(iso: string): string {
  try { const h = new Date(iso).getHours(); if (h >= 6 && h < 14) return "mañana"; if (h >= 14 && h < 20) return "tarde"; return "noche"; } catch { return "—"; }
}
function computeStatus(diff: number | null | undefined, counted: number | null | undefined): AuditStatus {
  if (counted == null) return "pendiente";
  if (diff == null) return "pendiente";
  if (Math.abs(diff) < 0.01) return "conforme";
  return diff > 0 ? "sobrante" : "faltante";
}
function mapRegisterToAudit(r: CashRegisterRaw): CashAudit {
  const [cashierName] = (r.notes ?? "").split(" (");
  const diff = r.difference ?? (r.closingAmount != null && r.expectedAmount != null ? r.closingAmount - r.expectedAmount : null);
  const status = computeStatus(diff, r.closingAmount);
  return {
    id: r.id, date: fmtDate(r.openedAt), shift: shiftLabel(r.openedAt),
    cashier: cashierName?.trim() || "Cajero",
    expectedAmount: r.expectedAmount ?? r.openingAmount,
    countedAmount: r.closingAmount ?? 0,
    difference: diff ?? 0, status, denominations: [], salesCount: 0,
    closedBy: r.closedAt ? (cashierName?.trim() || "Admin") : "",
    notes: status === "pendiente" ? "" : (r.notes ?? ""),
  };
}

// ── Info Tooltip ──────────────────────────────────────────────────────────────

function ModuleTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="text-gray-400 hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-50 w-72 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-xl p-4 text-xs leading-relaxed pointer-events-none">
          <p className="font-bold text-gray-900 dark:text-foreground mb-2 text-sm flex items-center gap-1.5"><Calculator className="h-4 w-4 text-primary" /> ¿Qué es el Arqueo de Caja?</p>
          <p className="text-gray-600 dark:text-muted mb-3">Compara el <strong>dinero esperado</strong> (fondo + ventas efectivo) con el <strong>dinero contado físicamente</strong> al cerrar cada turno.</p>
          <p className="font-semibold text-gray-700 dark:text-foreground mb-1">Ejemplo:</p>
          <p className="text-gray-500 dark:text-muted mb-3">Valentina abre caja con S/200. Vende S/350 en efectivo. Al cerrar se esperan S/550. Si cuenta S/540 → <span className="text-red-500 font-semibold">faltante S/10</span>.</p>
          <div className="space-y-1 border-t border-gray-100 dark:border-card-border pt-2">
            <p className="text-gray-500 dark:text-muted"><span className="font-semibold text-gray-700 dark:text-foreground">Tarjetas</span> — resumen global de todos los arqueos.</p>
            <p className="text-gray-500 dark:text-muted"><span className="font-semibold text-gray-700 dark:text-foreground">Tabla</span> — cada fila = un turno cerrado con su diferencia.</p>
            <p className="text-gray-500 dark:text-muted"><span className="font-semibold text-gray-700 dark:text-foreground">Ojo (👁)</span> — detalle del turno y desglose de billetes.</p>
          </div>
          <p className="mt-2 text-gray-400 italic">Los arqueos se generan automáticamente al cerrar turnos en <strong>Control de Turnos</strong>.</p>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = { onNavigateToTurnos?: () => void };

export default function CashAuditTab({ onNavigateToTurnos }: Props) {
  const [detail, setDetail] = useState<CashAudit | null>(null);
  const [audits, setAudits] = useState<CashAudit[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAudits = () => {
    fetch("/api/cash-registers")
      .then(r => r.ok ? r.json() : [])
      .then((registers: CashRegisterRaw[]) => {
        const mapped = registers.map(mapRegisterToAudit);
        mapped.sort((a, b) => b.id.localeCompare(a.id));
        startTransition(() => {
          setAudits(mapped);
          setLoading(false);
        });
      })
      .catch(() => startTransition(() => setLoading(false)));
  };

  useEffect(() => { loadAudits(); }, []);

  const stats = useMemo(() => {
    const totalAudits = audits.length;
    const conformes = audits.filter(a => a.status === "conforme").length;
    const totalShortage = audits.filter(a => a.difference < 0).reduce((s, a) => s + Math.abs(a.difference), 0);
    const totalSurplus = audits.filter(a => a.difference > 0).reduce((s, a) => s + a.difference, 0);
    return { totalAudits, conformes, totalShortage, totalSurplus };
  }, [audits]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" /> Arqueo de Caja Digital
            <ModuleTooltip />
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Conteo automático, discrepancias y cierre de turno</p>
        </div>
        <div className="flex items-center gap-2">
          {onNavigateToTurnos && (
            <button onClick={onNavigateToTurnos} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors">
              <ExternalLink className="h-4 w-4" /> Ir a Turnos
            </button>
          )}
          <button onClick={() => { startTransition(() => setLoading(true)); loadAudits(); }} disabled={loading} className="p-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-500 hover:text-primary disabled:opacity-40 transition-colors">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button onClick={() => exportToCSV(audits.map(a => ({ fecha: a.date, turno: a.shift, cajero: a.cashier, esperado: a.expectedAmount, contado: a.countedAmount, diferencia: a.difference, estado: STATUS_MAP[a.status].label, ventas: a.salesCount, cerrado_por: a.closedBy || "-" })), "arqueo-caja")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Arqueos totales", value: String(stats.totalAudits), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", icon: Calculator },
          { label: "Conformes", value: String(stats.conformes), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: CheckCircle2 },
          { label: "Total faltantes", value: fmt(stats.totalShortage), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", icon: TrendingDown },
          { label: "Total sobrantes", value: fmt(stats.totalSurplus), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", icon: TrendingUp },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-2xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : audits.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-muted">
            <Calculator className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No hay arqueos registrados aún.</p>
            {onNavigateToTurnos && (
              <button onClick={onNavigateToTurnos} className="mt-2 text-primary hover:underline font-semibold text-xs">Ir a Control de Turnos para abrir el primer turno →</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Turno</th><th className="px-4 py-3">Cajero/a</th><th className="px-4 py-3">Esperado</th><th className="px-4 py-3">Contado</th><th className="px-4 py-3">Diferencia</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr></thead>
              <tbody>
                {audits.map(a => {
                  const SIcon = STATUS_MAP[a.status].icon;
                  return (
                    <tr key={a.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20">
                      <td className="px-4 py-3 font-bold text-gray-800 dark:text-foreground">{a.date}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-muted capitalize">{a.shift}</td>
                      <td className="px-4 py-3 font-bold text-gray-800 dark:text-foreground">{a.cashier}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-muted">{fmt(a.expectedAmount)}</td>
                      <td className="px-4 py-3 font-bold text-gray-800 dark:text-foreground">{a.status !== "pendiente" ? fmt(a.countedAmount) : "—"}</td>
                      <td className={cn("px-4 py-3 font-extrabold", a.difference === 0 ? "text-gray-400" : a.difference > 0 ? "text-blue-600" : "text-red-600")}>{a.status !== "pendiente" ? (a.difference > 0 ? "+" : "") + fmt(a.difference) : "—"}</td>
                      <td className="px-4 py-3"><span className={cn("flex items-center gap-1 text-xs font-bold", STATUS_MAP[a.status].color)}><SIcon className="h-3.5 w-3.5" />{STATUS_MAP[a.status].label}</span></td>
                      <td className="px-4 py-3"><button onClick={() => setDetail(a)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">Arqueo — {detail.date} {detail.shift}</h3>
                <p className="text-xs text-gray-400">{detail.cashier}{detail.closedBy ? ` · Cerrado por: ${detail.closedBy}` : " · Turno abierto"}</p>
              </div>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm text-center">
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><p className="text-xs text-gray-400">Esperado</p><p className="font-extrabold text-gray-800 dark:text-foreground">{fmt(detail.expectedAmount)}</p></div>
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><p className="text-xs text-gray-400">Contado</p><p className="font-extrabold text-gray-800 dark:text-foreground">{detail.status !== "pendiente" ? fmt(detail.countedAmount) : "-"}</p></div>
              <div className={cn("rounded-xl p-3", STATUS_MAP[detail.status].bg)}><p className="text-xs text-gray-400">Diferencia</p><p className={cn("font-extrabold", STATUS_MAP[detail.status].color)}>{detail.status !== "pendiente" ? (detail.difference > 0 ? "+" : "") + fmt(detail.difference) : "-"}</p></div>
            </div>

            {detail.denominations.length > 0 && (
              <div>
                <h4 className="font-bold text-sm text-gray-700 dark:text-foreground mb-2 flex items-center gap-1"><Coins className="h-4 w-4" /> Desglose de denominaciones</h4>
                <div className="grid grid-cols-2 gap-1">
                  {detail.denominations.filter(d => d.count > 0).map(d => (
                    <div key={`${d.type}-${d.value}`} className="flex items-center justify-between bg-gray-50 dark:bg-surface rounded-lg px-3 py-1.5 text-xs">
                      <span className="flex items-center gap-1 text-gray-600 dark:text-muted">
                        {d.type === "billete" ? <Banknote className="h-3 w-3" /> : <Coins className="h-3 w-3" />}
                        S/ {d.value < 1 ? d.value.toFixed(2) : d.value}
                      </span>
                      <span className="font-bold text-gray-800 dark:text-foreground">×{d.count} = {fmt(d.value * d.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.notes && <p className="text-xs text-gray-400 italic">&quot;{detail.notes}&quot;</p>}
          </div>
        </div>
      )}
    </div>
  );
}
