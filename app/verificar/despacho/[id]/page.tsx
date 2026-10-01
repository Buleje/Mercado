import { Suspense } from "react";
import { headers } from "next/headers";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { cotejarAnexoConLibro } from "@/lib/forestal/ctp-verificacion";

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

/** Iconos inline: la página es server-only e imprimible, sin JS de cliente. */
function IconOk({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 ${className}`} aria-hidden="true">
      <path d="M16.5 5.5 8 14l-4.5-4.5" />
    </svg>
  );
}
function IconAviso({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 ${className}`} aria-hidden="true">
      <path d="M10 2.8 18.5 17H1.5L10 2.8Z" /><path d="M10 8v3.5" /><path d="M10 14.4h.01" />
    </svg>
  );
}
function IconLupa() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" />
    </svg>
  );
}

const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };
const n4 = (v: unknown) => (v == null ? "—" : Number(v).toFixed(4));
/** Instante (no fecha-only): se muestra en hora de Perú, no UTC. */
const finstant = (iso: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Lima" }); }
  catch { return String(iso); }
};
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

  // Sello de la consulta: una verificación "en vivo" tiene que decir de cuándo
  // es. Se calcula acá (componente dinámico: ya leyó headers()).
  const sello = new Date().toLocaleString("es-PE", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima",
  });

  // El papel contra el libro: nadie cruza doce dígitos de guía en la tranca.
  const cotejo = data
    ? cotejarAnexoConLibro(data.anexo, {
        gtfNumber: data.despacho.gtfNumber,
        pieces: data.despacho.pieces,
        // `quantity` es Decimal de Prisma: el cotejo es puro y trabaja con números.
        quantity: data.despacho.quantity == null ? null : Number(data.despacho.quantity),
        unit: data.despacho.unit,
      })
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
              <IconLupa />
              <h1 className="mt-3 text-lg font-bold text-slate-800">Despacho no encontrado</h1>
              <p className="mt-1 text-sm text-slate-500">No hay registros para este código en este establecimiento.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* Veredicto — lo primero que responde la página */}
              <div className="px-6 py-5">
                {data.despacho.status === "anulado" ? (
                  <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                    <IconAviso /> Este despacho fue ANULADO en el libro. El certificado y el anexo asociados ya no son válidos.
                  </div>
                ) : data.trazabilidad.completa ? (
                  <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    <IconOk />
                    <span>
                      Cadena de custodia completa: el 100% del volumen ({n4(data.trazabilidad.atribuido)} {unitLabel}) tiene
                      corrida de producción e ingreso con guía forestal identificados.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    <IconAviso />
                    <span>
                      Cadena de custodia incompleta al momento de la consulta
                      ({n4(data.trazabilidad.sinAtribuir)} {unitLabel} sin origen atribuido).
                    </span>
                  </div>
                )}
              </div>

              {/* Quién lo transformó — sin esto la verificación no dice de qué planta salió */}
              {data.establecimiento && (data.establecimiento.razonSocial || data.establecimiento.nombreCtp) && (
                <div className="bg-slate-50 px-6 py-5">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Centro de transformación</div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Establecimiento" value={data.establecimiento.nombreCtp || data.establecimiento.razonSocial || "—"} />
                    <Field label="Titular" value={data.establecimiento.razonSocial || "—"} />
                    <Field label="RUC" value={data.establecimiento.ruc || "—"} mono />
                    <Field label="Código de CTP" value={data.establecimiento.codigoCtp || "—"} mono />
                    <Field label="Autoridad forestal (ARFFS)" value={data.establecimiento.arffs || "—"} />
                    <Field label="Registro ante la ARFFS" value={data.establecimiento.registroArffs || "—"} mono />
                    {(data.establecimiento.distrito || data.establecimiento.region) && (
                      <div className="col-span-full">
                        <Field
                          label="Ubicación de la planta"
                          value={[data.establecimiento.distrito, data.establecimiento.provincia, data.establecimiento.region].filter(Boolean).join(" · ") || "—"}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Producto */}
              <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
                <Field label="Fecha de despacho" value={fdate(data.despacho.entryDate)} />
                <Field label="Producto" value={data.despacho.productType ?? "—"} />
                <Field label="Especie" value={data.despacho.speciesCommon ?? "—"} />
                <Field label="Nombre científico" value={data.despacho.speciesScientific ?? "—"} italic />
                <Field label="Cantidad" value={`${n4(data.despacho.quantity)} ${unitLabel}${data.despacho.pieces ? ` · ${data.despacho.pieces} piezas` : ""}`} />
                <Field label="GTF de salida" value={data.despacho.gtfNumber ?? "—"} mono />
                {data.despacho.destino && (
                  <div className="col-span-full"><Field label="Destino declarado" value={data.despacho.destino} /></div>
                )}
                {data.despacho.cites && (
                  <div className="col-span-full flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                    <IconAviso /> Especie protegida CITES
                  </div>
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

              {/* El papel contra el libro: el anexo que acompaña a la guía */}
              <div className="px-6 py-5">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Lista de productos transformados (ANEXO N° 04)</div>
                {data.anexo ? (
                  <>
                    {data.despacho.status === "anulado" && (
                      <div className="mb-3 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                        <IconAviso /> Este anexo ampara un despacho anulado: no vale como respaldo del embarque.
                      </div>
                    )}
                    {cotejo && cotejo.discrepancias.length > 0 && (
                      <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                        <IconAviso />
                        <span>
                          El anexo NO coincide con esta línea del libro:
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 font-normal">
                            {cotejo.discrepancias.map((d) => <li key={d}>{d}</li>)}
                          </ul>
                        </span>
                      </div>
                    )}
                    {cotejo?.coincide && data.despacho.status !== "anulado" && (
                      <div className="mb-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                        <IconOk /> El anexo coincide con lo registrado en el libro.
                      </div>
                    )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="N° de anexo" value={data.anexo.numero || "—"} mono />
                    <Field label="Emitido el" value={fdate(data.anexo.fecha)} />
                    <Field label="Ampara la guía" value={data.anexo.gtf || "—"} mono />
                    <Field
                      label="Contenido declarado"
                      value={`${data.anexo.totalPiezas} piezas · ${n4(data.anexo.totalM3)} m³ · ${data.anexo.hojas} hoja${data.anexo.hojas === 1 ? "" : "s"}`}
                    />
                  </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Este despacho todavía no tiene un ANEXO N° 04 registrado. Si el transportista lleva uno, no
                    coincide con el libro de este establecimiento.
                  </p>
                )}
              </div>

              {/* ¿Esto todavía puede cambiar? */}
              <div className="px-6 py-5">
                {data.periodoCerrado ? (
                  <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <IconOk className="mt-0.5" />
                    <span>
                      <strong className="font-semibold first-letter:uppercase">{data.periodoCerrado.label}</strong> está cerrado desde
                      el {finstant(data.periodoCerrado.closedAt)}: este registro es un acta y ya no admite ediciones ni anulaciones.
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    El mes de este despacho todavía está abierto en el libro: el registro puede corregirse hasta
                    que el establecimiento cierre el período.
                  </div>
                )}
              </div>

              <div className="px-6 py-4 text-xs text-slate-400">
                Consultado el {sello} (hora de Perú), en vivo contra el Libro de Operaciones CTP del
                establecimiento. No reemplaza a la GTF ni al LOE-CTP oficial de SERFOR.
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
