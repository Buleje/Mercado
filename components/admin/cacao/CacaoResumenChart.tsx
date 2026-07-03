"use client";

/**
 * CacaoResumenChart — gráfico central grande del Resumen: cantidad de cacao
 * COMPRADO (acopio) vs VENDIDO por mes (o su valor en S/). Área apilable estilo
 * Mercado (recharts, cargado con next/dynamic para no inflar el bundle inicial).
 * Self-fetch de ?view=precio-historico (trae kgCompra/kgVenta + precios). Brandon 2026-07-03.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ShoppingCart, Package, Activity, RefreshCw, TrendingUp } from "@buleje/design-system/icons";

interface Punto { mes: string; precioCompra: number | null; precioVenta: number | null; kgCompra: number; kgVenta: number }
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesLabel = (m: string) => { const [y, mm] = m.split("-"); return `${MESES[Number(mm) - 1] ?? mm} ${(y ?? "").slice(2)}`; };
const n0 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 0 });

type Metric = "kg" | "valor";

export default function CacaoResumenChart() {
  const [serie, setSerie] = useState<Punto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("kg");
  const rootRef = useRef<HTMLDivElement>(null);
  const [pal, setPal] = useState({ compra: "#00A0A0", venta: "#f59e0b" });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await fetch("/api/admin/cacao?view=precio-historico", { credentials: "include" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (alive) setSerie(d.serie ?? []);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    const cs = getComputedStyle(rootRef.current ?? document.body);
    const pick = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
    setPal({ compra: pick("--accent", "#00A0A0"), venta: pick("--data-warning-500", "#f59e0b") });
  }, []);

  const data = useMemo(() => serie.map((p) => ({
    label: mesLabel(p.mes),
    comprado: metric === "kg" ? p.kgCompra : (p.precioCompra != null ? Math.round(p.precioCompra * p.kgCompra) : 0),
    vendido: metric === "kg" ? p.kgVenta : (p.precioVenta != null ? Math.round(p.precioVenta * p.kgVenta) : 0),
  })), [serie, metric]);

  const tot = useMemo(() => {
    const c = data.reduce((a, p) => a + p.comprado, 0), v = data.reduce((a, p) => a + p.vendido, 0);
    return { comprado: c, vendido: v, balance: c - v };
  }, [data]);
  const fmtVal = (v: number) => (metric === "kg" ? `${n0(v)} kg` : `S/ ${n0(v)}`);
  const hayVenta = serie.some((p) => p.kgVenta > 0);

  return (
    <div ref={rootRef} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Activity className="h-4 w-4 text-[var(--accent)]" />Comprado vs vendido por mes {metric === "kg" ? "(kg)" : "(valor S/)"}</p>
        <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
          <button type="button" onClick={() => setMetric("kg")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${metric === "kg" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>Kilos</button>
          <button type="button" onClick={() => setMetric("valor")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${metric === "valor" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>Valor S/</button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[300px] items-center justify-center text-[var(--text-tertiary)]"><RefreshCw className="h-6 w-6 animate-spin" /></div>
      ) : error ? (
        <p className="py-12 text-center text-sm text-[var(--data-error-700)]">No se pudo cargar el gráfico: {error}</p>
      ) : data.length < 2 ? (
        <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">Se necesitan al menos 2 meses con movimiento para dibujar el gráfico. Registrá acopio/ventas para verlo.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text-secondary)]"><span className="h-3 w-3 rounded-sm" style={{ background: pal.compra }} />Comprado (acopio)</span>
            {hayVenta && <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text-secondary)]"><span className="h-3 w-3 rounded-sm" style={{ background: pal.venta }} />Vendido</span>}
          </div>
          <ResponsiveContainer width="100%" height={300} minWidth={0}>
            <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cacaoCompraGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={pal.compra} stopOpacity={0.3} /><stop offset="100%" stopColor={pal.compra} stopOpacity={0} /></linearGradient>
                <linearGradient id="cacaoVentaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={pal.venta} stopOpacity={0.28} /><stop offset="100%" stopColor={pal.venta} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} stroke="rgba(107,114,128,0.4)" />
              <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={(v: number) => n0(v)} stroke="rgba(107,114,128,0.4)" />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((v: number, name: string) => [`${fmtVal(Number(v))}`, name]) as any}
                contentStyle={{ borderRadius: "12px", border: "1px solid var(--rule-base)", background: "var(--surface-raised)", color: "var(--text-primary)", fontSize: "12px" }}
              />
              <Area type="monotone" dataKey="comprado" name="Comprado" stroke={pal.compra} strokeWidth={2.5} fill="url(#cacaoCompraGrad)" dot={false} activeDot={{ r: 5 }} />
              {hayVenta && <Area type="monotone" dataKey="vendido" name="Vendido" stroke={pal.venta} strokeWidth={2.5} fill="url(#cacaoVentaGrad)" dot={false} activeDot={{ r: 5 }} />}
            </AreaChart>
          </ResponsiveContainer>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--rule-base)] pt-3">
            <Metric icon={ShoppingCart} label="Total comprado" value={fmtVal(tot.comprado)} tone="accent" />
            <Metric icon={TrendingUp} label="Total vendido" value={hayVenta ? fmtVal(tot.vendido) : "—"} tone="warn" />
            <Metric icon={Package} label={metric === "kg" ? "Balance (stock)" : "Margen bruto"} value={fmtVal(tot.balance)} hint={metric === "kg" ? "comprado − vendido" : "compra − venta"} />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint, tone }: { icon: typeof Package; label: string; value: string; hint?: string; tone?: "accent" | "warn" }) {
  const c = tone === "accent" ? "text-[var(--accent)]" : tone === "warn" ? "text-[var(--data-warning-700)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={`mt-0.5 font-mono text-base font-extrabold tabular-nums ${c}`}>{value}</div>
      {hint && <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</div>}
    </div>
  );
}
