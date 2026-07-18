"use client";

/**
 * CtpTrazaRadar — la cadena de custodia del período, dibujada.
 *
 * Tres columnas (GTF de ingreso → corrida de producción → despacho) y las
 * líneas que las unen (consumos y orígenes, las mismas tablas puente que
 * enforcean I1–I5). El radar no sólo dibuja la cadena: DETECTA los huecos —
 * despachos que no trazan hasta una GTF y corridas sin materia prima — que son
 * exactamente lo que una fiscalización SERFOR marca (el certificado exige cadena
 * completa; el libro admite huecos, ver `trazabilidadCompleta()`).
 *
 * Interacción: hover en desktop; en mobile/tap se fija (pin) tocando un nodo.
 * Filtro "solo con huecos" ilumina las cadenas rotas y apaga las sanas.
 * Read-only, se alimenta de `ForestCtpDB.grafoTrazabilidad`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Eye,
  FileDown,
  Filter,
  PackageOpen,
  RefreshCw,
  ShieldAlert,
  TreePine,
  Truck,
  X as XIcon,
} from "@buleje/design-system/icons";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { printCadenaCustodia } from "@/lib/forestal/ctp-traza-print";
import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";
import CtpNodeDetailLoader, { type DetailTarget } from "./CtpNodeDetailLoader";

const NODE_W = 180;
const NODE_H = 50;
const GAP_Y = 14;
const COL_GAP = 96; // espacio para las líneas entre columnas
const PAD = 12;

type NodeKind = "ingreso" | "corrida" | "despacho";
type NodeStatus = "ok" | "warn" | "muted";
interface Placed {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  top: string;
  sub: string;
  vol: string;
  cites?: boolean;
  status: NodeStatus;
}

const KIND_ACCENT: Record<NodeKind, string> = {
  ingreso: "var(--accent)",
  corrida: "var(--data-info-500)",
  despacho: "var(--data-success-600)",
};

export default function CtpTrazaRadar({ period }: { period: CtpPeriod }) {
  const [g, setG] = useState<TrazaGrafo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [onlyBroken, setOnlyBroken] = useState(false);
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = applyCtpPeriodParams(new URLSearchParams({ grafo: "1" }), period);
      const r = await fetch(`/api/admin/forestal/ctp?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setG((await r.json()).grafo ?? null);
      setPinned(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  // Análisis de completitud: qué corridas tienen materia prima y qué despachos
  // trazan de punta a punta (mirror app-level de `trazabilidadCompleta`).
  const analysis = useMemo(() => {
    if (!g) return null;
    const corridaSurtida = new Set(g.consumos.map((c) => c.to));
    const ingresoUsado = new Set(g.consumos.map((c) => c.from));
    const origenByDespacho = new Map<string, string[]>();
    for (const o of g.origenes) {
      const arr = origenByDespacho.get(o.to) ?? [];
      arr.push(o.from);
      origenByDespacho.set(o.to, arr);
    }
    const despachoIncompleto = new Set<string>();
    for (const d of g.despachos) {
      const origs = origenByDespacho.get(d.id) ?? [];
      const completo = origs.length > 0 && origs.every((cid) => corridaSurtida.has(cid));
      if (!completo) despachoIncompleto.add(d.id);
    }
    const corridaHuerfana = new Set(g.corridas.filter((c) => !corridaSurtida.has(c.id)).map((c) => c.id));
    const status = new Map<string, NodeStatus>();
    for (const w of g.ingresos) status.set(w.id, ingresoUsado.has(w.id) ? "ok" : "muted");
    for (const c of g.corridas) status.set(c.id, corridaHuerfana.has(c.id) ? "warn" : "ok");
    for (const d of g.despachos) status.set(d.id, despachoIncompleto.has(d.id) ? "warn" : "ok");
    return {
      status,
      warnIds: new Set([...corridaHuerfana, ...despachoIncompleto]),
      despachosCompletos: g.despachos.length - despachoIncompleto.size,
      despachosHueco: despachoIncompleto.size,
      corridasHuerfanas: corridaHuerfana.size,
      citesCount: g.ingresos.filter((w) => w.cites).length,
    };
  }, [g]);

  const layout = useMemo(() => {
    if (!g || !analysis) return null;
    const st = (id: string): NodeStatus => analysis.status.get(id) ?? "ok";
    const cols: [Placed[], Placed[], Placed[]] = [[], [], []];
    const rows = Math.max(g.ingresos.length, g.corridas.length, g.despachos.length, 1);
    const H = rows * (NODE_H + GAP_Y) - GAP_Y + PAD * 2;
    const colX = [PAD, PAD + NODE_W + COL_GAP, PAD + 2 * (NODE_W + COL_GAP)];
    const place = (
      arr: { id: string }[], ci: number, kind: NodeKind,
      top: (i: number) => string, sub: (i: number) => string, vol: (i: number) => string, cites?: (i: number) => boolean,
    ) => {
      const colH = arr.length * (NODE_H + GAP_Y) - GAP_Y;
      const y0 = (H - colH) / 2;
      arr.forEach((n, i) =>
        cols[ci].push({ id: n.id, kind, x: colX[ci], y: y0 + i * (NODE_H + GAP_Y), top: top(i), sub: sub(i), vol: vol(i), cites: cites?.(i), status: st(n.id) }),
      );
    };
    place(g.ingresos, 0, "ingreso",
      (i) => `GTF ${g.ingresos[i].gtf || "—"}`, (i) => g.ingresos[i].species ?? "—",
      (i) => `${g.ingresos[i].volumeM3.toFixed(2)} m³`, (i) => g.ingresos[i].cites);
    place(g.corridas, 1, "corrida",
      (i) => `Corrida #${g.corridas[i].lineNo}`, (i) => g.corridas[i].label,
      (i) => g.corridas[i].quantity ? `${g.corridas[i].quantity} ${g.corridas[i].unit ?? ""}`.trim() : "", (i) => g.corridas[i].cites);
    place(g.despachos, 2, "despacho",
      (i) => `Despacho #${g.despachos[i].lineNo}`, (i) => g.despachos[i].destino || g.despachos[i].label,
      (i) => g.despachos[i].quantity ? `${g.despachos[i].quantity}` : "");
    const pos = new Map<string, Placed>();
    for (const c of cols) for (const n of c) pos.set(n.id, n);
    return { cols, pos, W: colX[2] + NODE_W + PAD, H };
  }, [g, analysis]);

  // Conjunto conectado a las semillas (pin > hover > filtro "solo huecos").
  const active = useMemo(() => {
    if (!g || !analysis) return null;
    const seeds = pinned ? [pinned] : hover ? [hover] : onlyBroken ? [...analysis.warnIds] : null;
    if (!seeds || seeds.length === 0) return null;
    const nodes = new Set<string>(seeds);
    const edges = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      const walk = (list: { from: string; to: string }[], pfx: string) => {
        for (const e of list) {
          const k = `${pfx}:${e.from}->${e.to}`;
          if ((nodes.has(e.from) || nodes.has(e.to)) && !edges.has(k)) {
            edges.add(k);
            if (!nodes.has(e.from)) { nodes.add(e.from); changed = true; }
            if (!nodes.has(e.to)) { nodes.add(e.to); changed = true; }
          }
        }
      };
      walk(g.consumos, "c");
      walk(g.origenes, "o");
    }
    return { nodes, edges };
  }, [g, analysis, pinned, hover, onlyBroken]);

  const isEmpty = g && g.ingresos.length === 0 && g.corridas.length === 0 && g.despachos.length === 0;
  const edgeAmber = (id: string) => analysis?.warnIds.has(id) ?? false;

  // De un id de nodo → el objetivo para abrir su ficha completa.
  const targetFor = (id: string): DetailTarget | null => {
    const w = g?.ingresos.find((n) => n.id === id);
    if (w) return { kind: "ingreso", id, gtf: w.gtf };
    if (g?.corridas.some((n) => n.id === id)) return { kind: "corrida", id };
    if (g?.despachos.some((n) => n.id === id)) return { kind: "despacho", id };
    return null;
  };
  const pinnedNode = pinned && layout ? layout.pos.get(pinned) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--text-tertiary)]">
          Cadena de custodia de <strong className="text-[var(--text-secondary)]">{period.label}</strong>: GTF de ingreso → corrida → despacho. Tocá un nodo para fijar de dónde salió y a dónde fue.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {g && !isEmpty && (
            <button type="button" onClick={() => printCadenaCustodia(g, period.label)} title="Documento imprimible de la cadena de custodia (para adjuntar a un informe ARFFS)" className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
              <FileDown className="h-4 w-4" /> Exportar
            </button>
          )}
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
          </button>
        </div>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {loading && !g && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Dibujando la cadena…</p></div>}
      {isEmpty && <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-3 h-9 w-9 opacity-30" /><p className="text-sm">Sin movimientos en {period.label}.</p></div>}

      {layout && g && analysis && !isEmpty && (
        <>
          {/* Resumen de salud de la cadena */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryChip icon={CheckCircle2} tone="success" value={analysis.despachosCompletos} label="Despachos con cadena completa" />
            <SummaryChip icon={AlertTriangle} tone="warning" value={analysis.despachosHueco} label="Despachos con hueco" />
            <SummaryChip icon={Boxes} tone="warning" value={analysis.corridasHuerfanas} label="Corridas sin materia prima" />
            <SummaryChip icon={ShieldAlert} tone="danger" value={analysis.citesCount} label="Ingresos CITES" />
          </div>

          {(analysis.despachosHueco > 0 || analysis.corridasHuerfanas > 0) && (
            <button
              type="button"
              onClick={() => setOnlyBroken((v) => !v)}
              aria-pressed={onlyBroken}
              className={`inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
                onlyBroken
                  ? "border-[var(--data-warning-500)] bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
              }`}
            >
              <Filter className="h-4 w-4" /> {onlyBroken ? "Mostrando solo cadenas con huecos" : "Ver solo cadenas con huecos"}
            </button>
          )}

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <Legend swatch="var(--accent)" icon={PackageOpen} text="Ingreso (GTF)" />
            <Legend swatch="var(--data-info-500)" icon={Boxes} text="Producción" />
            <Legend swatch="var(--data-success-600)" icon={Truck} text="Despacho" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-warning-50)] px-2.5 py-1 text-[var(--data-warning-700)]"><AlertTriangle className="h-3.5 w-3.5" /> Hueco en la cadena</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-error-50)] px-2.5 py-1 text-[var(--data-error-700)]"><ShieldAlert className="h-3.5 w-3.5" /> CITES</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            <span className="rounded-lg bg-[var(--surface-sunken)] py-1.5">Ingreso · {g.ingresos.length}</span>
            <span className="rounded-lg bg-[var(--surface-sunken)] py-1.5">Producción · {g.corridas.length}</span>
            <span className="rounded-lg bg-[var(--surface-sunken)] py-1.5">Despacho · {g.despachos.length}</span>
          </div>

          {/* Barra del nodo fijado: abre la ficha completa (drill-in). */}
          {pinnedNode && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2">
              <div className="min-w-0 text-sm">
                <span className="font-bold text-[var(--text-primary)]">{pinnedNode.top}</span>
                <span className="text-[var(--text-tertiary)]"> · {pinnedNode.sub}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => { const t = targetFor(pinnedNode.id); if (t) setDetail(t); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-600)]">
                  <Eye className="h-3.5 w-3.5" /> Ver ficha completa
                </button>
                <button type="button" onClick={() => setPinned(null)} title="Soltar" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--surface-raised)] to-[var(--surface-sunken)] p-3 shadow-[var(--shadow-sm)]">
            {/* Click en el fondo = soltar el pin. */}
            <svg
              viewBox={`0 0 ${layout.W} ${layout.H}`} width={layout.W} className="max-w-none" style={{ minWidth: "100%" }}
              role="img" aria-label="Grafo de cadena de custodia"
              onClick={() => setPinned(null)}
            >
              <defs>
                {/* Sombra suave editorial para los nodos. */}
                <filter id="ctp-node-shadow" x="-20%" y="-20%" width="140%" height="150%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.10" />
                </filter>
              </defs>
              {g.consumos.map((e) => {
                const k = `c:${e.from}->${e.to}`;
                const onE = !active || active.edges.has(k);
                const amberE = edgeAmber(e.to);
                return <Edge key={k} a={layout.pos.get(e.from)} b={layout.pos.get(e.to)} on={onE} dim={!!active && !active.edges.has(k)} amber={amberE} label={`${e.volumeM3.toFixed(2)} m³`} flow={!!active && active.edges.has(k) && !amberE} />;
              })}
              {g.origenes.map((e) => {
                const k = `o:${e.from}->${e.to}`;
                const onE = !active || active.edges.has(k);
                const amberE = edgeAmber(e.from) || edgeAmber(e.to);
                return <Edge key={k} a={layout.pos.get(e.from)} b={layout.pos.get(e.to)} on={onE} dim={!!active && !active.edges.has(k)} amber={amberE} label={`${e.quantity}`} flow={!!active && active.edges.has(k) && !amberE} />;
              })}
              {layout.cols.flat().map((n) => (
                <Node key={n.id} n={n} dim={!!active && !active.nodes.has(n.id)} pinned={pinned === n.id} onHover={setHover} onPin={(id) => setPinned((p) => (p === id ? null : id))} />
              ))}
            </svg>
          </div>
        </>
      )}

      {detail && <CtpNodeDetailLoader target={detail} onClose={() => setDetail(null)} />}

      <style jsx global>{`
        @keyframes ctp-edge-flow { to { stroke-dashoffset: -19; } }
        .ctp-edge-flow { animation: ctp-edge-flow 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .ctp-edge-flow { animation: none; } }
      `}</style>
    </div>
  );
}

