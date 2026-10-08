/**
 * El certificado público de origen de una troza o árbol del Libro TH: lo
 * comparten `/verificar/[code]` (QR viejo, por código) y
 * `/verificar/troza/[id]` (QR por línea, 08-10). Server component; sólo origen
 * legal, nunca costos ni precios. El marco y el bloque del permiso los usa
 * también la lista pública de una guía (`/verificar/guia/[id]`).
 */

import type { ReactNode } from "react";
import type { ForestLothDB } from "@/lib/db/forest-loth.db";

export type TrazaPublica = NonNullable<Awaited<ReturnType<typeof ForestLothDB.traceByCode>>>;

const SECTION_LABEL: Record<string, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de trozas",
  consumo_troza: "Consumo de trozas",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};

export const fdate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
};

/** La tarjeta con el encabezado verde y el pie legal; el cuerpo lo pone cada página. */
export function MarcoVerificacion({ kicker, titulo, children }: { kicker: string; titulo: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-emerald-800 px-6 py-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-200">{kicker}</div>
            <div className="mt-1 break-words text-2xl font-bold">{titulo}</div>
            <div className="text-sm text-emerald-100">Libro de Operaciones · Títulos Habilitantes (SERFOR)</div>
          </div>
          {children}
          <div className="bg-slate-50 px-6 py-3 text-center text-xs text-slate-500">
            Verificación generada por el sistema Buleje · Información de origen conforme al LO-TH (RDE 264-2019-MINAGRI-SERFOR-DE)
          </div>
        </div>
      </div>
    </main>
  );
}

export function NoEncontrado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <h1 className="text-lg font-bold text-slate-800">{titulo}</h1>
      <p className="mt-1 text-sm text-slate-600">{children}</p>
    </div>
  );
}

/** Lo que se muestra del permiso: nunca DNI ni teléfonos. */
export interface PlanPublico {
  planType: string | null;
  planNumber: string | null;
  titularName: string;
  tituloHabilitante: string | null;
  resolucionNumber: string | null;
  region: string | null;
  arffs: string | null;
}

/** El permiso que autoriza el aprovechamiento. */
export function BloquePlan({ plan }: { plan: PlanPublico }) {
  return (
    <div className="px-6 py-5">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Aprovechamiento autorizado</div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Titular" value={plan.titularName} />
        <Field label="Documento de gestión" value={`${plan.planType ?? ""} ${plan.planNumber ?? ""}`.trim() || "—"} />
        <Field label="Título habilitante" value={plan.tituloHabilitante ?? "—"} />
        <Field label="Resolución" value={plan.resolucionNumber ?? "—"} />
        <Field label="Región" value={plan.region ?? "—"} />
        <Field label="ARFFS" value={plan.arffs ?? "—"} />
      </div>
    </div>
  );
}

export function CertificadoTroza({ code, trace }: { code: string; trace: TrazaPublica | null }) {
  return (
    <MarcoVerificacion kicker="Certificado de origen forestal" titulo={code}>
      {!trace ? (
        <NoEncontrado titulo="Código no encontrado">
          No hay registros de origen para <b>{code}</b> en este establecimiento.
        </NoEncontrado>
      ) : (
        <div className="divide-y divide-slate-100">
          <div className="grid grid-cols-2 gap-4 px-6 py-5">
            <Field label="Especie" value={trace.species ?? "—"} />
            <Field label="Nombre científico" value={trace.scientific ?? "—"} italic />
            {trace.cites && (
              <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">Especie protegida CITES</div>
            )}
          </div>

          {trace.plan && <BloquePlan plan={trace.plan} />}

          {trace.gtfs.length > 0 && (
            <div className="px-6 py-4">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Guía(s) de Transporte Forestal</div>
              <div className="flex flex-wrap gap-2">
                {trace.gtfs.map((g) => (
                  <span key={g} className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-sm font-bold text-slate-700">{g}</span>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 py-5">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">Cadena de aprovechamiento</div>
            <ol className="space-y-2">
              {trace.chain.map((c, i) => (
                <li key={`${c.section}-${c.lineNo}-${i}`} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{i + 1}</span>
                  <div className="min-w-0 text-sm">
                    <span className="font-semibold text-slate-800">{SECTION_LABEL[c.section] ?? c.section}</span>
                    <span className="text-slate-500"> · {fdate(c.entryDate)}</span>
                    <div className="text-slate-600">
                      {c.trozaCode ?? c.treeCode ?? c.productType ?? ""}
                      {c.volumeM3 != null && <> · {c.volumeM3.toFixed(4)} m³</>}
                      {c.quantity != null && <> · {c.quantity} {c.unit ?? ""}</>}
                      {c.gtfNumber && <> · GTF {c.gtfNumber}</>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </MarcoVerificacion>
  );
}

export function Field({ label, value, italic }: { label: string; value: string; italic?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-sm font-medium text-slate-800 ${italic ? "italic" : ""}`}>{value}</div>
    </div>
  );
}

/** Mientras se consulta el libro (la cáscara es estática; `headers()` y la base van dentro del Suspense). */
export function Consultando() {
  return (
    <MarcoVerificacion kicker="Certificado de origen forestal" titulo="…">
      <div className="px-6 py-12 text-center text-sm text-slate-600">Consultando el libro de operaciones…</div>
    </MarcoVerificacion>
  );
}
