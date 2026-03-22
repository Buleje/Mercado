"use client";

import { useState, useMemo } from "react";
import {
  Scale, Download, TrendingUp, TrendingDown, Info, X,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountType = "activo-corriente" | "activo-no-corriente" | "pasivo-corriente" | "pasivo-no-corriente" | "patrimonio";

type AccountLine = {
  id: string;
  name: string;
  type: AccountType;
  currentPeriod: number;
  previousPeriod: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(n: number) { return `${n.toFixed(1)}%`; }
function variation(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

const TYPE_LABELS: Record<AccountType, string> = {
  "activo-corriente": "Activo Corriente",
  "activo-no-corriente": "Activo No Corriente",
  "pasivo-corriente": "Pasivo Corriente",
  "pasivo-no-corriente": "Pasivo No Corriente",
  patrimonio: "Patrimonio",
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: AccountLine[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function BalanceSheetTab() {
  const [accounts] = useState<AccountLine[]>(SEED);
  const [showInfo, setShowInfo] = useState(false);

  const grouped = useMemo(() => {
    const map: Record<AccountType, AccountLine[]> = {
      "activo-corriente": [], "activo-no-corriente": [],
      "pasivo-corriente": [], "pasivo-no-corriente": [],
      patrimonio: [],
    };
    accounts.forEach(a => map[a.type].push(a));
    return map;
  }, [accounts]);

  const totals = useMemo(() => {
    const sum = (type: AccountType) => ({
      current: accounts.filter(a => a.type === type).reduce((s, a) => s + a.currentPeriod, 0),
      previous: accounts.filter(a => a.type === type).reduce((s, a) => s + a.previousPeriod, 0),
    });
    const ac = sum("activo-corriente");
    const anc = sum("activo-no-corriente");
    const pc = sum("pasivo-corriente");
    const pnc = sum("pasivo-no-corriente");
    const pat = sum("patrimonio");

    const totalActivos = { current: ac.current + anc.current, previous: ac.previous + anc.previous };
    const totalPasivos = { current: pc.current + pnc.current, previous: pc.previous + pnc.previous };
    const totalPasPat = { current: totalPasivos.current + pat.current, previous: totalPasivos.previous + pat.previous };

    // Ratios
    const liquidezCorriente = pc.current > 0 ? ac.current / pc.current : 0;
    const pruebaAcida = pc.current > 0 ? (ac.current - (accounts.find(a => a.id === "ac3")?.currentPeriod ?? 0)) / pc.current : 0;
    const endeudamiento = totalActivos.current > 0 ? (totalPasivos.current / totalActivos.current) * 100 : 0;
    const capitalTrabajo = ac.current - pc.current;
    const roe = pat.current > 0 ? ((accounts.find(a => a.id === "pt3")?.currentPeriod ?? 0) / pat.current) * 100 : 0;

    return { ac, anc, pc, pnc, pat, totalActivos, totalPasivos, totalPasPat, liquidezCorriente, pruebaAcida, endeudamiento, capitalTrabajo, roe };
  }, [accounts]);

  function renderSection(type: AccountType, lines: AccountLine[]) {
    const subTotal = lines.reduce((s, l) => s + l.currentPeriod, 0);
    const subPrev = lines.reduce((s, l) => s + l.previousPeriod, 0);
    return (
      <div key={type}>
        <h4 className="text-xs font-extrabold uppercase text-gray-500 dark:text-muted px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-50 dark:bg-surface/50 border-b border-gray-200 dark:border-card-border">
          {TYPE_LABELS[type]}
        </h4>
        {lines.map(l => {
          const v = variation(l.currentPeriod, l.previousPeriod);
          return (
            <div key={l.id} className="flex items-center px-2 sm:px-4 py-1.5 sm:py-2.5 border-b border-gray-100 dark:border-card-border hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors text-sm">
              <span className="flex-1 text-gray-700 dark:text-foreground">{l.name}</span>
              <span className="w-28 text-right font-semibold text-gray-800 dark:text-foreground">{fmt(l.currentPeriod)}</span>
              <span className="w-28 text-right text-gray-400">{fmt(l.previousPeriod)}</span>
              <span className={cn("w-20 text-right text-xs font-bold flex items-center justify-end gap-0.5", v > 0 ? "text-emerald-600" : v < 0 ? "text-red-500" : "text-gray-400")}>
                {v > 0 ? <TrendingUp className="h-3 w-3" /> : v < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {pct(v)}
              </span>
            </div>
          );
        })}
        <div className="flex items-center px-2 sm:px-4 py-1.5 sm:py-2.5 border-b-2 border-gray-300 dark:border-card-border bg-gray-50/50 dark:bg-surface/30 text-sm font-extrabold">
          <span className="flex-1 text-gray-600 dark:text-muted">Subtotal {TYPE_LABELS[type]}</span>
          <span className="w-28 text-right text-gray-800 dark:text-foreground">{fmt(subTotal)}</span>
          <span className="w-28 text-right text-gray-400">{fmt(subPrev)}</span>
          <span className={cn("w-20 text-right text-xs", variation(subTotal, subPrev) >= 0 ? "text-emerald-600" : "text-red-500")}>{pct(variation(subTotal, subPrev))}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Scale className="h-6 w-6 text-primary" /> Balance General
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Estado de situación patrimonial — Marzo 2026</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowInfo(true)} className="p-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-500 hover:bg-gray-50 dark:hover:bg-accent">
            <Info className="h-4 w-4" />
          </button>
          <button onClick={() => exportToCSV(accounts.map(a => ({ cuenta: a.name, tipo: TYPE_LABELS[a.type], periodo_actual: a.currentPeriod, periodo_anterior: a.previousPeriod, variacion: variation(a.currentPeriod, a.previousPeriod).toFixed(1) + "%" })), "balance-general")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Ratios KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Liquidez corriente", value: totals.liquidezCorriente.toFixed(2), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Prueba ácida", value: totals.pruebaAcida.toFixed(2), color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950/30" },
          { label: "Endeudamiento", value: pct(totals.endeudamiento), color: totals.endeudamiento > 60 ? "text-red-500" : "text-emerald-600", bg: totals.endeudamiento > 60 ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Capital de trabajo", value: fmt(totals.capitalTrabajo), color: totals.capitalTrabajo >= 0 ? "text-emerald-600" : "text-red-500", bg: "bg-violet-50 dark:bg-violet-950/30" },
          { label: "ROE", value: pct(totals.roe), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Balance T */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-4">
        {/* ACTIVOS */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
          <div className="px-2 sm:px-4 py-2 sm:py-3 bg-blue-50 dark:bg-blue-950/20 border-b border-gray-200 dark:border-card-border">
            <h3 className="font-extrabold text-blue-700 dark:text-blue-400 text-sm">ACTIVOS</h3>
            <div className="flex flex-wrap gap-6 text-xs mt-1">
              <span className="font-semibold text-gray-500">Período actual</span>
              <span className="text-gray-400">Período anterior</span>
              <span className="text-gray-400">Var %</span>
            </div>
          </div>
          {renderSection("activo-corriente", grouped["activo-corriente"])}
          {renderSection("activo-no-corriente", grouped["activo-no-corriente"])}
          <div className="flex items-center px-2 sm:px-4 py-2 sm:py-3 bg-blue-50 dark:bg-blue-950/20 text-sm font-extrabold">
            <span className="flex-1 text-blue-700 dark:text-blue-400">TOTAL ACTIVOS</span>
            <span className="w-28 text-right text-blue-700 dark:text-blue-400">{fmt(totals.totalActivos.current)}</span>
            <span className="w-28 text-right text-blue-400/60">{fmt(totals.totalActivos.previous)}</span>
            <span className="w-20 text-right text-xs text-blue-600">{pct(variation(totals.totalActivos.current, totals.totalActivos.previous))}</span>
          </div>
        </div>

        {/* PASIVOS + PATRIMONIO */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
          <div className="px-2 sm:px-4 py-2 sm:py-3 bg-orange-50 dark:bg-orange-950/20 border-b border-gray-200 dark:border-card-border">
            <h3 className="font-extrabold text-orange-700 dark:text-orange-400 text-sm">PASIVOS + PATRIMONIO</h3>
            <div className="flex flex-wrap gap-6 text-xs mt-1">
              <span className="font-semibold text-gray-500">Período actual</span>
              <span className="text-gray-400">Período anterior</span>
              <span className="text-gray-400">Var %</span>
            </div>
          </div>
          {renderSection("pasivo-corriente", grouped["pasivo-corriente"])}
          {renderSection("pasivo-no-corriente", grouped["pasivo-no-corriente"])}
          {renderSection("patrimonio", grouped["patrimonio"])}
          <div className="flex items-center px-2 sm:px-4 py-2 sm:py-3 bg-orange-50 dark:bg-orange-950/20 text-sm font-extrabold">
            <span className="flex-1 text-orange-700 dark:text-orange-400">TOTAL PASIVO + PATRIMONIO</span>
            <span className="w-28 text-right text-orange-700 dark:text-orange-400">{fmt(totals.totalPasPat.current)}</span>
            <span className="w-28 text-right text-orange-400/60">{fmt(totals.totalPasPat.previous)}</span>
            <span className="w-20 text-right text-xs text-orange-600">{pct(variation(totals.totalPasPat.current, totals.totalPasPat.previous))}</span>
          </div>
        </div>
      </div>

      {/* Balance check */}
      {Math.abs(totals.totalActivos.current - totals.totalPasPat.current) > 0.01 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-sm text-red-700 dark:text-red-400 font-bold">
          ⚠ Descuadre detectado: Activos ({fmt(totals.totalActivos.current)}) ≠ Pasivo + Patrimonio ({fmt(totals.totalPasPat.current)}). Diferencia: {fmt(Math.abs(totals.totalActivos.current - totals.totalPasPat.current))}
        </div>
      )}

      {/* Composition chart */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5">
        <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-4">Composición patrimonial</h3>
        <div className="space-y-3">
          {(["activo-corriente", "activo-no-corriente", "pasivo-corriente", "pasivo-no-corriente", "patrimonio"] as AccountType[]).map(type => {
            const total = accounts.filter(a => a.type === type).reduce((s, a) => s + a.currentPeriod, 0);
            const maxVal = totals.totalActivos.current;
            const pctFill = maxVal > 0 ? (Math.abs(total) / maxVal) * 100 : 0;
            const isAsset = type.startsWith("activo");
            return (
              <div key={type} className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-gray-600 dark:text-muted w-32 truncate">{TYPE_LABELS[type]}</span>
                <div className="flex-1 bg-gray-100 dark:bg-surface rounded-full h-5 overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", isAsset ? "bg-blue-500" : type === "patrimonio" ? "bg-emerald-500" : "bg-orange-500")} style={{ width: `${Math.min(100, pctFill)}%` }} />
                </div>
                <span className="text-xs font-bold text-gray-700 dark:text-foreground w-24 text-right">{fmt(total)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowInfo(false)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm">Ratios Financieros</h3>
              <button onClick={() => setShowInfo(false)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="space-y-2 text-xs text-gray-600 dark:text-muted">
              <p><strong>Liquidez corriente:</strong> Activo Corriente / Pasivo Corriente. Ideal: &gt; 1.5</p>
              <p><strong>Prueba ácida:</strong> (Activo Corriente - Inventario) / Pasivo Corriente. Mide liquidez sin depender de inventario.</p>
              <p><strong>Endeudamiento:</strong> Total Pasivos / Total Activos × 100. Menor a 60% es saludable.</p>
              <p><strong>Capital de trabajo:</strong> Activo Corriente - Pasivo Corriente. Debe ser positivo.</p>
              <p><strong>ROE:</strong> Resultado del ejercicio / Patrimonio × 100. Retorno sobre patrimonio.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
