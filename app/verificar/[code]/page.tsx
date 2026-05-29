import { headers } from "next/headers";
import { ForestLothDB } from "@/lib/db/forest-loth.db";

/**
 * /verificar/[code] — Certificado público de origen legal forestal (Batch 4).
 * Target del QR impreso en la troza/producto. Resuelve el tenant por Host
 * (x-tenant-id seteado por proxy.ts) y muestra la cadena de aprovechamiento.
 * Público (sin auth): solo expone info de origen legal, nunca costos/precios.
 */

const SECTION_LABEL: Record<string, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de trozas",
  consumo_troza: "Consumo de trozas",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};

const fdate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }); }
  catch { return iso; }
};

export const metadata = {
  title: "Verificación de origen forestal",
  robots: { index: false, follow: false },
};

export default async function VerificarPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);
  const h = await headers();
  const tenantId = h.get("x-tenant-id");

  const trace = tenantId ? await ForestLothDB.traceByCode(tenantId, code).catch(() => null) : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Encabezado */}
          <div className="bg-emerald-800 px-6 py-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Certificado de origen forestal</div>
            <div className="mt-1 text-2xl font-bold">{code}</div>
            <div className="text-sm text-emerald-100">Libro de Operaciones · Títulos Habilitantes (SERFOR)</div>
          </div>

          {!trace ? (
            <div className="px-6 py-12 text-center">
              <div className="text-4xl">🔎</div>
              <h1 className="mt-3 text-lg font-bold text-slate-800">Código no encontrado</h1>
              <p className="mt-1 text-sm text-slate-500">No hay registros de origen para <b>{code}</b> en este establecimiento.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* Resumen */}
              <div className="grid grid-cols-2 gap-4 px-6 py-5">
                <Field label="Especie" value={trace.species ?? "—"} />
                <Field label="Nombre científico" value={trace.scientific ?? "—"} italic />
                {trace.cites && (
                  <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">⚠ Especie protegida CITES</div>
                )}
              </div>

              {/* Plan / título habilitante */}
              {trace.plan && (
                <div className="px-6 py-5">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Aprovechamiento autorizado</div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Titular" value={trace.plan.titularName} />
                    <Field label="Documento de gestión" value={`${trace.plan.planType ?? ""} ${trace.plan.planNumber ?? ""}`.trim() || "—"} />
                    <Field label="Título habilitante" value={trace.plan.tituloHabilitante ?? "—"} />
                    <Field label="Resolución" value={trace.plan.resolucionNumber ?? "—"} />
                    <Field label="Región" value={trace.plan.region ?? "—"} />
                    <Field label="ARFFS" value={trace.plan.arffs ?? "—"} />
                  </div>
                </div>
              )}

              {/* GTF */}
              {trace.gtfs.length > 0 && (
                <div className="px-6 py-4">
                  <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Guía(s) de Transporte Forestal</div>
                  <div className="flex flex-wrap gap-2">
                    {trace.gtfs.map((g) => (
                      <span key={g} className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-sm font-bold text-slate-700">{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Cadena de trazabilidad */}
              <div className="px-6 py-5">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Cadena de aprovechamiento</div>
                <ol className="space-y-2">
                  {trace.chain.map((c, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{i + 1}</span>
                      <div className="min-w-0 text-sm">
                        <span className="font-semibold text-slate-800">{SECTION_LABEL[c.section] ?? c.section}</span>
                        <span className="text-slate-400"> · {fdate(c.entryDate)}</span>
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

          <div className="bg-slate-50 px-6 py-3 text-center text-xs text-slate-400">
            Verificación generada por el sistema Buleje · Información de origen conforme al LO-TH (RDE 264-2019-MINAGRI-SERFOR-DE)
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, italic }: { label: string; value: string; italic?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-sm font-medium text-slate-800 ${italic ? "italic" : ""}`}>{value}</div>
    </div>
  );
}
