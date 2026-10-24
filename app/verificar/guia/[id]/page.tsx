import { Suspense } from "react";
import { ForestLothDespachoDB, type GuiaPublicaLoth } from "@/lib/db/forest-loth-despacho.db";
import { tenantDeVerificacion } from "../../_componentes/tenant-verificacion";
import { BloquePlan, Consultando, MarcoVerificacion, NoEncontrado, fdate } from "../../_componentes/certificado-troza";

/**
 * /verificar/guia/[id] — la lista pública de las trozas de una guía del Libro
 * TH (QR de la hoja de despacho, 08-10). El id es el de una de sus líneas de
 * despacho: el N° de guía se repite entre talonarios y lleva guiones. Muestra
 * lo que el puesto de control contrasta con la carga —código, especie, D1, D2,
 * largo y m³ de cada troza— y el permiso que la ampara. Sin DNI, teléfonos,
 * placa ni plata.
 */

export const metadata = {
  title: "Trozas de la guía · verificación de origen forestal",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ id: string }> };

export default function VerificarGuiaPage(props: Props) {
  return (
    <Suspense fallback={<Consultando />}>
      <Contenido {...props} />
    </Suspense>
  );
}

async function Contenido({ params }: Props) {
  const { id } = await params;
  // Host (subdominio, dominio propio, `/t/<slug>`) o el código de `/v/…` (ADR-486).
  const tenantId = await tenantDeVerificacion();
  const guia = tenantId ? await ForestLothDespachoDB.guiaPublica(tenantId, id.slice(0, 64)).catch(() => null) : null;
  if (!guia) {
    return (
      <MarcoVerificacion kicker="Trozas de la guía de transporte forestal" titulo="Guía no encontrada">
        <NoEncontrado titulo="Guía no encontrada">Este código no corresponde a una guía de este establecimiento.</NoEncontrado>
      </MarcoVerificacion>
    );
  }
  return (
    <MarcoVerificacion kicker="Trozas de la guía de transporte forestal" titulo={<span className="font-mono">GTF {guia.gtfNumber}</span>}>
      <div className="divide-y divide-slate-100">
        <div className="grid grid-cols-3 gap-4 px-6 py-5">
          <Dato label="Fecha de despacho" value={guia.fecha ? fdate(guia.fecha) : "—"} />
          <Dato label="Trozas" value={String(guia.trozas.length)} />
          <Dato label="Volumen" value={`${guia.totalM3.toFixed(3)} m³`} />
          {guia.anulada && (
            <div className="col-span-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              Esta guía fue anulada en el libro: sus trozas no amparan ninguna carga.
            </div>
          )}
        </div>
        {guia.plan && <BloquePlan plan={guia.plan} />}
        {guia.trozas.length > 0 && <TablaTrozas guia={guia} />}
      </div>
    </MarcoVerificacion>
  );
}

const m = (v: number | null, dp: number) => (v == null ? "—" : v.toFixed(dp));

function TablaTrozas({ guia }: { guia: GuiaPublicaLoth }) {
  return (
    <div className="overflow-x-auto px-6 py-5">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">Trozas de la guía</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-600">
            <th className="py-1.5 pr-3 font-semibold">Código</th>
            <th className="py-1.5 pr-3 font-semibold">Especie</th>
            <th className="py-1.5 pr-3 text-right font-semibold">D1 (m)</th>
            <th className="py-1.5 pr-3 text-right font-semibold">D2 (m)</th>
            <th className="py-1.5 pr-3 text-right font-semibold">Largo (m)</th>
            <th className="py-1.5 text-right font-semibold">m³</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {guia.trozas.map((t, i) => (
            <tr key={`${t.codigo}-${i}`} className="border-t border-slate-100">
              <td className="py-1.5 pr-3 font-mono font-bold text-slate-800">{t.codigo}</td>
              <td className="py-1.5 pr-3 text-slate-700">
                {t.especie ?? "—"}
                {t.cites && <span className="ml-1 text-xs font-bold text-red-800">CITES</span>}
              </td>
              <td className="py-1.5 pr-3 text-right">{m(t.d1, 2)}</td>
              <td className="py-1.5 pr-3 text-right">{m(t.d2, 2)}</td>
              <td className="py-1.5 pr-3 text-right">{m(t.largo, 2)}</td>
              <td className="py-1.5 text-right font-semibold">{m(t.m3, 3)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300">
            <td className="py-2 pr-3 text-xs font-bold uppercase tracking-wide text-slate-600" colSpan={5}>
              Total · {guia.trozas.length} troza{guia.trozas.length === 1 ? "" : "s"}
              {guia.sinMedida > 0 && <span className="ml-2 font-normal normal-case">({guia.sinMedida} sin medida, no suman)</span>}
            </td>
            <td className="py-2 text-right font-bold">{guia.totalM3.toFixed(3)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-800">{value}</div>
    </div>
  );
}
