import { Suspense } from "react";
import { headers } from "next/headers";
import { ForestLoteDB } from "@/lib/db/forest-lote.db";

/**
 * /verificar/lote/[id] — verificación pública de un lote de producción forestal
 * (ADR-136). Target del QR del certificado/etiqueta: el comprador escanea y ve
 * el lote y su cadena de custodia EN VIVO contra el libro.
 *
 * Sin auth (id = cuid no adivinable); tenant por Host (x-tenant-id del proxy);
 * solo origen legal — nunca costos. Anulado se dice, no se esconde.
 */

const UNIT_LABELS: Record<string, string> = { m3: "m³", kg: "Kg", pt: "pt", unidad: "unidad" };
const n4 = (v: unknown) => (v == null ? "—" : Number(v).toFixed(4));
const fdate = (iso: Date | string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }); }
  catch { return String(iso); }
};

const STATUS_LABEL: Record<string, string> = { abierto: "Abierto", cerrado: "Cerrado", despachado: "Despachado", anulado: "Anulado" };

export const metadata = {
  title: "Verificación de lote forestal",
  robots: { index: false, follow: false },
};

export default function VerificarLotePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Suspense fallback={<div className="px-6 py-12 text-center text-sm text-slate-500">Consultando el libro de operaciones…</div>}>
            <LoteContenido params={params} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function LoteContenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  const data = tenantId ? await ForestLoteDB.verificacionPublica(tenantId, decodeURIComponent(id)).catch(() => null) : null;
  const unitLabel = data?.lote.unit ? (UNIT_LABELS[data.lote.unit] ?? data.lote.unit) : "";

  return (
    <>
      <div className="bg-emerald-800 px-6 py-5 text-white">
        <div className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Verificación de lote</div>
        <div className="mt-1 text-2xl font-bold">{data ? `Lote ${data.lote.loteCode}` : "Lote forestal"}</div>
        <div className="text-sm text-emerald-100">Producción forestal · Cadena de custodia</div>
      </div>

      {!data ? (
        <div className="px-6 py-12 text-center">
          <div className="text-4xl">🔎</div>
          <h1 className="mt-3 text-lg font-bold text-slate-800">Lote no encontrado</h1>
          <p className="mt-1 text-sm text-slate-500">No hay registros para este código en este establecimiento.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          <div className="px-6 py-5">
            {data.lote.status === "anulado" ? (
              <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">⚠ Este lote fue ANULADO en el libro. Su certificado ya no es válido.</div>
            ) : data.trazabilidad?.completa ? (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">✔ Cadena de custodia completa: las {data.trazabilidad.corridas.length} corridas del lote tienen su materia prima con guía forestal identificada.</div>
            ) : (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">⚠ Cadena de custodia incompleta al momento de la consulta.</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 px-6 py-5">
            <Field label="Estado" value={STATUS_LABEL[data.lote.status] ?? data.lote.status} />
            <Field label="Producto" value={data.lote.productType ?? "—"} />
            <Field label="Especie" value={data.lote.speciesCommon ?? "—"} />
            <Field label="Nombre científico" value={data.lote.speciesScientific ?? "—"} italic />
            <Field label="Cantidad total" value={`${n4(data.trazabilidad?.totalCantidad)} ${unitLabel}`} />
            <Field label="Grado de calidad" value={data.lote.grade ?? "—"} />
            <Field label="Fecha de creación" value={fdate(data.lote.createdAt)} />
            {data.lote.cites && <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">⚠ Especie protegida CITES</div>}
          </div>

          <div className="px-6 py-5">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">Cadena de custodia — corridas del lote</div>
            {!data.trazabilidad || data.trazabilidad.corridas.length === 0 ? (
              <p className="text-sm text-slate-500">Sin corridas de producción atribuidas.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1.5 pr-3">Corrida</th><th className="py-1.5 pr-3 text-right">Cantidad</th><th className="py-1.5">Guías GTF de ingreso</th></tr></thead>
                <tbody>
                  {data.trazabilidad.corridas.map((c) => (
                    <tr key={c.produccionEntryId} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-mono font-bold">#{c.lineNo}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{n4(c.quantity)} {unitLabel}</td>
                      <td className="py-2 font-mono text-xs">{c.sinOrigen ? <span className="font-sans font-semibold text-amber-700">sin materia prima atribuida</span> : c.guias.join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="px-6 py-4 text-xs text-slate-400">Consulta en vivo contra el Libro de Operaciones CTP del establecimiento. No reemplaza a la GTF ni al LOE-CTP oficial de SERFOR.</div>
        </div>
      )}
    </>
  );
}

function Field({ label, value, italic }: { label: string; value: string; italic?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold text-slate-800 ${italic ? "italic" : ""}`}>{value}</div>
    </div>
  );
}
