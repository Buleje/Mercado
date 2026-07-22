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
 * El balance por nodo vive en `lib/forestal/ctp-radar.ts` (puro y con tests):
 * ahí se responde cuánto de cada línea tiene respaldo documental y cuánto queda
 * sin atribuir — la primera versión sólo miraba si la conexión existía, así que
 * un despacho con la mitad del origen sin atribuir salía pintado de verde.
 *
 * Interacción: hover en desktop; en mobile/tap se fija (pin) tocando un nodo.
 * Las fichas de resumen son filtros: tocarlas ilumina esas cadenas y apaga el
 * resto. Read-only, se alimenta de `ForestCtpDB.grafoTrazabilidad`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  CheckCircle2,
  Eye,
  FileDown,
  Maximize2,
  PackageOpen,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ShieldAlert,
  TreePine,
  Truck,
  X as XIcon,
  ZoomIn,
  ZoomOut,
} from "@buleje/design-system/icons";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { printCadenaCustodia } from "@/lib/forestal/ctp-traza-print";
import {
  analizarRadar,
  grosorArista,
  ordenarNodos,
  radarToCsv,
  type RadarOrden,
} from "@/lib/forestal/ctp-radar";
import type { TrazaGrafo } from "@/lib/db/forest-ctp.db";
import CtpNodeDetailLoader, { type DetailTarget } from "./CtpNodeDetailLoader";
import {
  BalanceLinea,
  COL_GAP,
  Edge,
  fmtNum,
  GAP_Y,
  Legend,
  Node,
  NODE_H,
  NODE_W,
  PAD,
  type NodeKind,
  type Placed,
  SummaryChip,
  trunc,
} from "./ctp-radar-svg";

/** Qué subconjunto de la cadena se ilumina. */
type Foco = "todos" | "huecos" | "parciales" | "cites";

const ORDENES: { key: RadarOrden; label: string; hint: string }[] = [
  { key: "linea", label: "Por línea", hint: "Orden del libro (como se registró)" },
  { key: "estado", label: "Por estado", hint: "Primero los huecos y las atribuciones incompletas" },
  { key: "volumen", label: "Por volumen", hint: "De mayor a menor cantidad" },
];

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;

