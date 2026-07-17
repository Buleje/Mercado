"use client";

/**
 * CtpTrazaRadar — la cadena de custodia del período, dibujada.
 *
 * Tres columnas (GTF de ingreso → corrida de producción → despacho) y las
 * líneas que las unen (consumos y orígenes, las mismas tablas puente que
 * enforcean I1–I5). Pasando el mouse sobre un nodo se ilumina TODO lo que está
 * conectado a él hacia atrás y hacia adelante — de un vistazo se ve de qué GTF
 * salió cada despacho, sin leer una tabla. Read-only, se alimenta de
 * `ForestCtpDB.grafoTrazabilidad`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, RefreshCw, TreePine } from "@buleje/design-system/icons";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";

const NODE_W = 172;
const NODE_H = 46;
const GAP_Y = 14;
const COL_GAP = 96; // espacio para las líneas entre columnas
const PAD = 12;

type NodeKind = "ingreso" | "corrida" | "despacho";
interface Placed { id: string; kind: NodeKind; x: number; y: number; top: string; sub: string; cites?: boolean }

export default function CtpTrazaRadar({ period }: { period: CtpPeriod }) {
  const [g, setG] = useState<TrazaGrafo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = applyCtpPeriodParams(new URLSearchParams({ grafo: "1" }), period);
      const r = await fetch(`/api/admin/forestal/ctp?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setG((await r.json()).grafo ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const layout = useMemo(() => {
    if (!g) return null;
    const cols: [Placed[], Placed[], Placed[]] = [[], [], []];
    const rows = Math.max(g.ingresos.length, g.corridas.length, g.despachos.length, 1);
    const H = rows * (NODE_H + GAP_Y) - GAP_Y + PAD * 2;
    const colX = [PAD, PAD + NODE_W + COL_GAP, PAD + 2 * (NODE_W + COL_GAP)];
    const place = (arr: { id: string }[], ci: number, kind: NodeKind, top: (i: number) => string, sub: (i: number) => string, cites?: (i: number) => boolean) => {
      const colH = arr.length * (NODE_H + GAP_Y) - GAP_Y;
      const y0 = (H - colH) / 2;
      arr.forEach((n, i) => cols[ci].push({ id: n.id, kind, x: colX[ci], y: y0 + i * (NODE_H + GAP_Y), top: top(i), sub: sub(i), cites: cites?.(i) }));
    };
    place(g.ingresos, 0, "ingreso", (i) => `GTF ${g.ingresos[i].gtf || "—"}`, (i) => `${g.ingresos[i].species ?? "—"} · ${g.ingresos[i].volumeM3.toFixed(2)} m³`, (i) => g.ingresos[i].cites);
    place(g.corridas, 1, "corrida", (i) => `Corrida #${g.corridas[i].lineNo}`, (i) => g.corridas[i].label, (i) => g.corridas[i].cites);
    place(g.despachos, 2, "despacho", (i) => `Despacho #${g.despachos[i].lineNo}`, (i) => g.despachos[i].destino || g.despachos[i].label);
    const pos = new Map<string, Placed>();
    for (const c of cols) for (const n of c) pos.set(n.id, n);
    const W = colX[2] + NODE_W + PAD;
    return { cols, pos, W, H };
  }, [g]);

  // Conjunto conectado al nodo en hover (hacia atrás y adelante).
  const active = useMemo(() => {
    if (!g || !hover) return null;
    const nodes = new Set<string>([hover]);
    const edges = new Set<string>();
    const grow = () => {
      let changed = true;
      while (changed) {
        changed = false;
        for (const e of g.consumos) {
          const k = `c:${e.from}->${e.to}`;
          if ((nodes.has(e.from) || nodes.has(e.to)) && !edges.has(k)) { edges.add(k); if (!nodes.has(e.from)) { nodes.add(e.from); changed = true; } if (!nodes.has(e.to)) { nodes.add(e.to); changed = true; } }
        }
        for (const e of g.origenes) {
          const k = `o:${e.from}->${e.to}`;
          if ((nodes.has(e.from) || nodes.has(e.to)) && !edges.has(k)) { edges.add(k); if (!nodes.has(e.from)) { nodes.add(e.from); changed = true; } if (!nodes.has(e.to)) { nodes.add(e.to); changed = true; } }
        }
      }
    };
    grow();
    return { nodes, edges };
  }, [g, hover]);

  const isEmpty = g && g.ingresos.length === 0 && g.corridas.length === 0 && g.despachos.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--text-tertiary)]">Cadena de custodia de <strong className="text-[var(--text-secondary)]">{period.label}</strong>: GTF de ingreso → corrida → despacho. Pasá el mouse sobre un nodo para iluminar de dónde salió y a dónde fue.</p>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {loading && !g && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Dibujando la cadena…</p></div>}

      {isEmpty && <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-3 h-9 w-9 opacity-30" /><p className="text-sm">Sin movimientos en {period.label}.</p></div>}

      {layout && g && !isEmpty && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            <span>Ingreso (GTF)</span><span>Producción</span><span>Despacho</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
            <svg viewBox={`0 0 ${layout.W} ${layout.H}`} width={layout.W} className="max-w-none" style={{ minWidth: "100%" }} role="img" aria-label="Grafo de cadena de custodia">
              {/* edges primero, debajo de los nodos */}
              {g.consumos.map((e) => <Edge key={`c:${e.from}->${e.to}`} a={layout.pos.get(e.from)} b={layout.pos.get(e.to)} on={!active || active.edges.has(`c:${e.from}->${e.to}`)} dim={!!active && !active.edges.has(`c:${e.from}->${e.to}`)} />)}
              {g.origenes.map((e) => <Edge key={`o:${e.from}->${e.to}`} a={layout.pos.get(e.from)} b={layout.pos.get(e.to)} on={!active || active.edges.has(`o:${e.from}->${e.to}`)} dim={!!active && !active.edges.has(`o:${e.from}->${e.to}`)} />)}
              {/* nodos */}
              {layout.cols.flat().map((n) => <Node key={n.id} n={n} dim={!!active && !active.nodes.has(n.id)} onHover={setHover} />)}
            </svg>
          </div>
        </>
      )}
    </div>
  );
}

