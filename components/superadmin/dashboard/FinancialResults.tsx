"use client";

/**
 * FinancialResults — el resultado del negocio en el dashboard: cruza los
 * INGRESOS (MRR) con los GASTOS reales para mostrar ganancia bruta, gastos
 * operativos y el RESULTADO NETO final. Incluye:
 *   - comparación vs el mes pasado (¿mejoró o empeoró?),
 *   - mini-tendencia del resultado mes a mes,
 *   - qué categorías cuentan como "costo de servir" es configurable (por
 *     dispositivo, localStorage).
 * Lee /api/superadmin/platform-expenses; no recalcula dinero. Brandon 2026-07-04.
 */

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, ArrowRight, Minus, SlidersHorizontal } from "@buleje/design-system/icons";
import Link from "next/link";
import { CategoryDonut } from "@/app/superadmin/gastos/CategoryDonut";
import { CAT_META, fmtPen } from "@/app/superadmin/gastos/gastos-helpers";

interface CatAmount { category: string; amountPen: number }
interface HistMonth { label: string; totalPen: number; real: boolean }

const DEFAULT_COGS = ["infra", "ia", "mensajeria", "pagos"];
const COGS_STORE_KEY = "bsm-financial-cogs-cats";

function fmtSignedPen(n: number): string {
  return `${n >= 0 ? "+" : "−"}${fmtPen(Math.abs(n))}`;
}

export function FinancialResults({ mrrPen, mrrGrowthPct }: { mrrPen: number; mrrGrowthPct?: number | null }) {
  const [byCategory, setByCategory] = useState<CatAmount[] | null>(null);
  const [prevRunRate, setPrevRunRate] = useState(0);
  const [history, setHistory] = useState<HistMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [cogsCats, setCogsCats] = useState<Set<string>>(new Set(DEFAULT_COGS));
  const [configOpen, setConfigOpen] = useState(false);

  // Hidratar la config de COGS desde localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COGS_STORE_KEY);
      if (raw) setCogsCats(new Set(JSON.parse(raw) as string[]));
    } catch { /* localStorage bloqueado — usa el default */ }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/superadmin/platform-expenses", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setByCategory(d.summary?.byCategory ?? []);
        setPrevRunRate(d.summary?.prevMonthRunRatePen ?? 0);
        setHistory(Array.isArray(d.history) ? d.history : []);
      })
      .catch(() => { if (alive) setByCategory([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const toggleCat = (cat: string) => {
    setCogsCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      try { localStorage.setItem(COGS_STORE_KEY, JSON.stringify([...next])); } catch { /* no-op */ }
      return next;
    });
  };

  const model = useMemo(() => {
    const cats = byCategory ?? [];
    const cogs = cats.filter((c) => cogsCats.has(c.category)).reduce((s, c) => s + c.amountPen, 0);
    const opex = cats.filter((c) => !cogsCats.has(c.category)).reduce((s, c) => s + c.amountPen, 0);
    const total = cogs + opex;
    const gross = mrrPen - cogs;
    const net = mrrPen - total;
    // Resultado del mes pasado: MRR estimado (des-crece con el growth) − gasto prev.
    const prevMrr = typeof mrrGrowthPct === "number" && mrrGrowthPct > -100 ? mrrPen / (1 + mrrGrowthPct / 100) : mrrPen;
    const prevNet = prevMrr - prevRunRate;
    const netDelta = prevRunRate > 0 || total > 0 ? net - prevNet : null;
    // Tendencia: resultado por mes = MRR actual − gasto de ese mes (últimos 6).
    const trend = [...history].slice(0, 6).reverse().map((m) => ({ label: m.label, net: mrrPen - m.totalPen }));
    return { cats, cogs, opex, total, gross, net, netDelta, trend };
  }, [byCategory, cogsCats, mrrPen, mrrGrowthPct, prevRunRate, history]);

  if (loading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />;
  }

  const { cats, cogs, opex, total, gross, net, netDelta, trend } = model;
  const grossMargin = mrrPen > 0 ? (gross / mrrPen) * 100 : null;
  const netMargin = mrrPen > 0 ? (net / mrrPen) * 100 : null;
  const profitable = net >= 0;
  const resultColor = profitable ? "var(--data-success-700,#047857)" : "var(--data-error-700,#b91c1c)";

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          Resultado financiero · este mes
        </h3>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <button
              type="button"
              onClick={() => setConfigOpen((v) => !v)}
              aria-pressed={configOpen}
              className={`inline-flex items-center gap-1 text-sm font-bold transition-colors ${configOpen ? "text-[var(--accent)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Ajustar costos
            </button>
          )}
          <Link href="/superadmin/gastos" className="inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)] hover:underline">
            Detalle en Gastos <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Config: qué categorías son "costo de servir" vs "operativo" */}
      {configOpen && total > 0 && (
        <div className="mb-4 rounded-xl bg-[var(--surface-sunken)] p-3">
          <p className="mb-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Marcá qué categorías son <span className="font-bold text-[var(--text-secondary)]">costo de servir</span> (el
            resto cuenta como operativo). Se guarda en este dispositivo.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => {
              const on = cogsCats.has(c.category);
              return (
                <button
                  key={c.category}
                  type="button"
                  onClick={() => toggleCat(c.category)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold transition-colors ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dark)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"
                  }`}
                >
                  <span className="h-2 w-2 rounded-sm" style={{ background: CAT_META[c.category]?.color ?? "#94a3b8" }} />
                  {CAT_META[c.category]?.label ?? c.category}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {total === 0 ? (
        <div className="flex flex-col gap-2 rounded-xl bg-[var(--surface-sunken)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--text-secondary)]">
            Ingresos <span className="font-bold text-[var(--text-primary)]">{fmtPen(mrrPen)}</span>/mes · sin gastos
            registrados todavía.
          </p>
          <Link href="/superadmin/gastos" className="text-sm font-bold text-[var(--accent)] hover:underline">
            Registrá gastos para ver tu resultado neto →
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* P&L: de ingresos a resultado neto */}
          <div>
            <PnlRow label="Ingresos (MRR)" amount={mrrPen} sign="+" tone="pos" />
            <PnlRow label="− Costo de servir" amount={cogs} sign="−" tone="neg" muted />
            <PnlRow label="= Ganancia bruta" amount={gross} margin={grossMargin} strong divider />
            <PnlRow label="− Gastos operativos" amount={opex} sign="−" tone="neg" muted />

            <div className="mt-2 flex items-end justify-between gap-3 border-t-2 border-[var(--rule-base)] pt-3">
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Resultado neto / mes
                </p>
                <p className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: resultColor }}>
                  {profitable ? <TrendingUp className="h-4 w-4" aria-hidden /> : <TrendingDown className="h-4 w-4" aria-hidden />}
                  {profitable ? "Ganás" : "Perdés"}
                  {netMargin !== null && ` · margen ${netMargin.toFixed(0)}%`}
                </p>
                {netDelta !== null && <DeltaVsPrev delta={netDelta} />}
              </div>
              <p className="font-display text-3xl font-extrabold tabular-nums" style={{ color: resultColor }}>
                {profitable ? "+" : "−"}{fmtPen(Math.abs(net))}
              </p>
            </div>

            {trend.length >= 2 && <NetTrend months={trend} />}
          </div>

          {/* Gráfico de gastos integrado */}
          <div className="lg:border-l lg:border-[var(--rule-soft)] lg:pl-5">
            <p className="mb-3 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              ¿En qué se va el gasto?
            </p>
            <CategoryDonut data={cats} />
          </div>
        </div>
      )}
    </section>
  );
}

