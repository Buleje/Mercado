"use client";

/**
 * LothTraceCard — tarjeta de trazabilidad de UN árbol. Cabecera escaneable
 * (código, especie, estado de cadena, rendimiento, progreso de etapas, alertas)
 * + detalle colapsable con el timeline completo de las 6 secciones SERFOR +
 * acciones (Pasaporte imprimible · ubicación GPS).
 */

import { useEffect, useState } from "react";
import { TreePine, ChevronDown, MapPin, ExternalLink, Printer, AlertTriangle, CheckCircle2, Warehouse } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { TraceOperation } from "@/lib/forestal/loth-trace";
import { printTrozaPasaporte } from "@/lib/forestal/loth-pasaporte-print";

const num = (v: string | null, dp = 4) => (v == null ? "—" : Number(v).toFixed(dp));

interface Caratula {
  titularName?: string | null;
  tituloHabilitante?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
}

const CHAIN_META: Record<TraceOperation["chain"], { label: string; cls: string }> = {
  completa: { label: "Cadena completa", cls: "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]" },
  parcial: { label: "En proceso", cls: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)]" },
  iniciada: { label: "Solo tala", cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]" },
};

export default function LothTraceCard({ op, caratula, matchHint }: { op: TraceOperation; caratula?: Caratula | null; matchHint?: string | null }) {
  const [open, setOpen] = useState(op.alerts.length > 0 || !!matchHint);
  // Auto-expandir cuando la búsqueda inversa acierta por troza/GTF (el prop cambia
  // después del montaje → el initializer de useState no alcanza).
  useEffect(() => {
    if (matchHint) setOpen(true);
  }, [matchHint]);
  const chain = CHAIN_META[op.chain];
  const rendColor = op.rendimientoPct >= 60 ? "text-[var(--data-success-700)]" : op.rendimientoPct >= 40 ? "text-[var(--data-warning-700)]" : "text-[var(--data-error-700)]";
  const rendBar = Math.min(100, op.rendimientoPct);

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* Cabecera clickable */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--surface-canvas)]/50 sm:px-5"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]">
          <TreePine className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          {/* fila 1: código + especie + badges */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{op.tree}</span>
            <span className="text-sm font-bold text-[var(--text-primary)]">{op.species ?? "—"}</span>
            {op.scientific && <span className="hidden text-xs italic text-[var(--text-tertiary)] sm:inline">{op.scientific}</span>}
            {op.cites && <span className="rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${chain.cls}`}>
              {op.chain === "completa" && <CheckCircle2 className="h-3 w-3" />}
              {chain.label}
            </span>
            {op.alerts.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">
                <AlertTriangle className="h-3 w-3" /> {op.alerts.length}
              </span>
            )}
            {op.trozasEnPatio > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">
                <Warehouse className="h-3 w-3" /> {op.trozasEnPatio} en patio
              </span>
            )}
          </div>
          {/* fila 2: embudo + progreso de etapas */}
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="min-w-[13rem] flex-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-tertiary)]">
                  Talado <b className="font-mono tabular-nums text-[var(--text-secondary)]">{op.talaVolM3.toFixed(2)}</b> → Trozado <b className="font-mono tabular-nums text-[var(--text-secondary)]">{op.trozadoVolM3.toFixed(2)}</b> m³
                </span>
                <span className={`font-mono font-bold tabular-nums ${rendColor}`}>
                  {/* Un decimal, del volumen y no del entero: el KPI de arriba
                      y la tabla de abajo dicen 97.7% para este mismo árbol, y
                      acá salía 98%. Tres cifras para un solo hecho. */}
                  {Number(op.talaVolM3) > 0 ? ((Number(op.trozadoVolM3) / Number(op.talaVolM3)) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div className="h-full rounded-full bg-[var(--data-success-500)] transition-all" style={{ width: `${rendBar}%` }} />
              </div>
            </div>
            <StageDots op={op} />
          </div>
          {matchHint && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-[var(--data-info-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)]">
              <MapPin className="h-3 w-3" /> {matchHint}
            </p>
          )}
        </div>
        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Detalle */}
      {open && (
        <div className="border-t border-[var(--rule-soft)]">
          {op.alerts.length > 0 && (
            <div className="space-y-1.5 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 px-4 py-3 sm:px-5">
              {op.alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 text-sm ${a.level === "error" ? "text-[var(--data-error-700)]" : "text-[var(--data-warning-700)]"}`}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          )}

          <TraceTimeline op={op} />

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={() => printTrozaPasaporte(op, caratula)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90"
            >
              <Printer className="h-4 w-4" /> Pasaporte
            </button>
            {op.gps && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${op.gps.lat}&mlon=${op.gps.lng}#map=16/${op.gps.lat}/${op.gps.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
              >
                <MapPin className="h-4 w-4" /> Ver ubicación <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </a>
            )}
            <span className="ml-auto text-xs text-[var(--text-tertiary)]">{op.stagesReached}/6 etapas · merma {op.mermaVolM3.toFixed(3)} m³</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── progreso de las 6 etapas (dots) ─────────────────────────────────────────
function StageDots({ op }: { op: TraceOperation }) {
  const stages = [op.tala, op.trozado, op.despachoTroza, op.consumo, op.producto, op.despachoPT];
  const labels = ["Tala", "Trozado", "Desp. troza", "Consumo", "Producto", "Desp. PT"];
  return (
    <div className="flex items-center gap-1.5" aria-label={`${op.stagesReached} de 6 etapas`}>
      {stages.map((s, i) => (
        <span
          key={i}
          title={`${labels[i]}: ${s.length > 0 ? s.length + " registro(s)" : "sin registros"}`}
          className={`h-2.5 w-2.5 rounded-full ${s.length > 0 ? "bg-[var(--data-success-500)]" : "bg-[var(--surface-sunken)] ring-1 ring-inset ring-[var(--rule-base)]"}`}
        />
      ))}
    </div>
  );
}

// ─── timeline detallado de las 6 secciones ───────────────────────────────────
const TROZA_PILL: Record<string, { label: string; cls: string }> = {
  despachada: { label: "despachada", cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
  consumida: { label: "consumida", cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" },
  patio: { label: "en patio", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" },
};
function TrozaPill({ estado }: { estado: "despachada" | "consumida" | "patio" }) {
  const p = TROZA_PILL[estado];
  return <span className={`rounded px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold ${p.cls}`}>{p.label}</span>;
}

function TraceTimeline({ op }: { op: TraceOperation }) {
  const talaVol = op.talaVolM3;
  const estados = Object.values(op.trozaEstado);
  const despachadas = estados.filter((e) => e === "despachada").length;
  const consumidas = estados.filter((e) => e === "consumida").length;
  const stages = [
    { n: 1, title: "Tala", done: op.tala.length > 0, body: op.tala[0] ? (
      <div>
        <span><Code>{op.tree}</Code> · Ø {num(op.tala[0].diamMayorM, 2)}/{num(op.tala[0].diamMenorM, 2)} m · L {num(op.tala[0].lengthM, 2)} m · <Vol>{talaVol.toFixed(4)} m³</Vol></span>
        <GpsPhoto entry={op.tala[0]} />
      </div>
    ) : null },
    { n: 2, title: "Trozado", done: op.trozado.length > 0, body: (
      <div className="space-y-1.5">
        <div className="text-[var(--text-tertiary)]">
          {op.trozado.length} trozas · <Vol>{op.trozadoVolM3.toFixed(4)} m³</Vol>
          <span className="ml-1">· {despachadas} despachadas · {consumidas} consumidas · <span className={op.trozasEnPatio > 0 ? "font-bold text-[var(--data-warning-700)]" : ""}>{op.trozasEnPatio} en patio{op.patioVolM3 > 0 ? ` (${op.patioVolM3.toFixed(2)} m³)` : ""}</span></span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {op.trozado.map((t) => {
            const est = t.trozaCode ? op.trozaEstado[t.trozaCode] : undefined;
            return (
              <div key={t.id}>
                <span className="inline-flex items-center gap-1.5">
                  <Code>{t.trozaCode}</Code> <span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(t.volumeM3)}</span>
                  {t.isRama && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">(rama)</span>}
                  {est && <TrozaPill estado={est} />}
                </span>
                <GpsPhoto entry={t} />
              </div>
            );
          })}
        </div>
      </div>
    ) },
    { n: 3, title: "Despacho de trozas", done: op.despachoTroza.length > 0, body: (
      <span>{op.despachoTroza.map((d) => <Code key={d.id} className="mr-1.5">{d.trozaCode}</Code>)}{" → "}{Array.from(new Set(op.despachoTroza.map((d) => d.gtfNumber).filter(Boolean))).map((g) => <Code key={g} className="mr-1.5">{g}</Code>)}</span>
    ) },
    { n: 4, title: "Consumo de trozas", done: op.consumo.length > 0, body: (
      <span>{op.consumo.map((c) => <span key={c.id} className="mr-3"><Code>{c.trozaCode}</Code> <span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(c.volumeM3)}</span></span>)}<span className="text-[var(--text-tertiary)]">· <Vol>{op.consumoVolM3.toFixed(4)} m³</Vol> al aserrío</span></span>
    ) },
    { n: 5, title: "Producto terminado", hint: "por especie", done: op.producto.length > 0, body: (
      <div className="flex flex-wrap gap-x-4 gap-y-0.5">{op.producto.map((p) => <span key={p.id}><span className="font-medium text-[var(--text-primary)]">{p.productType}</span> <span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(p.quantity)} {unit(p.unit)}</span></span>)}</div>
    ) },
    { n: 6, title: "Despacho de producto terminado", hint: "por especie", done: op.despachoPT.length > 0, body: (
      <div className="space-y-0.5">{op.despachoPT.map((d) => <span key={d.id} className="block"><Code>{d.gtfNumber}</Code> · <span className="font-medium text-[var(--text-primary)]">{d.productType}</span> · {d.pieces != null && <span className="text-[var(--text-secondary)]">{d.pieces} pzas · </span>}<span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(d.quantity)} {unit(d.unit)}</span></span>)}</div>
    ) },
  ];
  return (
    <ol className="px-4 py-4 sm:px-5">
      {stages.map((s, i) => (
        <li key={s.n} className="relative flex gap-3 pb-4 last:pb-0">
          {i < stages.length - 1 && <span className={`absolute left-[13px] top-7 bottom-0 w-px ${s.done ? "bg-[var(--data-success-500)]" : "bg-[var(--rule-soft)]"}`} />}
          <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${s.done ? "bg-[var(--data-success-600)] text-white" : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"}`}>{s.n}</span>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${s.done ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}>{s.title}</span>
              {s.hint && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">· {s.hint}</span>}
            </div>
            <div className="mt-0.5 text-sm text-[var(--text-secondary)]">{s.done ? s.body : <span className="text-[var(--text-tertiary)]">— sin registros</span>}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ─── átomos ──────────────────────────────────────────────────────────────────
function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</span>;
}
function Vol({ children }: { children: React.ReactNode }) {
  return <span className="font-mono font-bold tabular-nums text-[var(--data-success-700)]">{children}</span>;
}
function unit(u: string | null) {
  return u === "m3" ? "m³" : u === "kg" ? "Kg" : u === "unidad" ? "u" : u ?? "";
}
function GpsPhoto({ entry }: { entry: LothEntryDTO }) {
  const hasGps = entry.gpsLat != null && entry.gpsLng != null;
  const lat = hasGps ? Number(entry.gpsLat) : null;
  const lng = hasGps ? Number(entry.gpsLng) : null;
  if (!hasGps && !entry.photoUrl) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-3">
      {hasGps && lat != null && lng != null && (
        <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-[var(--data-success-500)] bg-[var(--data-success-50)] px-2 py-0.5 text-xs font-medium text-[var(--data-success-700)] transition-colors hover:bg-[var(--data-success-100)]">
          <MapPin className="h-3 w-3 shrink-0" /> <span className="font-mono tabular-nums">{lat.toFixed(5)}, {lng.toFixed(5)}</span> <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      )}
      {entry.photoUrl && (
        <a href={entry.photoUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.photoUrl} alt="Foto de evidencia de campo" className="h-16 w-auto rounded-lg border border-[var(--rule-base)] object-cover transition-opacity hover:opacity-80" />
        </a>
      )}
    </div>
  );
}
