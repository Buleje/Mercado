"use client";

import { CardTitle, DataTable } from "@buleje/design-system";
import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  Calculator, Download, X, Eye,
  CheckCircle2, AlertTriangle, TrendingDown, TrendingUp,
  Banknote, Coins, Info, RefreshCw, ExternalLink, PlusCircle,
} from "@buleje/design-system/icons";
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
  pendiente: { label: "Pendiente", color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", icon: AlertTriangle },
  conforme:  { label: "Conforme",  color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: CheckCircle2 },
  sobrante:  { label: "Sobrante",  color: "text-[var(--data-success-500)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: TrendingUp },
  faltante:  { label: "Faltante",  color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30", icon: TrendingDown },
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
      <button type="button" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="text-[var(--text-tertiary)] hover:text-primary transition-colors focus:outline-none" aria-label="Ayuda">
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-6 top-0 z-50 w-72 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 text-xs leading-relaxed pointer-events-none">
          <p className="font-bold text-[var(--text-primary)] dark:text-foreground mb-2 text-sm flex items-center gap-1.5"><Calculator className="h-4 w-4 text-primary" /> ¿Qué es Cuadrar la Caja?</p>
          <p className="text-[var(--text-secondary)] dark:text-muted mb-3">Compara el <strong>dinero que debería haber</strong> (fondo + ventas en efectivo) con el <strong>dinero que realmente cuentas</strong> al cerrar cada turno.</p>
          <p className="font-semibold text-[var(--text-primary)] dark:text-foreground mb-1">Ejemplo:</p>
          <p className="text-[var(--text-secondary)] dark:text-muted mb-3">Valentina abre caja con S/200. Vende S/350 en efectivo. Al cerrar se esperan S/550. Si cuenta S/540 → <span className="text-[var(--data-error-500)] font-semibold">faltante S/10</span>.</p>
          <div className="space-y-1 border-t border-[var(--rule-soft)] dark:border-card-border pt-2">
            <p className="text-[var(--text-secondary)] dark:text-muted"><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">Tarjetas</span> — resumen global de todos los arqueos.</p>
            <p className="text-[var(--text-secondary)] dark:text-muted"><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">Tabla</span> — cada fila = un turno cerrado con su diferencia.</p>
            <p className="text-[var(--text-secondary)] dark:text-muted"><span className="font-semibold text-[var(--text-primary)] dark:text-foreground">Ver detalle</span> — turno y desglose de billetes.</p>
          </div>
          <p className="mt-2 text-[var(--text-tertiary)] italic">Los cuadres se generan automáticamente al cerrar turnos en <strong>Control de Turnos</strong>.</p>
        </div>
      )}
    </div>
  );
}

// ── Cash Counter ──────────────────────────────────────────────────────────────

const BILLETES: { value: number; label: string }[] = [
  { value: 200, label: "S/ 200" },
  { value: 100, label: "S/ 100" },
  { value: 50,  label: "S/ 50"  },
  { value: 20,  label: "S/ 20"  },
  { value: 10,  label: "S/ 10"  },
];
const MONEDAS: { value: number; label: string }[] = [
  { value: 5,    label: "S/ 5"    },
  { value: 2,    label: "S/ 2"    },
  { value: 1,    label: "S/ 1"    },
  { value: 0.50, label: "S/ 0.50" },
  { value: 0.20, label: "S/ 0.20" },
  { value: 0.10, label: "S/ 0.10" },
];

type CounterState = Record<string, number>;

function makeKey(type: "billete" | "moneda", value: number) {
  return `${type}-${value}`;
}

