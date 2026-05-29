"use client";

/**
 * CacaoMiPrecio — "Mi precio en el tiempo" (ADR-128 v5). Serie mensual de a cómo
 * COMPRÉ (acopio S//kg) y a cómo VENDÍ (S//kg) vs. la referencia internacional.
 * Cargado vía next/dynamic en CacaoNoticiero (recharts fuera del bundle inicial).
 * Self-fetch de `?view=precio-historico`. La línea de venta aparece sola cuando
 * hay ventas registradas (degrada a vacío si la tabla CacaoVenta no existe aún).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { LineChart as LineIcon, TrendingUp, TrendingDown, Minus } from "@buleje/design-system/icons";

interface Punto { mes: string; precioCompra: number | null; precioVenta: number | null; kgCompra: number; kgVenta: number }

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesLabel = (m: string) => { const [y, mm] = m.split("-"); return `${MESES[Number(mm) - 1] ?? mm} ${(y ?? "").slice(2)}`; };
const sol = (v: number | null, d = 2) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const lastOf = (serie: Punto[], k: "precioCompra" | "precioVenta") => { for (let i = serie.length - 1; i >= 0; i--) { const v = serie[i][k]; if (v != null) return v; } return null; };

export default function CacaoMiPrecio({ marketRefSolKg = null }: { marketRefSolKg?: number | null }) {
  const [serie, setSerie] = useState<Punto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState({ compra: "#0ea5e9", venta: "#16a34a", market: "#9ca3af" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/cacao?view=precio-historico", { credentials: "include" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (alive) setSerie(Array.isArray(j.serie) ? j.serie : []);
      } catch { if (alive) setSerie([]); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const cs = getComputedStyle(rootRef.current ?? document.body);
    const pick = (names: string[], fb: string) => { for (const n of names) { const v = cs.getPropertyValue(n).trim(); if (v) return v; } return fb; };
    setPalette({
      compra: pick(["--data-info-500", "--accent"], "#0ea5e9"),
      venta: pick(["--data-success-600", "--data-success-500"], "#16a34a"),
      market: pick(["--text-tertiary"], "#9ca3af"),
    });
  }, []);

  const stats = useMemo(() => {
    if (!serie || serie.length === 0) return null;
    const compra = lastOf(serie, "precioCompra");
    const venta = lastOf(serie, "precioVenta");
    const margen = compra != null && venta != null && compra > 0 ? ((venta - compra) / compra) * 100 : null;
    const chartData = serie.map((p) => ({ ...p, label: mesLabel(p.mes) }));
    const hasVenta = serie.some((p) => p.precioVenta != null);
    // Dominio Y que incluye compra, venta Y la referencia de mercado, con padding
    // para que la línea punteada del mercado siempre quede visible.
    const vals: number[] = [];
    for (const p of serie) { if (p.precioCompra != null) vals.push(p.precioCompra); if (p.precioVenta != null) vals.push(p.precioVenta); }
    if (marketRefSolKg != null) vals.push(marketRefSolKg);
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 1;
    const pad = Math.max(0.5, (hi - lo) * 0.12);
    const yDomain: [number, number] = [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];
    return { compra, venta, margen, chartData, hasVenta, yDomain };
  }, [serie, marketRefSolKg]);

  return (
    <div ref={rootRef} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-1 flex items-center gap-2">
        <LineIcon className="h-4 w-4 text-[var(--accent)]" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Mi precio en el tiempo · S//kg</h3>
      </div>
      <p className="mb-4 text-xs text-[var(--text-tertiary)]">A cómo compraste en chacra y a cómo vendiste, mes a mes, contra la referencia internacional.</p>

      {loading ? (
        <p className="py-12 text-center text-sm text-[var(--text-tertiary)]">Cargando…</p>
      ) : !stats || stats.chartData.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Todavía no hay precios registrados. Acopiá lotes y registrá ventas para ver tu tendencia.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-info-100)] px-2.5 py-1 text-sm font-bold text-[var(--data-info-900)]">Compra: S/ {sol(stats.compra)}/kg</span>
            {stats.venta != null && <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-100)] px-2.5 py-1 text-sm font-bold text-[var(--data-success-900)]">Venta: S/ {sol(stats.venta)}/kg</span>}
            {stats.margen != null && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${stats.margen > 0 ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : stats.margen < 0 ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
                {stats.margen > 0 ? <TrendingUp className="h-4 w-4" /> : stats.margen < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                Margen {stats.margen > 0 ? "+" : ""}{stats.margen.toFixed(1)}%
              </span>
            )}
            {marketRefSolKg != null && <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-sm font-medium text-[var(--text-secondary)]">Mercado: S/ {sol(marketRefSolKg)}/kg</span>}
          </div>

          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <LineChart data={stats.chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={20} stroke="rgba(107,114,128,0.4)" />
              <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={(v: number) => sol(v, 0)} stroke="rgba(107,114,128,0.4)" domain={stats.yDomain} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((v: number, name: string) => [`S/ ${sol(Number(v))}/kg`, name]) as any}
                contentStyle={{ borderRadius: "12px", border: "1px solid var(--rule-base)", background: "var(--surface-raised)", color: "var(--text-primary)", fontSize: "12px" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {marketRefSolKg != null && <ReferenceLine y={marketRefSolKg} stroke={palette.market} strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: "Mercado", position: "insideTopRight", fontSize: 10, fill: palette.market }} />}
              <Line type="monotone" dataKey="precioCompra" name="Compra" stroke={palette.compra} strokeWidth={2} connectNulls dot={{ r: 3 }} activeDot={{ r: 5 }} />
              {stats.hasVenta && <Line type="monotone" dataKey="precioVenta" name="Venta" stroke={palette.venta} strokeWidth={2} connectNulls dot={{ r: 3 }} activeDot={{ r: 5 }} />}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
