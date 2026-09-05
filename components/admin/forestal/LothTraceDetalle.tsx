"use client";

/**
 * LothTraceDetalle — lo que se abre al desplegar un árbol: sus alertas, el
 * embudo de volumen, el recorrido de las 6 secciones SERFOR **con fechas**, y
 * las acciones.
 *
 * Dos cosas que antes no estaban y son media pantalla:
 *  · las FECHAS de cada etapa (el libro se fiscaliza por plazos, no sólo por
 *    volúmenes) y los días que tardó en moverse;
 *  · los códigos dejan de ser texto muerto: la troza abre su cadena de custodia
 *    y la GTF lleva a su guía.
 */

import { MapPin, ExternalLink, Printer, AlertTriangle, Link2, Map as MapIcon } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { TraceOperation } from "@/lib/forestal/loth-trace";
import { printTrozaPasaporte, type PasaporteCaratula } from "@/lib/forestal/loth-pasaporte-print";
import LothTraceEmbudo from "./LothTraceEmbudo";
import { etapasDe, fmtFechaLarga, fmtDias, plural, tonoDe, type TraceNav } from "./loth-trace-ui";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const num = (v: string | null, dp = 4) => (v == null ? "—" : Number(v).toFixed(dp));

export default function LothTraceDetalle({
  op,
  caratula,
  nav,
}: {
  op: TraceOperation;
  caratula?: PasaporteCaratula | null;
  nav?: TraceNav;
}) {
  const tono = tonoDe(op.mermaVeredicto);
  return (
    <div className="border-t border-[var(--rule-soft)]">
      {op.alerts.length > 0 && (
        <div className="space-y-1.5 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 px-4 py-3 sm:px-5">
          {op.alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-sm ${
                a.level === "error"
                  ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                  : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-4 sm:px-5">
        <LothTraceEmbudo op={op} />
      </div>

      <TraceTimeline op={op} nav={nav} />

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => {
            printTrozaPasaporte(op, caratula).catch((err) => console.error("[pasaporte] no se pudo abrir", err));
          }}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white hover:opacity-90"
        >
          <Printer className="h-4 w-4" /> Pasaporte
        </button>
        {nav?.onVerCadena && (
          <button
            type="button"
            onClick={() => nav.onVerCadena?.(op.tree)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <Link2 className="h-4 w-4" /> Cadena de custodia
          </button>
        )}
        {op.gps && nav?.onVerMapa && (
          <button
            type="button"
            onClick={() => nav.onVerMapa?.(op.tree)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <MapIcon className="h-4 w-4" /> Ver en el mapa
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-x-3 text-xs text-[var(--text-tertiary)]">
          <span>{op.stagesReached}/6 etapas</span>
          <span className={tono.texto}>
            merma {op.mermaVolM3.toFixed(3)} m³ ({op.mermaPct.toFixed(1)}%)
          </span>
          {op.diasTalaSalida != null && <span>tala → salida: {fmtDias(op.diasTalaSalida)}</span>}
        </span>
      </div>
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

function TraceTimeline({ op, nav }: { op: TraceOperation; nav?: TraceNav }) {
  const talaVol = op.talaVolM3;
  const estados = Object.values(op.trozaEstado);
  const despachadas = estados.filter((e) => e === "despachada").length;
  const consumidas = estados.filter((e) => e === "consumida").length;
  const etapas = etapasDe(op);

  const cuerpos: (React.ReactNode | null)[] = [
    op.tala[0] ? (
      <div key="1">
        <span>
          <Code>{op.tree}</Code> · Ø {num(op.tala[0].diamMayorM, 2)}/{num(op.tala[0].diamMenorM, 2)} m · L{" "}
          {num(op.tala[0].lengthM, 2)} m · <Vol>{fmtM3(talaVol)} m³</Vol>
        </span>
        <GpsPhoto entry={op.tala[0]} />
      </div>
    ) : null,
    <div key="2" className="space-y-1.5">
      <div className="text-[var(--text-tertiary)]">
        {plural(op.trozado.length, "troza", "trozas")} · <Vol>{fmtM3(op.trozadoVolM3)} m³</Vol>
        <span className="ml-1">
          · {despachadas} despachadas · {consumidas} consumidas ·{" "}
          <span className={op.trozasEnPatio > 0 ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : ""}>
            {op.trozasEnPatio} en patio{op.patioVolM3 > 0 ? ` (${op.patioVolM3.toFixed(2)} m³)` : ""}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {op.trozado.map((t) => {
          const est = t.trozaCode ? op.trozaEstado[t.trozaCode] : undefined;
          return (
            <div key={t.id}>
              <span className="inline-flex items-center gap-1.5">
                <CodeLink code={t.trozaCode} onClick={nav?.onVerCadena} titulo="Ver la cadena de custodia de esta troza" />{" "}
                <span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(t.volumeM3)}</span>
                {t.isRama && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">(rama)</span>}
                {est && <TrozaPill estado={est} />}
              </span>
              <GpsPhoto entry={t} />
            </div>
          );
        })}
      </div>
    </div>,
    <span key="3" className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {op.despachoTroza.map((d) => (
        <CodeLink key={d.id} code={d.trozaCode} onClick={nav?.onVerCadena} titulo="Ver la cadena de custodia de esta troza" />
      ))}
      <span className="text-[var(--text-tertiary)]">→</span>
      {Array.from(new Set(op.despachoTroza.map((d) => d.gtfNumber).filter(Boolean))).map((g) => (
        <CodeLink key={g} code={g as string} onClick={nav?.onVerGtf} titulo="Abrir esta guía en la vista GTF" />
      ))}
    </span>,
    <span key="4">
      {op.consumo.map((c) => (
        <span key={c.id} className="mr-3">
          <CodeLink code={c.trozaCode} onClick={nav?.onVerCadena} titulo="Ver la cadena de custodia de esta troza" />{" "}
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">{num(c.volumeM3)}</span>
        </span>
      ))}
      <span className="text-[var(--text-tertiary)]">
        · <Vol>{fmtM3(op.consumoVolM3)} m³</Vol> al aserrío
      </span>
    </span>,
    <div key="5" className="flex flex-wrap gap-x-4 gap-y-0.5">
      {op.producto.map((p) => (
        <span key={p.id}>
          <span className="font-medium text-[var(--text-primary)]">{p.productType}</span>{" "}
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {num(p.quantity)} {unit(p.unit)}
          </span>
        </span>
      ))}
    </div>,
    <div key="6" className="space-y-0.5">
      {op.despachoPT.map((d) => (
        <span key={d.id} className="block">
          <CodeLink code={d.gtfNumber} onClick={nav?.onVerGtf} titulo="Abrir esta guía en la vista GTF" /> ·{" "}
          <span className="font-medium text-[var(--text-primary)]">{d.productType}</span> ·{" "}
          {d.pieces != null && <span className="text-[var(--text-secondary)]">{d.pieces} pzas · </span>}
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {num(d.quantity)} {unit(d.unit)}
          </span>
        </span>
      ))}
    </div>,
  ];

  return (
    <ol className="px-4 py-4 sm:px-5">
      {etapas.map((s, i) => {
        const done = s.rows.length > 0;
        const espera = etapas[i - 1]?.fecha ?? null;
        const demora = done && espera && s.fecha ? diasEntre(espera, s.fecha) : null;
        return (
          <li key={s.n} className="relative flex gap-3 pb-4 last:pb-0">
            {i < etapas.length - 1 && (
              <span className={`absolute left-[13px] top-7 bottom-0 w-px ${done ? "bg-[var(--data-success-500)]" : "bg-[var(--rule-soft)]"}`} />
            )}
            <span
              className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${
                done ? "bg-[var(--data-success-600)] text-white" : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"
              }`}
            >
              {s.n}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className={`text-sm font-bold ${done ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}>{s.label}</span>
                {done && s.fecha && (
                  <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">{fmtFechaLarga(s.fecha)}</span>
                )}
                {demora != null && demora > 0 && (
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">· {fmtDias(demora)} después</span>
                )}
              </div>
              <div className="mt-0.5 text-sm text-[var(--text-secondary)]">
                {done ? cuerpos[i] : <span className="text-[var(--text-tertiary)]">— sin registros</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function diasEntre(a: string, b: string): number | null {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round(
    (Date.UTC(db.getUTCFullYear(), db.getUTCMonth(), db.getUTCDate()) - Date.UTC(da.getUTCFullYear(), da.getUTCMonth(), da.getUTCDate())) /
      86_400_000,
  );
}

// ─── átomos ──────────────────────────────────────────────────────────────────
function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</span>;
}

/** Un código que lleva a algún lado. Sin handler se comporta como el texto de antes. */
function CodeLink({ code, onClick, titulo }: { code: string | null; onClick?: (c: string) => void; titulo: string }) {
  if (!code) return <Code>—</Code>;
  if (!onClick) return <Code>{code}</Code>;
  return (
    <button
      type="button"
      onClick={() => onClick(code)}
      title={titulo}
      className="rounded font-mono font-bold text-[var(--text-primary)] underline decoration-dotted decoration-1 underline-offset-4 transition-colors hover:text-[var(--data-info-700)] hover:decoration-solid dark:hover:text-[var(--data-info-500)]"
    >
      {code}
    </button>
  );
}

function Vol({ children }: { children: React.ReactNode }) {
  return <span className="font-mono font-bold tabular-nums text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{children}</span>;
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
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 px-2 py-0.5 text-xs font-medium text-[var(--data-success-700)] transition-colors hover:bg-[var(--data-success-500)]/20 dark:text-[var(--data-success-500)]"
        >
          <MapPin className="h-3 w-3 shrink-0" />{" "}
          <span className="font-mono tabular-nums">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>{" "}
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
