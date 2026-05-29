"use client";

/**
 * LothTraceView — Vista de trazabilidad del LO-TH (ADR-125).
 *
 * Muestra la operación COMPLETA de cada árbol en una sola pantalla:
 * Tala → Trozado → Despacho de trozas → Consumo → Producto terminado →
 * Despacho de producto terminado, como un timeline vertical.
 *
 * Enlaces de trazabilidad:
 *  - Tala / Trozado: por `treeCode`.
 *  - Despacho de trozas / Consumo: por `trozaCode` que pertenece al árbol.
 *  - Producto / Despacho PT: por especie (no hay código de árbol en SERFOR
 *    para productos; un lote puede mezclar árboles) — se marca como "por especie".
 */

import { TreePine, ChevronRight, MapPin, ExternalLink } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

const num = (v: string | null, dp = 4) => (v == null ? "—" : Number(v).toFixed(dp));
const sum = (rows: LothEntryDTO[], key: "volumeM3" | "quantity") =>
  rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);

interface Operation {
  tree: string;
  species: string | null;
  scientific: string | null;
  cites: boolean;
  tala: LothEntryDTO[];
  trozado: LothEntryDTO[];
  despachoTroza: LothEntryDTO[];
  consumo: LothEntryDTO[];
  producto: LothEntryDTO[];
  despachoPT: LothEntryDTO[];
}

function buildOperations(entries: LothEntryDTO[]): Operation[] {
  const reg = entries.filter((e) => e.status !== "anulado");
  const trees = Array.from(
    new Set(reg.filter((e) => e.section === "tala" && e.treeCode).map((e) => e.treeCode as string)),
  );

  return trees.map((tree) => {
    const tala = reg.filter((e) => e.section === "tala" && e.treeCode === tree);
    const trozado = reg.filter((e) => e.section === "trozado" && e.treeCode === tree);
    const trozaCodes = new Set(trozado.map((t) => t.trozaCode).filter(Boolean));
    const belongs = (c: string | null) =>
      !!c && (trozaCodes.has(c) || c.startsWith(`${tree}-`) || c === tree);
    const species = tala[0]?.speciesCommon ?? trozado[0]?.speciesCommon ?? null;
    return {
      tree,
      species,
      scientific: tala[0]?.speciesScientific ?? trozado[0]?.speciesScientific ?? null,
      cites: tala[0]?.cites ?? false,
      tala,
      trozado,
      despachoTroza: reg.filter((e) => e.section === "despacho_troza" && belongs(e.trozaCode)),
      consumo: reg.filter((e) => e.section === "consumo_troza" && belongs(e.trozaCode)),
      producto: species ? reg.filter((e) => e.section === "producto_terminado" && e.speciesCommon === species) : [],
      despachoPT: species ? reg.filter((e) => e.section === "despacho_producto" && e.speciesCommon === species) : [],
    };
  });
}

export default function LothTraceView({ entries }: { entries: LothEntryDTO[] }) {
  const ops = buildOperations(entries);

  if (ops.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
        <TreePine className="mx-auto mb-3 h-10 w-10 opacity-30" />
        <p className="text-base font-medium">No hay operaciones para trazar todavía.</p>
        <p className="mt-1 text-sm">Registrá una tala en la sección 1 para iniciar la trazabilidad de un árbol.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {ops.map((op) => (
        <OperationCard key={op.tree} op={op} />
      ))}
    </div>
  );
}