/** "▲ mejoró S/X vs el mes pasado" / "▼ empeoró …" / "estable". */
function DeltaVsPrev({ delta }: { delta: number }) {
  const flat = Math.abs(delta) < 1;
  const up = delta > 0;
  const color = flat ? "var(--text-tertiary)" : up ? "var(--data-success-700,#047857)" : "var(--data-error-700,#b91c1c)";
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <p className="mt-0.5 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold" style={{ color }}>
      <Icon className="h-3 w-3" aria-hidden />
      {flat ? "estable vs el mes pasado" : `${up ? "mejoró" : "empeoró"} ${fmtPen(Math.abs(delta))} vs el mes pasado`}
    </p>
  );
}

/** Mini-tendencia diverge del centro: verde (ganó) arriba, rojo (perdió) abajo. */
function NetTrend({ months }: { months: { label: string; net: number }[] }) {
  const maxAbs = Math.max(1, ...months.map((m) => Math.abs(m.net)));
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        Resultado mes a mes
      </p>
      <div className="relative flex h-16 items-stretch gap-1.5">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-[var(--rule-base)]" aria-hidden />
        {months.map((m, i) => {
          const pos = m.net >= 0;
          const h = (Math.abs(m.net) / maxAbs) * 50; // % de la media-altura
          const last = i === months.length - 1;
          return (
            <div key={i} className="group relative flex-1" title={`${m.label}: ${fmtSignedPen(m.net)}`}>
              <div
                className="absolute inset-x-0 rounded-sm transition-opacity group-hover:opacity-100"
                style={{
                  [pos ? "bottom" : "top"]: "50%",
                  height: `${Math.max(3, h)}%`,
                  background: pos ? "var(--data-success-500)" : "var(--data-error-500)",
                  opacity: last ? 1 : 0.55,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        <span>{months[0]?.label}</span>
        <span>{months[months.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function PnlRow({
  label, amount, sign, tone = "neutral", margin, strong, muted, divider,
}: {
  label: string;
  amount: number;
  sign?: "+" | "−";
  tone?: "pos" | "neg" | "neutral";
  margin?: number | null;
  strong?: boolean;
  muted?: boolean;
  divider?: boolean;
}) {
  const amountColor =
    strong
      ? amount >= 0 ? "var(--data-success-700,#047857)" : "var(--data-error-700,#b91c1c)"
      : tone === "pos" ? "var(--text-primary)"
      : tone === "neg" ? "var(--text-secondary)"
      : "var(--text-primary)";
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${divider ? "border-t border-[var(--rule-soft)] pt-2" : ""}`}>
      <span className={`text-sm ${strong ? "font-bold text-[var(--text-primary)]" : muted ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]"}`}>
        {label}
      </span>
      <span className="shrink-0 text-right">
        <span className={`tabular-nums ${strong ? "text-base font-extrabold" : "text-sm font-bold"}`} style={{ color: amountColor }}>
          {sign && sign}{fmtPen(amount)}
        </span>
        {margin !== undefined && margin !== null && (
          <span className="ml-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">margen {margin.toFixed(0)}%</span>
        )}
      </span>
    </div>
  );
}
