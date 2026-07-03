"use client";

/**
 * CacaoResumenChart — gráfico central grande del Resumen: cantidad de cacao
 * COMPRADO (acopio) vs VENDIDO por mes (o su valor en S/). Estilo Mercado
 * (recharts, next/dynamic). Selector de rango, badge de variación, tooltip rico
 * (comprado/vendido/neto), línea de promedio, marcadores de mes pico y toggle de
 * stock acumulado (2º eje). Self-fetch de ?view=precio-historico. Brandon 2026-07-03.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from "recharts";
import { ShoppingCart, Package, Activity, RefreshCw, TrendingUp, TrendingDown, Minus, Boxes, FileSpreadsheet, Image as ImageIcon } from "@buleje/design-system/icons";

interface Punto { mes: string; precioCompra: number | null; precioVenta: number | null; kgCompra: number; kgVenta: number }
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesLabel = (m: string) => { const [y, mm] = m.split("-"); return `${MESES[Number(mm) - 1] ?? mm} ${(y ?? "").slice(2)}`; };
const n0 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 0 });

type Metric = "kg" | "valor";
const RANGES = [{ k: "3M", n: 3 }, { k: "6M", n: 6 }, { k: "1A", n: 12 }, { k: "Todo", n: 9999 }] as const;

export default function CacaoResumenChart() {
  const [serie, setSerie] = useState<Punto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("kg");
  const [range, setRange] = useState<string>("1A");
  const [showAcum, setShowAcum] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pal, setPal] = useState({ compra: "#00A0A0", venta: "#f59e0b", acum: "#8b5cf6", up: "#10b981", down: "#ef4444", neutral: "#9ca3af" });

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
    setPal({ compra: pick("--accent", "#00A0A0"), venta: pick("--data-warning-500", "#f59e0b"), acum: pick("--data-info-500", "#8b5cf6"), up: pick("--data-success-600", "#10b981"), down: pick("--data-error-500", "#ef4444"), neutral: pick("--text-tertiary", "#9ca3af") });
  }, []);

  const view = useMemo(() => {
    const mv = (p: Punto) => ({
      comprado: metric === "kg" ? p.kgCompra : (p.precioCompra != null ? Math.round(p.precioCompra * p.kgCompra) : 0),
      vendido: metric === "kg" ? p.kgVenta : (p.precioVenta != null ? Math.round(p.precioVenta * p.kgVenta) : 0),
    });
    // acumulado (stock/caja) corre sobre la serie COMPLETA para reflejar el arrastre previo.
    let run = 0;
    const all = serie.map((p) => { const { comprado, vendido } = mv(p); run += comprado - vendido; return { mes: p.mes, label: mesLabel(p.mes), comprado, vendido, neto: comprado - vendido, acumulado: run }; });
    const n = RANGES.find((r) => r.k === range)?.n ?? 12;
    const data = all.slice(-Math.min(n, all.length));
    if (data.length < 2) return null;
    const totC = data.reduce((a, p) => a + p.comprado, 0), totV = data.reduce((a, p) => a + p.vendido, 0);
    const avgC = totC / data.length;
    const first = data[0].comprado, last = data[data.length - 1].comprado;
    const variacion = first > 0 ? ((last - first) / first) * 100 : 0;
    const maxC = Math.max(...data.map((p) => p.comprado));
    const maxV = Math.max(...data.map((p) => p.vendido));
    const peakC = data.find((p) => p.comprado === maxC) ?? null;
    const peakV = maxV > 0 ? (data.find((p) => p.vendido === maxV) ?? null) : null;
    return { data, totC, totV, balance: totC - totV, avgC, variacion, peakC, peakV, hayVenta: data.some((p) => p.vendido > 0) };
  }, [serie, metric, range]);

  const fmtVal = (v: number) => (metric === "kg" ? `${n0(v)} kg` : `S/ ${n0(v)}`);
  const up = (view?.variacion ?? 0) > 0.5, down = (view?.variacion ?? 0) < -0.5;

  function triggerDownload(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  /** Descarga la planilla mensual completa (kg + precios + valor) como CSV. */
  function exportCSV() {
    const head = ["Mes", "Kg comprado", "Kg vendido", "Precio compra S//kg", "Precio venta S//kg", "Valor comprado S/", "Valor vendido S/"];
    const rows = serie.map((p) => [
      mesLabel(p.mes), p.kgCompra, p.kgVenta,
      p.precioCompra ?? "", p.precioVenta ?? "",
      p.precioCompra != null ? Math.round(p.precioCompra * p.kgCompra) : "",
      p.precioVenta != null ? Math.round(p.precioVenta * p.kgVenta) : "",
    ]);
    const csv = [head, ...rows].map((r) => r.join(",")).join("\n");
    triggerDownload(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), "cacao-comprado-vendido.csv");
  }
  /** Exporta el gráfico como PNG (SVG → canvas). Recharts usa colores explícitos y
   *  gradientes inline, así que renderiza bien fuera del CSS de la página. */
  function exportPNG() {
    const svg = rootRef.current?.querySelector(".recharts-surface") as SVGSVGElement | null;
    if (!svg) return;
    const w = svg.clientWidth || 800, h = svg.clientHeight || 300;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(w)); clone.setAttribute("height", String(h));
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
    const data = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * 2; canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.scale(2, 2); ctx.drawImage(img, 0, 0); }
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => { if (b) triggerDownload(b, "cacao-grafico.png"); }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError("No se pudo exportar la imagen."); };
    img.src = url;
  }

  return (
    <div ref={rootRef} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Activity className="h-4 w-4 text-[var(--accent)]" />Comprado vs vendido por mes {metric === "kg" ? "(kg)" : "(valor S/)"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowAcum((v) => !v)} title="Superponer el stock/caja acumulado (comprado − vendido corrido)" className={`inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition ${showAcum ? "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)]" : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]"}`}><Boxes className="h-3.5 w-3.5" />Acumulado</button>
          <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
            {RANGES.map((r) => <button key={r.k} type="button" onClick={() => setRange(r.k)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${range === r.k ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{r.k}</button>)}
          </div>
          <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
            <button type="button" onClick={() => setMetric("kg")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${metric === "kg" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>Kilos</button>
            <button type="button" onClick={() => setMetric("valor")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${metric === "valor" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>Valor S/</button>
          </div>
          {view && (
            <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
              <button type="button" onClick={exportCSV} title="Descargar la planilla mensual (CSV)" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"><FileSpreadsheet className="h-3.5 w-3.5" />CSV</button>
              <button type="button" onClick={exportPNG} title="Descargar el gráfico como imagen (PNG)" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"><ImageIcon className="h-3.5 w-3.5" />PNG</button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-[300px] items-center justify-center text-[var(--text-tertiary)]"><RefreshCw className="h-6 w-6 animate-spin" /></div>
      ) : error ? (
        <p className="py-12 text-center text-sm text-[var(--data-error-700)]">No se pudo cargar el gráfico: {error}</p>
      ) : !view ? (
        <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">Se necesitan al menos 2 meses con movimiento para dibujar el gráfico. Registrá acopio/ventas para verlo.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${up ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : down ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
              {up ? <TrendingUp className="h-4 w-4" /> : down ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {up ? "+" : ""}{Number(view.variacion).toFixed(0)}% comprado en {range}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-3 w-3 rounded-sm" style={{ background: pal.compra }} />Comprado</span>
            {view.hayVenta && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-3 w-3 rounded-sm" style={{ background: pal.venta }} />Vendido</span>}
            {showAcum && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-2 w-4 rounded-sm" style={{ background: pal.acum }} />Acumulado</span>}
          </div>
          <ResponsiveContainer width="100%" height={300} minWidth={0}>
            <AreaChart data={view.data} margin={{ top: 8, right: showAcum ? 4 : 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cacaoCompraGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={pal.compra} stopOpacity={0.3} /><stop offset="100%" stopColor={pal.compra} stopOpacity={0} /></linearGradient>
                <linearGradient id="cacaoVentaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={pal.venta} stopOpacity={0.28} /><stop offset="100%" stopColor={pal.venta} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} stroke="rgba(107,114,128,0.4)" />
              <YAxis yAxisId="main" tick={{ fontSize: 11 }} width={52} tickFormatter={(v: number) => n0(v)} stroke="rgba(107,114,128,0.4)" />
              {showAcum && <YAxis yAxisId="acum" orientation="right" tick={{ fontSize: 10 }} width={48} tickFormatter={(v: number) => n0(v)} stroke={pal.acum} />}
              <Tooltip content={<ChartTooltip metric={metric} showAcum={showAcum} />} />
              <ReferenceLine yAxisId="main" y={view.avgC} stroke={pal.neutral} strokeDasharray="4 4" strokeOpacity={0.55} label={{ value: `prom ${fmtVal(Math.round(view.avgC))}`, position: "insideTopRight", fontSize: 9, fill: pal.neutral }} />
              <Area yAxisId="main" type="monotone" dataKey="comprado" name="Comprado" stroke={pal.compra} strokeWidth={2.5} fill="url(#cacaoCompraGrad)" dot={false} activeDot={{ r: 5 }} />
              {view.hayVenta && <Area yAxisId="main" type="monotone" dataKey="vendido" name="Vendido" stroke={pal.venta} strokeWidth={2.5} fill="url(#cacaoVentaGrad)" dot={false} activeDot={{ r: 5 }} />}
              {showAcum && <Line yAxisId="acum" type="monotone" dataKey="acumulado" name="Acumulado" stroke={pal.acum} strokeWidth={2} strokeDasharray="5 3" dot={false} />}
              {view.peakC && <ReferenceDot yAxisId="main" x={view.peakC.label} y={view.peakC.comprado} r={4} fill={pal.compra} stroke="var(--surface-raised)" strokeWidth={1.5} label={{ value: `pico ${fmtVal(view.peakC.comprado)}`, position: "top", fontSize: 9, fill: pal.compra }} />}
              {view.peakV && <ReferenceDot yAxisId="main" x={view.peakV.label} y={view.peakV.vendido} r={4} fill={pal.venta} stroke="var(--surface-raised)" strokeWidth={1.5} />}
            </AreaChart>
          </ResponsiveContainer>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--rule-base)] pt-3">
            <Metric icon={ShoppingCart} label="Total comprado" value={fmtVal(view.totC)} tone="accent" />
            <Metric icon={TrendingUp} label="Total vendido" value={view.hayVenta ? fmtVal(view.totV) : "—"} tone="warn" />
            <Metric icon={Package} label={metric === "kg" ? "Balance (stock)" : "Margen bruto"} value={fmtVal(view.balance)} hint={metric === "kg" ? "comprado − vendido" : "compra − venta"} />
          </div>
        </>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts inyecta active/payload/label
function ChartTooltip({ active, payload, label, metric, showAcum }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as { comprado: number; vendido: number; neto: number; acumulado: number };
  const f = (v: number) => (metric === "kg" ? `${n0(v)} kg` : `S/ ${n0(v)}`);
  const row = (c: string, k: string, v: string) => (
    <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{k}</span><span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{v}</span></div>
  );
  const netoPos = p.neto >= 0;
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-xs shadow-[var(--shadow-md)]">
      <p className="mb-1 font-bold text-[var(--text-primary)]">{label}</p>
      <div className="space-y-0.5">
        {row("var(--accent)", "Comprado", f(p.comprado))}
        {p.vendido > 0 && row("var(--data-warning-500)", "Vendido", f(p.vendido))}
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-[var(--rule-base)] pt-1"><span className="text-[var(--text-tertiary)]">Neto del mes</span><span className={`font-mono font-bold tabular-nums ${netoPos ? "text-[var(--data-success-700)]" : "text-[var(--data-error-700)]"}`}>{netoPos ? "+" : ""}{f(p.neto)}</span></div>
        {showAcum && <div className="flex items-center justify-between gap-4"><span className="text-[var(--text-tertiary)]">Acumulado</span><span className="font-mono font-bold tabular-nums text-[var(--data-info-700)]">{f(p.acumulado)}</span></div>}
      </div>
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