function CashCounter({
  expectedAmount,
  registerId,
  onSaved,
}: {
  expectedAmount: number;
  registerId?: string | null;
  onSaved?: () => void;
}) {
  const [counts, setCounts] = useState<CounterState>({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const counted = useMemo(() => {
    let total = 0;
    for (const b of BILLETES) total += (counts[makeKey("billete", b.value)] ?? 0) * b.value;
    for (const m of MONEDAS)  total += (counts[makeKey("moneda", m.value)] ?? 0) * m.value;
    return Math.round(total * 100) / 100;
  }, [counts]);

  const difference = Math.round((counted - expectedAmount) * 100) / 100;
  const hasCount   = Object.values(counts).some(v => v > 0);

  function setCount(key: string, raw: string) {
    const v = Math.max(0, parseInt(raw, 10) || 0);
    setCounts(prev => ({ ...prev, [key]: v }));
  }

  async function handleSaveArqueo() {
    if (!registerId) {
      setFeedback({ kind: "err", msg: "No hay caja registradora abierta para arquear." });
      return;
    }
    if (!hasCount) {
      setFeedback({ kind: "err", msg: "Contá al menos una denominación antes de guardar." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const { csrfHeaders } = await import("@/lib/csrf-client");
      const res = await fetch(`/api/cash-registers/${registerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({
          action: "arqueo",
          closingAmount: counted,
          notes: `Conteo manual: contado S/${counted.toFixed(2)}, esperado S/${expectedAmount.toFixed(2)}, diferencia S/${difference.toFixed(2)}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setFeedback({ kind: "ok", msg: `Arqueo guardado · diferencia ${difference >= 0 ? "+" : ""}S/${difference.toFixed(2)}` });
      onSaved?.();
    } catch (err) {
      setFeedback({ kind: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-sunken)] dark:hover:bg-surface/50 transition-colors"
      >
        <span className="flex items-center gap-2.5 text-[var(--text-primary)] dark:text-foreground">
          <div className="h-8 w-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
            <Coins className="h-4 w-4 text-primary" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="text-left">
            <span className="block font-bold text-sm">Conteo de efectivo manual</span>
            <span className="block text-xs text-[var(--text-tertiary)] mt-0.5">Contador por denominación para validar caja en vivo</span>
          </div>
        </span>
        <PlusCircle className={cn("h-4 w-4 text-primary transition-transform shrink-0", open && "rotate-45")} strokeWidth={1.75} aria-hidden />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--rule-soft)] dark:border-card-border pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Billetes */}
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-2 flex items-center gap-1">
                <Banknote className="h-4 w-4" /> Billetes
              </p>
              <DataTable>
                <thead>
                  <tr>
                    <th>Denominación</th>
                    <th className="text-center">Cantidad</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {BILLETES.map(b => {
                    const key = makeKey("billete", b.value);
                    const qty = counts[key] ?? 0;
                    return (
                      <tr key={key}>
                        <td className="py-1.5 font-semibold text-[var(--text-primary)] dark:text-foreground">{b.label}</td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            min={0}
                            value={qty || ""}
                            onChange={e => setCount(key, e.target.value)}
                            placeholder="0"
                            className="w-16 text-center text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2 py-1 bg-white dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </td>
                        <td className="py-1.5 text-right font-bold text-[var(--text-primary)] dark:text-foreground">
                          {qty > 0 ? fmt(qty * b.value) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>

            {/* Monedas */}
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-2 flex items-center gap-1">
                <Coins className="h-4 w-4" /> Monedas
              </p>
              <DataTable>
                <thead>
                  <tr>
                    <th>Denominación</th>
                    <th className="text-center">Cantidad</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {MONEDAS.map(m => {
                    const key = makeKey("moneda", m.value);
                    const qty = counts[key] ?? 0;
                    return (
                      <tr key={key}>
                        <td className="py-1.5 font-semibold text-[var(--text-primary)] dark:text-foreground">{m.label}</td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            min={0}
                            value={qty || ""}
                            onChange={e => setCount(key, e.target.value)}
                            placeholder="0"
                            className="w-16 text-center text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2 py-1 bg-white dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </td>
                        <td className="py-1.5 text-right font-bold text-[var(--text-primary)] dark:text-foreground">
                          {qty > 0 ? fmt(qty * m.value) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--rule-soft)] dark:border-card-border">
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 text-center">
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-semibold uppercase">Esperado</p>
              <p className="font-extrabold text-[var(--text-primary)] dark:text-foreground text-sm">{fmt(expectedAmount)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-3 text-center">
              <p className="text-xs text-[var(--text-tertiary)] dark:text-muted font-semibold uppercase">Contado</p>
              <p className={cn("font-extrabold text-sm", hasCount ? "text-[var(--text-primary)] dark:text-foreground" : "text-[var(--text-tertiary)]")}>
                {hasCount ? fmt(counted) : "—"}
              </p>
            </div>
            <div className={cn(
              "rounded-xl p-3 text-center",
              !hasCount ? "bg-gray-50 dark:bg-surface" :
              difference === 0 ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" :
              difference > 0 ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" :
              "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20"
            )}>
              <p className="text-xs font-semibold uppercase text-[var(--text-tertiary)] dark:text-muted">Diferencia</p>
              <p className={cn(
                "font-extrabold text-sm",
                !hasCount ? "text-[var(--text-tertiary)]" :
                difference === 0 ? "text-[var(--data-success-500)]" :
                difference > 0 ? "text-[var(--data-success-500)]" :
                "text-[var(--data-error-500)]"
              )}>
                {hasCount
                  ? (difference === 0
                      ? "Conforme"
                      : (difference > 0 ? "+" : "") + fmt(difference) + (difference > 0 ? " sobrante" : " faltante"))
                  : "—"}
              </p>
            </div>
          </div>

          {feedback && (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "text-sm font-semibold rounded-lg px-3 py-2",
                feedback.kind === "ok"
                  ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                  : "bg-[var(--data-error-50)] text-[var(--data-error-500)]"
              )}
            >
              {feedback.msg}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveArqueo}
              disabled={saving || !hasCount || !registerId}
              aria-disabled={saving || !hasCount || !registerId}
              title={!registerId ? "No hay caja registradora abierta" : !hasCount ? "Contá al menos una denominación" : undefined}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Guardando…" : "Guardar arqueo"}
            </button>
            <button
              type="button"
              onClick={() => { setCounts({}); setFeedback(null); }}
              className="text-sm text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors px-3 py-2"
            >
              Limpiar conteo
            </button>
          </div>
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

  const inflightRef = useRef<AbortController | null>(null);
  const loadAudits = useCallback(() => {
    inflightRef.current?.abort();
    const ctrl = new AbortController();
    inflightRef.current = ctrl;
    fetch("/api/cash-registers", { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : [])
      .then((registers: CashRegisterRaw[]) => {
        if (inflightRef.current !== ctrl) return;
        const mapped = registers.map(mapRegisterToAudit);
        mapped.sort((a, b) => b.id.localeCompare(a.id));
        startTransition(() => {
          setAudits(mapped);
          setLoading(false);
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (inflightRef.current === ctrl) startTransition(() => setLoading(false));
      });
  }, []);

  useEffect(() => {
    loadAudits();
    return () => { inflightRef.current?.abort(); };
  }, [loadAudits]);

  const stats = useMemo(() => {
    const totalAudits = audits.length;
    const conformes = audits.filter(a => a.status === "conforme").length;
    const totalShortage = audits.filter(a => a.difference < 0).reduce((s, a) => s + Math.abs(a.difference), 0);
    const totalSurplus = audits.filter(a => a.difference > 0).reduce((s, a) => s + a.difference, 0);
    return { totalAudits, conformes, totalShortage, totalSurplus };
  }, [audits]);

  // Conteo de integridad de cuadres — % conformes vs total
  const pctConformes = stats.totalAudits > 0 ? Math.round((stats.conformes / stats.totalAudits) * 100) : 0;

  return (
    <div className="space-y-4">

      {/* Toolbar — acciones alineadas a la derecha */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ModuleTooltip />
          {onNavigateToTurnos && (
            <button onClick={onNavigateToTurnos} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors">
              <ExternalLink className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Ir a Turnos
            </button>
          )}
          <button onClick={() => { startTransition(() => setLoading(true)); loadAudits(); }} disabled={loading} aria-label="Refrescar" className="p-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-[var(--text-secondary)] hover:text-primary disabled:opacity-40 transition-colors">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} strokeWidth={1.75} aria-hidden />
          </button>
          <button onClick={() => exportToCSV(audits.map(a => ({ fecha: a.date, turno: a.shift, cajero: a.cashier, esperado: a.expectedAmount, contado: a.countedAmount, diferencia: a.difference, estado: STATUS_MAP[a.status].label, ventas: a.salesCount, cerrado_por: a.closedBy || "-" })), "arqueo-caja")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Descargar
          </button>
        </div>
      </div>

      {/* KPI cards — jerarquia de color coherente:
          - Totales / Tasa = neutral (no tiene semantica emocional)
          - Conformes / Sobrantes = success (positivo)
          - Faltantes = error (negativo) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Cuadres totales", value: String(stats.totalAudits), tone: "neutral" as const, icon: Calculator },
          { label: "Conformes", value: `${stats.conformes}${stats.totalAudits > 0 ? ` · ${pctConformes}%` : ""}`, tone: "success" as const, icon: CheckCircle2 },
          { label: "Total faltantes", value: fmt(stats.totalShortage), tone: "error" as const, icon: TrendingDown },
          { label: "Total sobrantes", value: fmt(stats.totalSurplus), tone: "success" as const, icon: TrendingUp },
        ].map(({ label, value, tone, icon: Icon }) => {
          const tones = {
            neutral: { bg: "bg-white dark:bg-card border border-[var(--rule-base)]", color: "text-[var(--text-primary)]", iconColor: "text-[var(--text-secondary)]" },
            success: { bg: "bg-[var(--accent-soft)] border border-[var(--data-success-500)]/20 dark:bg-[var(--accent-muted)]", color: "text-[var(--data-success-500)]", iconColor: "text-[var(--data-success-500)]" },
            error: { bg: "bg-[var(--data-error-50)] border border-[var(--data-error-500)]/20 dark:bg-red-950/30", color: "text-[var(--data-error-500)]", iconColor: "text-[var(--data-error-500)]" },
          }[tone];
          return (
            <div key={label} className={cn("rounded-xl p-4 flex items-start gap-3", tones.bg)}>
              <Icon className={cn("h-5 w-5 mt-0.5", tones.iconColor)} strokeWidth={1.75} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider font-bold text-[var(--text-tertiary)] truncate">{label}</p>
                <p className={cn("text-xl font-extrabold mt-0.5 tabular-nums", tones.color)}>{value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cash Counter */}
      <CashCounter
        expectedAmount={audits.length > 0 ? audits[0].expectedAmount : 0}
        registerId={audits.length > 0 ? audits[0].id : null}
        onSaved={loadAudits}
      />

      {/* Table */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : audits.length === 0 ? (
          <div className="p-12 text-center">
            <div className="h-12 w-12 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mx-auto mb-3">
              <Calculator className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
            </div>
            <CardTitle className="text-base font-semibold text-[var(--text-primary)] mb-1">Sin cuadres registrados</CardTitle>
            <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">Los cuadres se generan al cerrar turnos en Control de turnos.</p>
            {onNavigateToTurnos && (
              <button onClick={onNavigateToTurnos} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                Ir a Control de turnos →
              </button>
            )}
          </div>
        ) : (
          <DataTable className="min-w-[600px]">
            <thead><tr><th>Fecha</th><th>Turno</th><th>Cajero/a</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {audits.map(a => {
                const SIcon = STATUS_MAP[a.status].icon;
                return (
                  <tr key={a.id}>
                    <td className="font-bold text-[var(--text-primary)]">{a.date}</td>
                    <td className="text-xs text-[var(--text-secondary)] capitalize">{a.shift}</td>
                    <td className="font-bold text-[var(--text-primary)]">{a.cashier}</td>
                    <td className="text-[var(--text-secondary)]">{fmt(a.expectedAmount)}</td>
                    <td className="font-bold text-[var(--text-primary)]">{a.status !== "pendiente" ? fmt(a.countedAmount) : "—"}</td>
                    <td className={cn("font-extrabold", a.difference === 0 ? "text-[var(--text-tertiary)]" : a.difference > 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{a.status !== "pendiente" ? (a.difference > 0 ? "+" : "") + fmt(a.difference) : "—"}</td>
                    <td><span className={cn("flex items-center gap-1 text-xs font-bold", STATUS_MAP[a.status].color)}><SIcon className="h-4 w-4" />{STATUS_MAP[a.status].label}</span></td>
                    <td><button onClick={() => setDetail(a)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Cuadre — {detail.date} {detail.shift}</CardTitle>
                <p className="text-xs text-[var(--text-tertiary)]">{detail.cashier}{detail.closedBy ? ` · Cerrado por: ${detail.closedBy}` : " · Turno abierto"}</p>
              </div>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm text-center">
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><p className="text-xs text-[var(--text-tertiary)]">Esperado</p><p className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{fmt(detail.expectedAmount)}</p></div>
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><p className="text-xs text-[var(--text-tertiary)]">Contado</p><p className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{detail.status !== "pendiente" ? fmt(detail.countedAmount) : "-"}</p></div>
              <div className={cn("rounded-xl p-3", STATUS_MAP[detail.status].bg)}><p className="text-xs text-[var(--text-tertiary)]">Diferencia</p><p className={cn("font-extrabold", STATUS_MAP[detail.status].color)}>{detail.status !== "pendiente" ? (detail.difference > 0 ? "+" : "") + fmt(detail.difference) : "-"}</p></div>
            </div>

            {detail.denominations.length > 0 && (
              <div>
                <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground mb-2 flex items-center gap-1"><Coins className="h-4 w-4" /> Desglose de denominaciones</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {detail.denominations.filter(d => d.count > 0).map(d => (
                    <div key={`${d.type}-${d.value}`} className="flex items-center justify-between bg-gray-50 dark:bg-surface rounded-lg px-3 py-1.5 text-xs">
                      <span className="flex items-center gap-1 text-[var(--text-secondary)] dark:text-muted">
                        {d.type === "billete" ? <Banknote className="h-3 w-3" /> : <Coins className="h-3 w-3" />}
                        S/ {d.value < 1 ? Number(d.value).toFixed(2) : d.value}
                      </span>
                      <span className="font-bold text-[var(--text-primary)] dark:text-foreground">×{d.count} = {fmt(d.value * d.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.notes && <p className="text-xs text-[var(--text-tertiary)] italic">&quot;{detail.notes}&quot;</p>}
          </div>
        </div>
      )}
    </div>
  );
}
