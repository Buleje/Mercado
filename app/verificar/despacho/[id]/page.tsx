import { Suspense } from "react";
import { headers } from "next/headers";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";

/**
 * /verificar/despacho/[id] — verificación pública de la cadena de custodia de
 * un despacho del Libro CTP (ADR-135 D3). Target del QR impreso en el
 * certificado de trazabilidad: el cliente escanea y ve la cadena EN VIVO
 * contra el libro, sin confiar en el papel.
 *
 * Mismo criterio que /verificar/[code] (trozas): tenant por Host
 * (x-tenant-id del proxy), sin auth, solo origen legal — nunca costos.
 * El id es un cuid no adivinable.
 */

const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };
const n4 = (v: unknown) => (v == null ? "—" : Number(v).toFixed(4));
const fdate = (iso: Date | string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }); }
  catch { return String(iso); }
};

export const metadata = {
  title: "Verificación de trazabilidad — despacho CTP",
  robots: { index: false, follow: false },
};

export default function VerificarDespachoPage({ params }: { params: Promise<{ id: string }> }) {
  // La cáscara es estática; headers() + DB viven dentro del <Suspense> — sin
  // esto, cacheComponents (Next 16) marca "uncached data outside Suspense".
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Suspense
            fallback={
              <div className="px-6 py-12 text-center text-sm text-slate-500">Consultando el libro de operaciones…</div>
            }
          >
            <VerificacionContenido params={params} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function VerificacionContenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await headers();
  const tenantId = h.get("x-tenant-id");

  const data = tenantId
    ? await ForestCtpDespachoDB.verificacionPublica(tenantId, decodeURIComponent(id)).catch(() => null)
    : null;

  const unitLabel = data?.despacho.unit ? (UNIT_LABELS[data.despacho.unit] ?? data.despacho.unit) : "";

  return (
    <>
      {/* Encabezado */}
      <div className="bg-emerald-800 px-6 py-5 text-white">
        <div className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Verificación de trazabilidad</div>
        <div className="mt-1 text-2xl font-bold">{data ? `Despacho · línea #${data.despacho.lineNo}` : "Despacho CTP"}</div>
        <div className="text-sm text-emerald-100">Cadena de custodia · Libro de Operaciones CTP</div>
      </div>

      {!data ? (
            <div className="px-6 py-12 text-center">
              <div className="text-4xl">🔎</div>
              <h1 className="mt-3 text-lg font-bold text-slate-800">Despacho no encontrado</h1>
              <p className="mt-1 text-sm text-slate-500">No hay registros para este código en este establecimiento.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* Veredicto — lo primero que responde la página */}
              <div className="px-6 py-5">
                {data.despacho.status === "anulado" ? (
                  <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                    ⚠ Este despacho fue ANULADO en el libro. El certificado asociado ya no es válido.
                  </div>
                ) : data.trazabilidad.completa ? (
                  <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    ✔ Cadena de custodia completa: el 100% del volumen ({n4(data.trazabilidad.atribuido)} {unitLabel}) tiene
                    corrida de producción e ingreso con guía forestal identificados.
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    ⚠ Cadena de custodia incompleta al momento de la consulta
                    ({n4(data.trazabilidad.sinAtribuir)} {unitLabel} sin origen atribuido).
                  </div>
                )}
              </div>

              {/* Producto */}
              <div className="grid grid-cols-2 gap-4 px-6 py-5">
                <Field label="Fecha de despacho" value={fdate(data.despacho.entryDate)} />
                <Field label="Producto" value={data.despacho.productType ?? "—"} />
                <Field label="Especie" value={data.despacho.speciesCommon ?? "—"} />
                <Field label="Nombre científico" value={data.despacho.speciesScientific ?? "—"} italic />
                <Field label="Cantidad" value={`${n4(data.despacho.quantity)} ${unitLabel}${data.despacho.pieces ? ` · ${data.despacho.pieces} piezas` : ""}`} />
                <Field label="GTF de salida" value={data.despacho.gtfNumber ?? "—"} mono />
                {data.despacho.cites && (
                  <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">⚠ Especie protegida CITES</div>
                )}
              </div>

              {/* Cadena */}
              <div className="px-6 py-5">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Origen del volumen</div>
                {data.trazabilidad.corridas.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin corridas de producción atribuidas.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-1.5 pr-3">Corrida</th>
                        <th className="py-1.5 pr-3 text-right">Cantidad</th>
                        <th className="py-1.5">Guías GTF de ingreso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.trazabilidad.corridas.map((c) => (
                        <tr key={c.produccionEntryId} className="border-b border-slate-100">
                          <td className="py-2 pr-3 font-mono font-bold">#{c.lineNo}</td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums">{n4(c.quantity)} {unitLabel}</td>
                          <td className="py-2 font-mono text-xs">
                            {c.sinOrigen ? <span className="font-sans font-semibold text-amber-700">sin materia prima atribuida</span> : c.guias.join(" · ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="px-6 py-4 text-xs text-slate-400">
                Consulta en vivo contra el Libro de Operaciones CTP del establecimiento. No reemplaza a la GTF
                ni al LOE-CTP oficial de SERFOR.
              </div>
            </div>
          )}
    </>
  );
}

function Field({ label, value, mono, italic }: { label: string; value: string; mono?: boolean; italic?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold text-slate-800 ${mono ? "font-mono" : ""} ${italic ? "italic" : ""}`}>{value}</div>
    </div>
  );
}
