"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useMemo, useEffect, startTransition } from "react";
import { ArrowUp, ArrowDown, Minus, Download, BarChart3, MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn, exportToCSV } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";

type Metric = { label: string; periodA: number; periodB: number; format: "money" | "number" | "pct" };

function fmt(n: number) { return `${formatCurrency(n)}`; }
function fmtNum(n: number, format: Metric["format"]) {
  if (!Number.isFinite(n)) return "—";
  if (format === "money") return fmt(n);
  if (format === "pct") return `${n.toFixed(1)}%`;
  return formatNumber(n);
}

/* «Personalizado» se fue (2026-10-11): no pedía fechas y comparaba lo mismo
   que «Mes». Los rótulos van cortos: viven en la fila del título. */
const PRESETS = [
  { id: "week", label: "Semana", aLabel: "Esta semana", bLabel: "Semana pasada" },
  { id: "month", label: "Mes", aLabel: "Este mes", bLabel: "Mes pasado" },
  { id: "quarter", label: "Trimestre", aLabel: "Este trimestre", bLabel: "Trimestre pasado" },
  { id: "year", label: "Año", aLabel: "Este año", bLabel: "Año pasado" },
];

/** Métricas en las que bajar es lo bueno: que el costo de lo vendido suba no es una mejora. */
const BAJAR_ES_BUENO = new Set(["Costo de ventas"]);
const cambioTexto = (a: number, b: number) => (b !== 0 && Number.isFinite(a) && Number.isFinite(b) ? `${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%` : "—");

type SaleRecord = { total: number; totalCogs?: number; customerPhone?: string; createdAt: string; items?: Array<unknown> };

/** Get the [start, end) Date boundaries for each preset period and its comparison */
function getPeriodBounds(preset: string): { aStart: Date; aEnd: Date; bStart: Date; bEnd: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "week") {
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; // Mon=0
    const aStart = new Date(today); aStart.setDate(today.getDate() - dayOfWeek);
    const aEnd = new Date(aStart); aEnd.setDate(aStart.getDate() + 7);
    const bStart = new Date(aStart); bStart.setDate(aStart.getDate() - 7);
    const bEnd = new Date(aStart);
    return { aStart, aEnd, bStart, bEnd };
  }
  if (preset === "month") {
    const aStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const aEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const bStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const bEnd = aStart;
    return { aStart, aEnd, bStart, bEnd };
  }
  if (preset === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const aStart = new Date(now.getFullYear(), q * 3, 1);
    const aEnd = new Date(now.getFullYear(), q * 3 + 3, 1);
    const bStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
    const bEnd = aStart;
    return { aStart, aEnd, bStart, bEnd };
  }
  if (preset === "year") {
    const aStart = new Date(now.getFullYear(), 0, 1);
    const aEnd = new Date(now.getFullYear() + 1, 0, 1);
    const bStart = new Date(now.getFullYear() - 1, 0, 1);
    const bEnd = aStart;
    return { aStart, aEnd, bStart, bEnd };
  }
  // custom — default to current month vs previous
  const aStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const aEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const bStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { aStart, aEnd, bStart, bEnd: aStart };
}

function computeMetrics(periodSales: SaleRecord[]): { revenue: number; txns: number; avgTicket: number; uniqueClients: number; cogs: number; grossMargin: number } {
  const revenue = periodSales.reduce((s, x) => s + x.total, 0);
  const txns = periodSales.length;
  const avgTicket = txns > 0 ? revenue / txns : 0;
  const uniqueClients = new Set(periodSales.map(x => x.customerPhone ?? "anon")).size;
  const cogs = periodSales.reduce((s, x) => s + (x.totalCogs ?? 0), 0);
  /* Sin ventas, o pasado ±999 %, el margen no dice nada (S/ 0.10 de venta y
     S/ 18.29 de costo daban «−18190.0%»): queda sin dato, como en el Resumen. */
  const margen = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : NaN;
  const grossMargin = Math.abs(margen) <= 999 ? margen : NaN;
  return { revenue, txns, avgTicket, uniqueClients, cogs, grossMargin };
}

function buildMetrics(aM: ReturnType<typeof computeMetrics>, bM: ReturnType<typeof computeMetrics>): Metric[] {
  return [
    { label: "Ventas totales", periodA: aM.revenue, periodB: bM.revenue, format: "money" },
    { label: "Nº transacciones", periodA: aM.txns, periodB: bM.txns, format: "number" },
    { label: "Ticket promedio", periodA: aM.avgTicket, periodB: bM.avgTicket, format: "money" },
    { label: "Clientes únicos", periodA: aM.uniqueClients, periodB: bM.uniqueClients, format: "number" },
    { label: "Costo de ventas", periodA: aM.cogs, periodB: bM.cogs, format: "money" },
    { label: "Margen bruto", periodA: aM.grossMargin, periodB: bM.grossMargin, format: "pct" },
  ];
}

