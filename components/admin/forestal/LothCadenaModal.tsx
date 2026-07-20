"use client";

/**
 * LothCadenaModal — cadena de custodia de un árbol/troza del Libro TH.
 *
 * Drill-in desde la tabla de secciones (o desde cualquier lugar con un código):
 * reconstruye toda la operación del árbol (tala → trozado → despacho/consumo →
 * producto → despacho) + el título habilitante que lo autoriza + las GTF. Es lo
 * que un fiscalizador (o el dueño) quiere ver: "¿de qué árbol salió esto y con
 * qué autorización?". Reusa `ForestLothDB.traceByCode` vía `?trace=<code>`.
 */

import { useCallback, useEffect, useState } from "react";
import {
  X,
  TreePine,
  Loader2,
  MapPin,
  ShieldCheck,
  Truck,
  ArrowRight,
} from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { CardTitle } from "@buleje/design-system";

interface ChainStep {
  section: string;
  lineNo: number;
  entryDate: string;
  treeCode: string | null;
  trozaCode: string | null;
  despachoCode: string | null;
  productType: string | null;
  volumeM3: number | null;
  quantity: number | null;
  unit: string | null;
  gtfNumber: string | null;
}
interface Trace {
  code: string;
  treeCode: string;
  species: string | null;
  scientific: string | null;
  cites: boolean;
  plan: {
    planType: string;
    planNumber: string | null;
    titularName: string;
    tituloHabilitante: string | null;
    resolucionNumber: string | null;
    region: string | null;
    arffs: string | null;
    estado: string;
  } | null;
  gtfs: string[];
  chain: ChainStep[];
}

const SECTION_LABEL: Record<string, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de troza",
  consumo_troza: "Consumo de troza",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};
const unitLabel = (u: string | null) => (u === "m3" ? "m³" : u === "kg" ? "Kg" : u === "unidad" ? "Unidad" : u ?? "");
const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
};

export default function LothCadenaModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/loth?trace=${encodeURIComponent(code)}`, { credentials: "include" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${r.status}`);
      }
      setTrace((await r.json()).trace ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [code]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminModal open onClose={onClose} variant="info" hideCloseButton>
      <div className="flex max-h-[92vh] flex-col bg-[var(--surface-raised)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--data-success-100)] text-[var(--data-success-700)]">
              <TreePine className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <CardTitle as="h2" className="truncate text-base font-bold text-[var(--text-primary)]">
                Cadena de custodia · {code}
              </CardTitle>
              <p className="truncate text-xs text-[var(--text-tertiary)]">Del árbol al despacho, con su autorización</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-lg p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading && (
            <div className="flex items-center gap-2 py-10 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" /> Reconstruyendo la cadena…
            </div>
          )}
          {error && (
            <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
              <strong>Error:</strong> {error}
            </div>
          )}
          {!loading && !error && !trace && (
            <div className="py-10 text-center text-sm text-[var(--text-tertiary)]">
              No se encontró la cadena para <span className="font-mono font-bold">{code}</span>.
            </div>
          )}
          {trace && (
            <div className="space-y-5">
              {/* Hero: especie + CITES */}
              <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-[var(--text-primary)]">{trace.species ?? "Especie sin registrar"}</span>
                  {trace.cites && <span className="rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                </div>
                {trace.scientific && <p className="text-sm italic text-[var(--text-tertiary)]">{trace.scientific}</p>}
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">Árbol raíz <span className="font-mono font-bold text-[var(--text-secondary)]">{trace.treeCode}</span></p>
              </div>

              {/* Autorización (título habilitante) */}
              {trace.plan && (
                <div className="rounded-2xl border border-[var(--accent-muted)] bg-[var(--accent-soft)] p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[var(--accent-dark)]" />
                    <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent-dark)]">Autorización de origen</span>
                  </div>
                  <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <Row k="Titular" v={trace.plan.titularName} />
                    <Row k="Título habilitante" v={trace.plan.tituloHabilitante ?? "—"} mono />
                    <Row k="Plan" v={`${trace.plan.planType} ${trace.plan.planNumber ?? ""}`.trim()} />
                    <Row k="Resolución" v={trace.plan.resolucionNumber ?? "—"} mono />
                    {trace.plan.arffs && <Row k="ARFFS" v={trace.plan.arffs} />}
                    {trace.plan.region && <Row k="Región" v={trace.plan.region} />}
                  </div>
                </div>
              )}

              {/* GTFs */}
              {trace.gtfs.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-tertiary)]"><Truck className="h-3.5 w-3.5" /> GTF:</span>
                  {trace.gtfs.map((g) => (
                    <span key={g} className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-1 font-mono text-xs font-bold text-[var(--text-secondary)]">{g}</span>
                  ))}
                </div>
              )}

              {/* Timeline de operaciones */}
              <div>
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Operaciones ({trace.chain.length})</span>
                <ol className="mt-2 space-y-0">
                  {trace.chain.map((step, i) => (
                    <li key={`${step.section}-${step.lineNo}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
                      {/* Línea vertical */}
                      {i < trace.chain.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-[var(--rule-base)]" aria-hidden="true" />}
                      <span className="z-10 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--data-success-100)] text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--data-success-700)]">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[var(--text-primary)]">{SECTION_LABEL[step.section] ?? step.section}</span>
                          <span className="text-xs text-[var(--text-tertiary)]">{fmtDate(step.entryDate)}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
                          {step.trozaCode && <span className="inline-flex items-center gap-1">Troza <b className="font-mono">{step.trozaCode}</b></span>}
                          {step.productType && <span className="inline-flex items-center gap-1"><ArrowRight className="h-3 w-3 text-[var(--text-tertiary)]" />{step.productType}</span>}
                          {step.volumeM3 != null && <span className="font-mono tabular-nums font-bold text-[var(--text-primary)]">{Number(step.volumeM3).toFixed(4)} m³</span>}
                          {step.quantity != null && <span className="font-mono tabular-nums font-bold text-[var(--text-primary)]">{Number(step.quantity).toFixed(2)} {unitLabel(step.unit)}</span>}
                          {step.gtfNumber && <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]"><Truck className="h-3 w-3" /><span className="font-mono">{step.gtfNumber}</span></span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {trace.plan?.region && (
                <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                  <MapPin className="h-3.5 w-3.5" /> Origen: {trace.plan.region}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminModal>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-[var(--text-tertiary)]">{k}</dt>
      <dd className={`min-w-0 truncate text-right font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}>{v}</dd>
    </div>
  );
}