function OperationCard({ op }: { op: Operation }) {
  const talaVol = sum(op.tala, "volumeM3");
  const trozVol = sum(op.trozado, "volumeM3");
  const consVol = sum(op.consumo, "volumeM3");

  const stages = [
    {
      n: 1,
      title: "Tala",
      done: op.tala.length > 0,
      body:
        op.tala.length > 0 ? (
          <div>
            <span>
              <Code>{op.tree}</Code> · Ø {num(op.tala[0].diamMayorM, 2)}/{num(op.tala[0].diamMenorM, 2)} m · L {num(op.tala[0].lengthM, 2)} m ·{" "}
              <Vol>{talaVol.toFixed(4)} m³</Vol>
            </span>
            <GpsPhotoEvidence entry={op.tala[0]} />
          </div>
        ) : null,
    },
    {
      n: 2,
      title: "Trozado",
      done: op.trozado.length > 0,
      body:
        op.trozado.length > 0 ? (
          <div className="space-y-1">
            <div className="text-[var(--text-tertiary)]">{op.trozado.length} trozas · <Vol>{trozVol.toFixed(4)} m³</Vol></div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              {op.trozado.map((t) => (
                <div key={t.id}>
                  <span>
                    <Code>{t.trozaCode}</Code> <span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(t.volumeM3)}</span>
                    {t.isRama && <span className="ml-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">(rama)</span>}
                  </span>
                  <GpsPhotoEvidence entry={t} />
                </div>
              ))}
            </div>
          </div>
        ) : null,
    },
    {
      n: 3,
      title: "Despacho de trozas",
      done: op.despachoTroza.length > 0,
      body:
        op.despachoTroza.length > 0 ? (
          <span>
            {op.despachoTroza.map((d) => <Code key={d.id} className="mr-1.5">{d.trozaCode}</Code>)}
            {" → "}
            {Array.from(new Set(op.despachoTroza.map((d) => d.gtfNumber).filter(Boolean))).map((g) => (
              <Gtf key={g}>{g}</Gtf>
            ))}
          </span>
        ) : null,
    },
    {
      n: 4,
      title: "Consumo de trozas",
      done: op.consumo.length > 0,
      body:
        op.consumo.length > 0 ? (
          <span>
            {op.consumo.map((c) => (
              <span key={c.id} className="mr-3">
                <Code>{c.trozaCode}</Code> <span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(c.volumeM3)}</span>
              </span>
            ))}
            <span className="text-[var(--text-tertiary)]">· <Vol>{consVol.toFixed(4)} m³</Vol> al aserrío</span>
          </span>
        ) : null,
    },
    {
      n: 5,
      title: "Producto terminado",
      hint: "por especie",
      done: op.producto.length > 0,
      body:
        op.producto.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {op.producto.map((p) => (
              <span key={p.id}>
                <span className="font-medium text-[var(--text-primary)]">{p.productType}</span>{" "}
                <span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(p.quantity)} {unit(p.unit)}</span>
              </span>
            ))}
          </div>
        ) : null,
    },
    {
      n: 6,
      title: "Despacho de producto terminado",
      hint: "por especie",
      done: op.despachoPT.length > 0,
      body:
        op.despachoPT.length > 0 ? (
          <div className="space-y-0.5">
            {op.despachoPT.map((d) => (
              <span key={d.id} className="block">
                <Gtf>{d.gtfNumber}</Gtf> · <span className="font-medium text-[var(--text-primary)]">{d.productType}</span> ·{" "}
                {d.pieces != null && <span className="text-[var(--text-secondary)]">{d.pieces} pzas · </span>}
                <span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(d.quantity)} {unit(d.unit)}</span>
              </span>
            ))}
          </div>
        ) : null,
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* Header de la operación */}
      <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]">
          <TreePine className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Operación · Árbol</span>
            <Code className="text-sm">{op.tree}</Code>
            {op.cites && <span className="rounded bg-[var(--data-danger-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-danger-900)]">CITES</span>}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-[var(--text-primary)]">{op.species ?? "—"}</span>
            {op.scientific && <span className="text-xs italic text-[var(--text-tertiary)]">{op.scientific}</span>}
          </div>
        </div>
      </div>

      {/* Timeline de las 6 etapas */}
      <ol className="px-5 py-4">
        {stages.map((s, i) => (
          <li key={s.n} className="relative flex gap-3 pb-4 last:pb-0">
            {/* línea conectora */}
            {i < stages.length - 1 && (
              <span className={`absolute left-[13px] top-7 bottom-0 w-px ${s.done ? "bg-[var(--data-success-300)]" : "bg-[var(--rule-soft)]"}`} />
            )}
            {/* número */}
            <span
              className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${
                s.done
                  ? "bg-[var(--data-success-600)] text-white"
                  : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"
              }`}
            >
              {s.n}
            </span>
            {/* contenido */}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${s.done ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}>{s.title}</span>
                {s.hint && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">· {s.hint}</span>}
              </div>
              <div className="mt-0.5 text-sm text-[var(--text-secondary)]">
                {s.done ? s.body : <span className="text-[var(--text-tertiary)]">— sin registros</span>}
              </div>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--rule-base)]" />
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── átomos ──────────────────────────────────────────────────────────────
function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</span>;
}
function Vol({ children }: { children: React.ReactNode }) {
  return <span className="font-mono font-bold tabular-nums text-[var(--data-success-700)]">{children}</span>;
}
function Gtf({ children }: { children: React.ReactNode }) {
  return <span className="font-mono font-bold text-[var(--text-primary)]">{children}</span>;
}
function unit(u: string | null) {
  return u === "m3" ? "m³" : u === "kg" ? "Kg" : u === "unidad" ? "u" : (u ?? "");
}

/** Muestra pin GPS con link a OpenStreetMap y/o thumbnail de foto si existen. */
function GpsPhotoEvidence({ entry }: { entry: LothEntryDTO }) {
  const hasGps = entry.gpsLat != null && entry.gpsLng != null;
  const lat = hasGps ? Number(entry.gpsLat) : null;
  const lng = hasGps ? Number(entry.gpsLng) : null;
  if (!hasGps && !entry.photoUrl) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-3">
      {hasGps && lat != null && lng != null && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--data-success-300)] bg-[var(--data-success-50)] px-2 py-0.5 text-xs font-medium text-[var(--data-success-800)] transition-colors hover:bg-[var(--data-success-100)]"
        >
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="font-mono tabular-nums">{lat.toFixed(5)}, {lng.toFixed(5)}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      )}
      {entry.photoUrl && (
        <a href={entry.photoUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.photoUrl}
            alt="Foto de evidencia de campo"
            className="h-16 w-auto rounded-lg border border-[var(--rule-base)] object-cover transition-opacity hover:opacity-80"
          />
        </a>
      )}
    </div>
  );
}