export default function PeriodComparatorTab() {
  const [preset, setPreset] = useState("month");
  const [allSales, setAllSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        startTransition(() => {
          setAllSales((data?.sales ?? []) as SaleRecord[]);
          setLoading(false);
        });
      })
      .catch(() => startTransition(() => setLoading(false)));
  }, []);

  const data = useMemo<Metric[]>(() => {
    if (allSales.length === 0) return [];
    const { aStart, aEnd, bStart, bEnd } = getPeriodBounds(preset);
    const aSales = allSales.filter(s => { const d = new Date(s.createdAt); return d >= aStart && d < aEnd; });
    const bSales = allSales.filter(s => { const d = new Date(s.createdAt); return d >= bStart && d < bEnd; });
    return buildMetrics(computeMetrics(aSales), computeMetrics(bSales));
  }, [allSales, preset]);
  const current = PRESETS.find(p => p.id === preset) ?? PRESETS[1];

  const improvements = useMemo(() => data.filter(m => {
    const change = m.periodA - m.periodB;
    // For "bad" metrics (devoluciones, stock agotado), decrease is good
    if (!Number.isFinite(change)) return false;
    return BAJAR_ES_BUENO.has(m.label) ? change < 0 : change > 0;
  }).length, [data]);

  const exportar = () =>
    exportToCSV(
      data.map(m => ({ metrica: m.label, [current.aLabel]: fmtNum(m.periodA, m.format), [current.bLabel]: fmtNum(m.periodB, m.format), cambio: cambioTexto(m.periodA, m.periodB) })),
      `comparador-${preset}`,
    );

  return (
    <div className="space-y-4">
      {/* Una fila: título · ⓘ · el período · cuántas mejoraron · Más. */}
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Comparar períodos</SectionTitle>
        <InfoTip
          title="Comparar períodos"
          what="Tus ventas de mostrador de este período contra el anterior: total, transacciones, ticket, clientes, costo y margen bruto."
          affects="Cuenta las ventas del mostrador, no los pedidos web ni el aserrío. La ganancia del mes con todos los costos está en Ganancias."
          example="«Mes» compara del 1 a hoy contra el mes pasado entero."
        />
        <div role="radiogroup" aria-label="Período" className="inline-flex overflow-hidden rounded-xl border border-[var(--rule-base)]">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={preset === p.id}
              onClick={() => setPreset(p.id)}
              className={cn(
                "min-h-12 px-3 text-sm font-semibold transition-colors",
                preset === p.id
                  ? "bg-[var(--accent-ink)] text-white dark:bg-[var(--accent)] dark:text-[var(--surface-canvas)]"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {data.length > 0 && (
          <span className="text-sm font-semibold text-[var(--text-secondary)]">
            {improvements} de {data.length} mejoraron
          </span>
        )}
        <div className="ml-auto">
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title="Descargar"
            actions={[{ id: "csv", label: "Descargar (CSV)", icon: Download, onSelect: exportar, disabled: data.length === 0 }]}
          />
        </div>
      </div>

      {/* Comparison cards */}
      {loading ? (
        <div className="text-center py-10 text-sm text-[var(--text-tertiary)]">Cargando tus ventas…</div>
      ) : data.length === 0 ? (
        <div className="text-center py-10">
          <BarChart3 className="h-10 w-10 text-[var(--text-tertiary)] dark:text-surface mx-auto mb-2" />
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">Sin ventas en este período</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.map(m => {
          const diff = m.periodA - m.periodB;
          const pct = m.periodB !== 0 ? (diff / m.periodB) * 100 : 0;
          const sinDato = !Number.isFinite(diff);
          const isGood = BAJAR_ES_BUENO.has(m.label) ? diff <= 0 : diff >= 0;
          const maxVal = Math.max(Number.isFinite(m.periodA) ? m.periodA : 0, Number.isFinite(m.periodB) ? m.periodB : 0);

          return (
            <div key={m.label} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{m.label}</span>
                <span className={cn("flex items-center gap-0.5 text-sm font-bold", sinDato ? "text-[var(--text-tertiary)]" : isGood ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")}>
                  {sinDato || diff === 0 ? <Minus className="h-3 w-3" /> : isGood ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {!sinDato && m.periodB !== 0 ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[var(--text-primary)] font-semibold">{current.aLabel}</span>
                    <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmtNum(m.periodA, m.format)}</span>
                  </div>
                  <div className="w-full h-2 bg-[var(--rule-soft)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--accent)] rounded-full transition-all" style={{ width: `${maxVal > 0 && Number.isFinite(m.periodA) ? Math.max(0, (m.periodA / maxVal) * 100) : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-[var(--text-secondary)] font-semibold">{current.bLabel}</span>
                    <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmtNum(m.periodB, m.format)}</span>
                  </div>
                  <div className="w-full h-2 bg-[var(--rule-soft)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--text-tertiary)] rounded-full transition-all" style={{ width: `${maxVal > 0 && Number.isFinite(m.periodB) ? Math.max(0, (m.periodB / maxVal) * 100) : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