function Edge({ a, b, on, dim }: { a?: Placed; b?: Placed; on: boolean; dim: boolean }) {
  if (!a || !b) return null;
  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return (
    <path
      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
      fill="none"
      stroke={on ? "var(--brand-ink)" : "var(--rule-base)"}
      strokeWidth={on ? 2 : 1.5}
      opacity={dim ? 0.12 : on ? 0.55 : 0.3}
    />
  );
}

function Node({ n, dim, onHover }: { n: Placed; dim: boolean; onHover: (id: string | null) => void }) {
  const stroke = n.cites ? "var(--data-error-500)" : "var(--brand-ink)";
  return (
    <g transform={`translate(${n.x} ${n.y})`} opacity={dim ? 0.25 : 1} onMouseEnter={() => onHover(n.id)} onMouseLeave={() => onHover(null)} style={{ cursor: "pointer" }}>
      <rect width={NODE_W} height={NODE_H} rx={10} fill="var(--surface-canvas)" stroke={stroke} strokeWidth={1.5} />
      <text x={10} y={19} fontSize={11} fontWeight={700} fill="var(--text-primary)">{trunc(n.top, 24)}</text>
      <text x={10} y={35} fontSize={9.5} fill="var(--text-tertiary)">{trunc(n.sub, 26)}</text>
      {n.cites && <text x={NODE_W - 10} y={19} fontSize={8} fontWeight={700} fill="var(--data-error-600)" textAnchor="end">CITES</text>}
    </g>
  );
}

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