export default function CtpTrazaRadar({ period }: { period: CtpPeriod }) {
  const [g, setG] = useState<TrazaGrafo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [foco, setFoco] = useState<Foco>("todos");
  const [orden, setOrden] = useState<RadarOrden>("linea");
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState("");
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

  /** Balance de la cadena: estado y saldo por nodo (lib pura, con tests). */
  const a = useMemo(() => (g ? analizarRadar(g) : null), [g]);
  const citesIds = useMemo(() => new Set((g?.ingresos ?? []).filter((w) => w.cites).map((w) => w.id)), [g]);

  /** Despachos con parte del origen sin atribuir: el hueco que no se veía. */
  const despachosParciales = useMemo(
    () => (g && a ? g.despachos.filter((d) => a.despachos.get(d.id)?.estado === "parcial") : []),
    [g, a],
  );

  const layout = useMemo(() => {
    if (!g || !a) return null;
    const cols: [Placed[], Placed[], Placed[]] = [[], [], []];
    const rows = Math.max(g.ingresos.length, g.corridas.length, g.despachos.length, 1);
    const H = rows * (NODE_H + GAP_Y) - GAP_Y + PAD * 2;
    const colX = [PAD, PAD + NODE_W + COL_GAP, PAD + 2 * (NODE_W + COL_GAP)];

    // Cada columna se ordena por separado y las funciones reciben el ITEM (no su
    // índice): con el orden configurable, indexar el array original desalinearía
    // las etiquetas respecto del nodo dibujado.
    const place = <T extends { id: string }>(
      arr: T[], ci: number, kind: NodeKind, f: (n: T) => Omit<Placed, "id" | "kind" | "x" | "y" | "status">,
    ) => {
      const colH = arr.length * (NODE_H + GAP_Y) - GAP_Y;
      const y0 = (H - colH) / 2;
      arr.forEach((n, i) =>
        cols[ci].push({
          id: n.id, kind, x: colX[ci], y: y0 + i * (NODE_H + GAP_Y),
          status: a.estado.get(n.id) ?? "ok", ...f(n),
        }),
      );
    };

    place(ordenarNodos(g.ingresos, orden, a.ingresos, (w) => w.volumeM3), 0, "ingreso", (w) => {
      const bal = a.ingresos.get(w.id);
      const saldo = bal && bal.sinAtribuir > 0 ? ` · ${fmtNum(bal.sinAtribuir)} sin usar` : "";
      return { top: `GTF ${w.gtf || "—"}`, sub: w.species ?? "—", vol: `${fmtNum(w.volumeM3)} m³${saldo}`, cites: w.cites, bal };
    });
    place(ordenarNodos(g.corridas, orden, a.corridas, (c) => c.quantity), 1, "corrida", (c) => ({
      top: `Corrida #${c.lineNo}`, sub: c.label, cites: c.cites, bal: a.corridas.get(c.id),
      vol: c.quantity ? `${fmtNum(c.quantity)} ${c.unit ?? ""}`.trim() : "",
    }));
    place(ordenarNodos(g.despachos, orden, a.despachos, (d) => d.quantity), 2, "despacho", (d) => {
      const bal = a.despachos.get(d.id);
      const falta = bal && bal.sinAtribuir > 0 ? ` · falta ${fmtNum(bal.sinAtribuir)}` : "";
      const cantidad = `${fmtNum(d.quantity)} ${d.unit ?? ""}`.trim();
      return { top: `Despacho #${d.lineNo}`, sub: d.destino || d.label, vol: d.quantity ? `${cantidad}${falta}` : "", bal };
    });

    const pos = new Map<string, Placed>();
    for (const c of cols) for (const n of c) pos.set(n.id, n);
    return { cols, pos, W: colX[2] + NODE_W + PAD, H };
  }, [g, a, orden]);

  /** Volumen máximo de cada tipo de arista, para escalar el grosor. */
  const maxFlujo = useMemo(() => ({
    consumo: Math.max(0, ...(g?.consumos ?? []).map((e) => Number(e.volumeM3) || 0)),
    origen: Math.max(0, ...(g?.origenes ?? []).map((e) => Number(e.quantity) || 0)),
  }), [g]);

  // Nodos que matchean la búsqueda (GTF, especie, destino, línea).
  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!g || !q) return null;
    const ids = new Set<string>();
    for (const w of g.ingresos) if (`gtf ${w.gtf ?? ""} ${w.species ?? ""}`.toLowerCase().includes(q)) ids.add(w.id);
    for (const c of g.corridas) if (`corrida #${c.lineNo} corrida ${c.lineNo} ${c.label ?? ""}`.toLowerCase().includes(q)) ids.add(c.id);
    for (const d of g.despachos) if (`despacho #${d.lineNo} despacho ${d.lineNo} ${d.destino ?? ""} ${d.label ?? ""}`.toLowerCase().includes(q)) ids.add(d.id);
    return ids;
  }, [g, query]);

  // Conjunto conectado a las semillas: búsqueda > pin > hover > foco.
  const active = useMemo(() => {
    if (!g || !a) return null;
    const porFoco: Record<Foco, string[]> = {
      todos: [],
      huecos: [...a.warnIds],
      parciales: despachosParciales.map((d) => d.id),
      cites: [...citesIds],
    };
    const seeds = matchIds && matchIds.size ? [...matchIds]
      : pinned ? [pinned]
      : hover ? [hover]
      : porFoco[foco];
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
  }, [g, a, pinned, hover, foco, matchIds, citesIds, despachosParciales]);

  const isEmpty = g && g.ingresos.length === 0 && g.corridas.length === 0 && g.despachos.length === 0;
  const edgeAmber = (id: string) => a?.warnIds.has(id) ?? false;

  // De un id de nodo → el objetivo para abrir su ficha completa.
  const targetFor = (id: string): DetailTarget | null => {
    const w = g?.ingresos.find((n) => n.id === id);
    if (w) return { kind: "ingreso", id, gtf: w.gtf };
    if (g?.corridas.some((n) => n.id === id)) return { kind: "corrida", id };
    if (g?.despachos.some((n) => n.id === id)) return { kind: "despacho", id };
    return null;
  };
  const pinnedNode = pinned && layout ? layout.pos.get(pinned) : null;
  /** Unidad de la línea fijada: los ingresos son m³; producción/despacho, la suya. */
  const unidadDe = (id: string): string =>
    g?.ingresos.some((w) => w.id === id) ? "m³"
      : g?.corridas.find((c) => c.id === id)?.unit
      ?? g?.despachos.find((d) => d.id === id)?.unit
      ?? "";

  const toggleFoco = (f: Foco) => setFoco((prev) => (prev === f ? "todos" : f));

  /** CSV del grafo con los saldos — para cruzar en Excel o adjuntar al informe. */
  const exportarCsv = () => {
    if (!g || !a) return;
    const blob = new Blob([`﻿${radarToCsv(g, a)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    // Slug conservador: el label del período trae acentos y rayas («mayo de
    // 2026 — julio de 2026»), que en Windows ensucian el nombre del archivo.
    const slug = period.label
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    link.download = `cadena-custodia-${slug || "periodo"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Huecos concretos, listos para accionar: cada despacho sin origen, cada
  // corrida sin materia prima y cada despacho con el origen a medio atribuir,
  // con su ficha editable a un click (el mismo modal de atribución que abre el
  // drill-in — encontrar el hueco y cerrarlo en el mismo lugar).
  const huecoDespachos = useMemo(
    () => (g && a ? g.despachos.filter((d) => a.despachos.get(d.id)?.estado === "warn") : []),
    [g, a],
  );
  const huerfanaCorridas = useMemo(
    () => (g && a ? g.corridas.filter((c) => a.corridas.get(c.id)?.estado === "warn") : []),
    [g, a],
  );
  const totalHuecos = huecoDespachos.length + huerfanaCorridas.length + despachosParciales.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--text-tertiary)]">
          Cadena de custodia de <strong className="text-[var(--text-secondary)]">{period.label}</strong>: GTF de ingreso → corrida → despacho. Tocá un nodo para fijar de dónde salió y a dónde fue; la barra de cada línea es la parte con respaldo documental.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {g && !isEmpty && (
            <>
              <button type="button" onClick={exportarCsv} title="Planilla con el saldo de cada línea y el volumen de cada eslabón" className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
                <FileSpreadsheet className="h-4 w-4" /> CSV
              </button>
              <button type="button" onClick={() => printCadenaCustodia(g, period.label)} title="Documento imprimible de la cadena de custodia (para adjuntar a un informe ARFFS)" className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
                <FileDown className="h-4 w-4" /> Imprimir
              </button>
            </>
          )}
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
          </button>
        </div>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {loading && !g && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Dibujando la cadena…</p></div>}
      {isEmpty && <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><TreePine className="mx-auto mb-3 h-9 w-9 opacity-30" /><p className="text-sm">Sin movimientos en {period.label}.</p></div>}

      {layout && g && a && !isEmpty && (
        <>
          {/* Los dos números que un fiscalizador lee primero: cuánta salida traza
              hasta su GTF, y cuánto de lo que entró ya pasó por producción. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {a.totales.trazabilidadPct != null && (
              <Medidor
                pct={a.totales.trazabilidadPct}
                titulo="Trazabilidad de la cadena"
                detalle={`${a.totales.despachosCompletos} de ${g.despachos.length} despachos trazan hasta su GTF de ingreso`}
              />
            )}
            {a.totales.consumoPct != null && (
              <Medidor
                pct={a.totales.consumoPct}
                titulo="Materia prima consumida"
                detalle={`${fmtNum(a.totales.consumidoM3)} de ${fmtNum(a.totales.ingresoM3)} m³ entraron a producción${a.totales.stockSinConsumirM3 > 0 ? ` · ${fmtNum(a.totales.stockSinConsumirM3)} m³ en patio` : ""}`}
                neutro
              />
            )}
          </div>

          {/* Resumen de salud de la cadena — cada ficha es además un filtro. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryChip icon={CheckCircle2} tone="success" value={a.totales.despachosCompletos} label="Despachos con cadena completa" />
            <SummaryChip icon={AlertTriangle} tone="warning" value={a.totales.despachosHueco + a.totales.corridasHuerfanas} label="Eslabones sin origen" onClick={() => toggleFoco("huecos")} activo={foco === "huecos"} />
            <SummaryChip icon={Boxes} tone="info" value={a.totales.despachosParciales} label="Despachos a medio atribuir" onClick={() => toggleFoco("parciales")} activo={foco === "parciales"} />
            <SummaryChip icon={ShieldAlert} tone="danger" value={a.totales.citesCount} label="Ingresos CITES" onClick={() => toggleFoco("cites")} activo={foco === "cites"} />
          </div>

          {/* Huecos accionables: la cadena rota, con el arreglo a un click. El
              libro los admite; el certificado exige cadena completa. */}
          {totalHuecos > 0 && (
            <div className="rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 dark:bg-[var(--data-warning-500)]/12">
              <div className="mb-1 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />
                <p className="font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  {totalHuecos} {totalHuecos === 1 ? "eslabón sin cerrar" : "eslabones sin cerrar"}
                </p>
              </div>
              <p className="mb-3 text-sm text-[var(--text-secondary)]">
                Estos eslabones no trazan (o trazan sólo en parte) hasta su GTF de ingreso. El libro los admite, pero el certificado exige cadena completa — tocá para completarlos.
              </p>
              <ul className="space-y-2">
                {huecoDespachos.map((d) => (
                  <HuecoFila
                    key={d.id} icon={Truck} tono="warning"
                    titulo={`Despacho #${d.lineNo}`}
                    detalle={`${trunc(d.destino || d.label || "—", 32)} — sin origen atribuido`}
                    accion="Atribuir origen"
                    onClick={() => setDetail({ kind: "despacho", id: d.id })}
                  />
                ))}
                {despachosParciales.map((d) => {
                  const bal = a.despachos.get(d.id)!;
                  return (
                    <HuecoFila
                      key={d.id} icon={Truck} tono="info"
                      titulo={`Despacho #${d.lineNo}`}
                      detalle={`${trunc(d.destino || d.label || "—", 26)} — faltan ${fmtNum(bal.sinAtribuir)} ${unidadDe(d.id)} de ${fmtNum(bal.total)} por atribuir`}
                      accion="Completar origen"
                      onClick={() => setDetail({ kind: "despacho", id: d.id })}
                    />
                  );
                })}
                {huerfanaCorridas.map((c) => (
                  <HuecoFila
                    key={c.id} icon={Boxes} tono="warning"
                    titulo={`Corrida #${c.lineNo}`}
                    detalle={`${trunc(c.label || "—", 32)} — sin materia prima`}
                    accion="Atribuir materia prima"
                    onClick={() => setDetail({ kind: "corrida", id: c.id })}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Controles: buscar dentro de la cadena, ordenar y escalar el dibujo. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[15rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar GTF, especie, destino o «corrida 2»…"
                aria-label="Buscar en la cadena de custodia"
                className="h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] focus:outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} title="Limpiar búsqueda" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {matchIds && (
              <span className="shrink-0 text-xs font-bold text-[var(--text-secondary)]">
                {matchIds.size} {matchIds.size === 1 ? "coincidencia" : "coincidencias"}
              </span>
            )}

            {/* Orden de las columnas: por línea del libro, por urgencia o por tamaño. */}
            <div className="inline-flex h-10 shrink-0 items-center overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <span className="flex h-full items-center gap-1.5 border-r-2 border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)]">
                <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" /> Orden
              </span>
              {ORDENES.map((o) => (
                <button
                  key={o.key} type="button" title={o.hint} onClick={() => setOrden(o.key)} aria-pressed={orden === o.key}
                  className={`h-full px-2.5 text-xs font-bold transition ${orden === o.key ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {/* Zoom: con muchas líneas la cadena no entra; achicar la deja de un vistazo. */}
            <div className="inline-flex h-10 shrink-0 items-center overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <button type="button" title="Alejar" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - 0.15).toFixed(2))))} disabled={zoom <= ZOOM_MIN} className="flex h-full w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40">
                <ZoomOut className="h-4 w-4" />
              </button>
              <button type="button" title="Restablecer el tamaño" onClick={() => setZoom(1)} className="h-full border-x-2 border-[var(--rule-base)] px-2 font-mono text-xs font-bold tabular-nums text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" title="Acercar" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + 0.15).toFixed(2))))} disabled={zoom >= ZOOM_MAX} className="flex h-full w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40">
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>

            {foco !== "todos" && (
              <button type="button" onClick={() => setFoco("todos")} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 text-xs font-bold text-[var(--accent)]">
                <Maximize2 className="h-3.5 w-3.5" /> Ver toda la cadena
              </button>
            )}
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <Legend swatch="var(--accent)" icon={PackageOpen} text="Ingreso (GTF)" />
            <Legend swatch="var(--data-info-500)" icon={Boxes} text="Producción" />
            <Legend swatch="var(--data-success-600)" icon={Truck} text="Despacho" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-warning-50)] px-2.5 py-1 text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"><AlertTriangle className="h-3.5 w-3.5" /> Hueco en la cadena</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-info-50)] px-2.5 py-1 text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]"><span className="font-bold">½</span> Atribución incompleta</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-error-50)] px-2.5 py-1 text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]"><ShieldAlert className="h-3.5 w-3.5" /> CITES</span>
            <span className="text-[var(--text-tertiary)]">El grosor de cada línea es el volumen que pasó por ese eslabón.</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            <span className="rounded-lg bg-[var(--surface-sunken)] py-1.5">Ingreso · {g.ingresos.length}</span>
            <span className="rounded-lg bg-[var(--surface-sunken)] py-1.5">Producción · {g.corridas.length}</span>
            <span className="rounded-lg bg-[var(--surface-sunken)] py-1.5">Despacho · {g.despachos.length}</span>
          </div>

          {/* Barra del nodo fijado: su balance + la ficha completa (drill-in). */}
          {pinnedNode && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2">
              <div className="min-w-0 space-y-1">
                <div className="text-sm">
                  <span className="font-bold text-[var(--text-primary)]">{pinnedNode.top}</span>
                  <span className="text-[var(--text-tertiary)]"> · {pinnedNode.sub}</span>
                </div>
                {pinnedNode.bal && <BalanceLinea bal={pinnedNode.bal} unidad={unidadDe(pinnedNode.id)} kind={pinnedNode.kind} />}
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

          {/* Mobile: la cadena es más ancha que la pantalla → se desliza. Sin este
              aviso, en el celu solo se veía media cadena y parecía cortada. */}
          <p className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] sm:hidden">
            Deslizá para ver toda la cadena <span aria-hidden>→</span> · tocá un nodo para el detalle
          </p>
          <div className="relative">
          <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--surface-raised)] to-[var(--surface-sunken)] p-3 shadow-[var(--shadow-sm)]">
            {/* Click en el fondo = soltar el pin. */}
            <svg
              viewBox={`0 0 ${layout.W} ${layout.H}`} width={layout.W * zoom} className="max-w-none" style={{ minWidth: zoom >= 1 ? "100%" : undefined }}
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
                return <Edge key={k} a={layout.pos.get(e.from)} b={layout.pos.get(e.to)} on={onE} dim={!!active && !active.edges.has(k)} amber={amberE} label={`${fmtNum(e.volumeM3)} m³`} flow={!!active && active.edges.has(k) && !amberE} width={grosorArista(e.volumeM3, maxFlujo.consumo)} />;
              })}
              {g.origenes.map((e) => {
                const k = `o:${e.from}->${e.to}`;
                const onE = !active || active.edges.has(k);
                const amberE = edgeAmber(e.from) || edgeAmber(e.to);
                return <Edge key={k} a={layout.pos.get(e.from)} b={layout.pos.get(e.to)} on={onE} dim={!!active && !active.edges.has(k)} amber={amberE} label={fmtNum(e.quantity)} flow={!!active && active.edges.has(k) && !amberE} width={grosorArista(e.quantity, maxFlujo.origen)} />;
              })}
              {layout.cols.flat().map((n) => (
                <Node key={n.id} n={n} dim={!!active && !active.nodes.has(n.id)} pinned={pinned === n.id} match={!!matchIds?.has(n.id)} onHover={setHover} onPin={(id) => setPinned((p) => (p === id ? null : id))} />
              ))}
            </svg>
          </div>
          {/* Fade en el borde derecho (mobile) — señala que hay más cadena al deslizar. */}
          <div aria-hidden className="pointer-events-none absolute right-0.5 top-0.5 bottom-0.5 w-12 rounded-r-2xl bg-linear-to-l from-[var(--surface-sunken)] to-transparent sm:hidden" />
          </div>
        </>
      )}

      {/* Al cerrar la ficha recargamos el grafo: si se atribuyó un origen, el
          hueco desaparece del panel y el % de trazabilidad sube en el acto. */}
      {detail && <CtpNodeDetailLoader target={detail} onClose={() => { setDetail(null); void load(); }} />}

      <style jsx global>{`
        @keyframes ctp-edge-flow { to { stroke-dashoffset: -19; } }
        .ctp-edge-flow { animation: ctp-edge-flow 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .ctp-edge-flow { animation: none; } }
      `}</style>
    </div>
  );
}

// ─── Piezas internas ───────────────────────────────────────────────────────

/** Medidor grande: el número que se lee primero, con su barra. */
function Medidor({ pct, titulo, detalle, neutro }: { pct: number; titulo: string; detalle: string; neutro?: boolean }) {
  // El consumo de materia prima NO es una nota: tener stock sin procesar es
  // normal. Sólo la trazabilidad se semaforiza.
  const tono = neutro
    ? { texto: "text-[var(--text-primary)]", barra: "bg-[var(--accent)]" }
    : pct === 100
      ? { texto: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", barra: "bg-[var(--data-success-500)]" }
      : pct >= 80
        ? { texto: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", barra: "bg-[var(--data-warning-500)]" }
        : { texto: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", barra: "bg-[var(--data-error-500)]" };
  return (
    // La barra va debajo y a todo el ancho: al costado del texto el `flex-1`
    // colapsaba a un guioncito y la proporción dejaba de leerse.
    <div className="space-y-3 rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--surface-raised)] to-[var(--surface-sunken)] p-4">
      <div className="flex items-center gap-3">
        <span className={`font-mono text-4xl font-extrabold tabular-nums leading-none ${tono.texto}`}>{pct}%</span>
        <div className="min-w-0 text-sm">
          <p className="font-bold text-[var(--text-primary)]">{titulo}</p>
          <p className="text-[var(--text-tertiary)]">{detalle}</p>
        </div>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="img" aria-label={`${pct}% — ${titulo}`}>
        <div className={`h-full rounded-full transition-[width] duration-[var(--dur-slow)] ${tono.barra}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Fila de la lista de eslabones sin cerrar. */
function HuecoFila({
  icon: Icon, tono, titulo, detalle, accion, onClick,
}: {
  icon: typeof Truck; tono: "warning" | "info"; titulo: string; detalle: string; accion: string; onClick: () => void;
}) {
  const color = tono === "warning" ? "text-[var(--data-warning-600)]" : "text-[var(--data-info-500)]";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className={`h-4 w-4 shrink-0 ${color}`} />
        <span>
          <span className="font-bold text-[var(--text-primary)]">{titulo}</span>
          <span className="text-[var(--text-tertiary)]"> · {detalle}</span>
        </span>
      </div>
      <button type="button" onClick={onClick} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white hover:bg-[var(--accent-600)]">
        <Eye className="h-3.5 w-3.5" /> {accion}
      </button>
    </li>
  );
}
