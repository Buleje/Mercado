"use client";

/**
 * FinancialResults — el resultado del negocio en el dashboard: cruza los
 * INGRESOS (MRR) con los GASTOS reales de la plataforma para mostrar ganancia
 * bruta, gastos operativos y el RESULTADO NETO final, más un gráfico de gastos
 * por categoría. Lee /api/superadmin/platform-expenses (mismos datos que
 * /superadmin/gastos); no recalcula dinero. Brandon 2026-07-04.
 */

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, ArrowRight } from "@buleje/design-system/icons";
import Link from "next/link";
import { CategoryDonut } from "@/app/superadmin/gastos/CategoryDonut";
import { fmtPen } from "@/app/superadmin/gastos/gastos-helpers";

interface CatAmount { category: string; amountPen: number }

// Costo de servir (COGS): escala con uso/tenants/ingresos. El resto = operativo.
const COGS_CATS = new Set(["infra", "ia", "mensajeria", "pagos"]);

export function FinancialResults({ mrrPen }: { mrrPen: number }) {
  const [cats, setCats] = useState<CatAmount[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/superadmin/platform-expenses", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setCats(d.summary?.byCategory ?? []); })
      .catch(() => { if (alive) setCats([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />;
  }

  const byCategory = cats ?? [];
  const cogs = byCategory.filter((c) => COGS_CATS.has(c.category)).reduce((s, c) => s + c.amountPen, 0);
  const opex = byCategory.filter((c) => !COGS_CATS.has(c.category)).reduce((s, c) => s + c.amountPen, 0);
  const total = cogs + opex;
  const gross = mrrPen - cogs;
  const net = mrrPen - total;
  const grossMargin = mrrPen > 0 ? (gross / mrrPen) * 100 : null;
  const netMargin = mrrPen > 0 ? (net / mrrPen) * 100 : null;
  const profitable = net >= 0;
  const resultColor = profitable ? "var(--data-success-700,#047857)" : "var(--data-error-700,#b91c1c)";

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          Resultado financiero · este mes
        </h3>
        <Link href="/superadmin/gastos" className="inline-flex items-center gap-1 text-sm font-bold text-[var(--accent)] hover:underline">
          Detalle en Gastos <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

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
            <PnlRow label="− Costo de servir (infra · IA · pagos)" amount={cogs} sign="−" tone="neg" muted />
            <PnlRow label="= Ganancia bruta" amount={gross} margin={grossMargin} strong divider />
            <PnlRow label="− Gastos operativos (personal · marketing…)" amount={opex} sign="−" tone="neg" muted />

            {/* Resultado neto — el número concreto final */}
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
              </div>
              <p className="font-display text-3xl font-extrabold tabular-nums" style={{ color: resultColor }}>
                {profitable ? "+" : "−"}{fmtPen(Math.abs(net))}
              </p>
            </div>
          </div>

          {/* Gráfico de gastos integrado */}
          <div className="lg:border-l lg:border-[var(--rule-soft)] lg:pl-5">
            <p className="mb-3 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              ¿En qué se va el gasto?
            </p>
            <CategoryDonut data={byCategory} />
          </div>
        </div>
      )}
    </section>
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
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${divider ? "border-t border-[var(--rule-soft)] pt-2" : ""}`}
    >
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