// ─── Piezas internas ───────────────────────────────────────────────────────

function SummaryChip({ icon: Icon, tone, value, label }: { icon: typeof CheckCircle2; tone: "success" | "warning" | "danger"; value: number; label: string }) {
  const dim = value === 0;
  // card + badge del ícono; en dim queda neutro (no grita un 0).
  const card = dim
    ? "border-[var(--rule-soft)] bg-[var(--surface-raised)]"
    : tone === "success"
      ? "border-[var(--data-success-500)] bg-linear-to-br from-[var(--data-success-50)] to-[var(--surface-raised)]"
      : tone === "warning"
        ? "border-[var(--data-warning-500)] bg-linear-to-br from-[var(--data-warning-50)] to-[var(--surface-raised)]"
        : "border-[var(--data-error-500)] bg-linear-to-br from-[var(--data-error-50)] to-[var(--surface-raised)]";
  const accent = dim
    ? "text-[var(--text-tertiary)]"
    : tone === "success" ? "text-[var(--data-success-700)]" : tone === "warning" ? "text-[var(--data-warning-700)]" : "text-[var(--data-error-700)]";
  const badge = dim
    ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
    : tone === "success" ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]" : tone === "warning" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" : "bg-[var(--data-error-100)] text-[var(--data-error-700)]";
  return (
    <div className={`flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 shadow-[var(--shadow-sm)] ${card}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${badge}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className={`font-mono text-2xl font-bold tabular-nums leading-none ${accent}`}>{value}</div>
        <div className="mt-1 text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide leading-tight text-[var(--text-tertiary)]">{label}</div>
      </div>
    </div>
  );
}

function Legend({ swatch, icon: Icon, text }: { swatch: string; icon: typeof Boxes; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-2.5 py-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: swatch }} aria-hidden="true" />
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {text}
    </span>
  );
}

function Edge({ a, b, on, dim, amber, label, flow }: { a?: Placed; b?: Placed; on: boolean; dim: boolean; amber: boolean; label?: string; flow?: boolean }) {
  if (!a || !b) return null;
  const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const color = amber ? "var(--data-warning-500)" : on ? "var(--brand-ink)" : "var(--rule-base)";
  // El path termina 7px antes del nodo para dejar lugar a la punta de flecha.
  const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 7} ${y2}`;
  return (
    <g opacity={dim ? 0.12 : on ? 0.7 : 0.32}>
      <path d={d} fill="none" stroke={color} strokeWidth={on ? 2 : 1.5} strokeDasharray={amber ? "5 4" : undefined} />
      {/* Flujo animado: puntos que corren por la cadena activa (marca la dirección). */}
      {flow && <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="0.5 9" strokeLinecap="round" className="ctp-edge-flow" />}
      {/* Punta de flecha ingreso→corrida→despacho. */}
      <path d={`M ${x2} ${y2} L ${x2 - 8} ${y2 - 4.5} L ${x2 - 8} ${y2 + 4.5} Z`} fill={color} />
      {/* Volumen/cantidad atribuido a ESTE link (lo que fluyó por el eslabón). */}
      {label && !dim && (
        <g transform={`translate(${mx} ${my})`}>
          <rect x={-21} y={-8} width={42} height={15} rx={7.5} fill="var(--surface-raised)" stroke={color} strokeWidth={0.75} />
          <text x={0} y={2.5} fontSize={8} fontWeight={700} textAnchor="middle" fill={amber ? "var(--data-warning-700)" : on ? "var(--text-primary)" : "var(--text-tertiary)"}>{label}</text>
        </g>
      )}
    </g>
  );
}

function Node({ n, dim, pinned, onHover, onPin }: { n: Placed; dim: boolean; pinned: boolean; onHover: (id: string | null) => void; onPin: (id: string) => void }) {
  const warn = n.status === "warn";
  const muted = n.status === "muted";
  const accent = KIND_ACCENT[n.kind];
  const fill = warn ? "var(--data-warning-50)" : muted ? "var(--surface-sunken)" : "var(--surface-raised)";
  const stroke = pinned ? "var(--accent)" : n.cites ? "var(--data-error-500)" : warn ? "var(--data-warning-500)" : "var(--rule-base)";
  return (
    <g
      transform={`translate(${n.x} ${n.y})`}
      opacity={dim ? 0.2 : muted ? 0.65 : 1}
      onMouseEnter={() => onHover(n.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(ev) => { ev.stopPropagation(); onPin(n.id); }}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={`${n.top} — ${n.sub}`}
    >
      <rect width={NODE_W} height={NODE_H} rx={14} fill={fill} stroke={stroke} strokeWidth={pinned ? 2.5 : warn ? 2 : 1.5} filter={dim ? undefined : "url(#ctp-node-shadow)"} />
      {/* pill de acento por columna (inset, no borde a sangre) */}
      <rect x={9} y={11} width={3.5} height={NODE_H - 22} rx={1.75} fill={accent} />
      <text x={20} y={20} fontSize={11} fontWeight={700} fill="var(--text-primary)">{trunc(n.top, 21)}</text>
      <text x={20} y={34} fontSize={9.5} fill="var(--text-tertiary)">{trunc(n.sub, 23)}</text>
      {n.vol && <text x={20} y={44} fontSize={8.5} fontWeight={700} fill={accent}>{trunc(n.vol, 16)}</text>}
      {/* chip de aviso (hueco) */}
      {warn && (
        <>
          <circle cx={NODE_W - 13} cy={NODE_H - 13} r={5.5} fill="var(--data-warning-500)" />
          <text x={NODE_W - 13} y={NODE_H - 10} fontSize={8} fontWeight={800} fill="#fff" textAnchor="middle">!</text>
        </>
      )}
      {n.cites && (
        <>
          <rect x={NODE_W - 44} y={9} width={35} height={14} rx={7} fill="var(--data-error-100)" />
          <text x={NODE_W - 26.5} y={19} fontSize={8} fontWeight={800} fill="var(--data-error-700)" textAnchor="middle">CITES</text>
        </>
      )}
    </g>
  );
}

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
