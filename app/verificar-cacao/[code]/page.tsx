import { Suspense } from "react";
import { headers } from "next/headers";
import { CacaoDB } from "@/lib/db/cacao.db";
import { GRADO_LABEL, type CacaoGrado } from "@/lib/cacao/cacao-quality";

/**
 * /verificar-cacao/[code] — Trazabilidad pública del lote de cacao (ADR-128).
 * Target del QR en el saco/lote. Resuelve el tenant por Host (x-tenant-id de
 * proxy.ts). Público (sin auth): solo origen/calidad/beneficio, NUNCA precios.
 * El cuerpo dinámico (headers + DB) va en <Suspense> (Next 16 cacheComponents).
 */
export const metadata = {
  title: "Trazabilidad del cacao",
  robots: { index: false, follow: false },
};

const fdate = (iso: string) => { try { return new Date(iso).toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "UTC" }); } catch { return iso; } };
const GRADO_TONE: Record<string, string> = { I: "bg-emerald-100 text-emerald-800", II: "bg-amber-100 text-amber-800", fuera_norma: "bg-red-100 text-red-800" };

export default async function VerificarCacaoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10 text-stone-900">
      <div className="mx-auto max-w-md">
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-amber-700 to-amber-900 px-6 py-6 text-white">
            <div className="text-xs font-semibold uppercase tracking-widest text-amber-200">🍫 Cacao trazable</div>
            <div className="mt-1 font-mono text-2xl font-bold">{code}</div>
            <div className="text-sm text-amber-100">Origen y calidad verificados por la bodega</div>
          </div>
          <Suspense fallback={<div className="px-6 py-14 text-center text-sm text-stone-400">Cargando trazabilidad…</div>}>
            <TraceBody code={code} />
          </Suspense>
          <div className="bg-stone-50 px-6 py-3 text-center text-xs text-stone-400">Verificación generada por Buleje · Calidad NTP-ISO 2451/1114/2291</div>
        </div>
      </div>
    </main>
  );
}

async function TraceBody({ code }: { code: string }) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  const t = tenantId ? await CacaoDB.traceByCode(tenantId, code).catch(() => null) : null;

  if (!t) {
    return (
      <div className="px-6 py-14 text-center">
        <div className="text-4xl">🔎</div>
        <h1 className="mt-3 text-lg font-bold text-stone-800">Código no encontrado</h1>
        <p className="mt-1 text-sm text-stone-500">No hay registro de trazabilidad para <b>{code}</b> en este establecimiento.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-stone-100">
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <div className="text-xs text-stone-400">Cosechado</div>
          <div className="text-base font-bold capitalize text-stone-800">{fdate(t.fecha)}</div>
        </div>
        {t.grado && <span className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${GRADO_TONE[t.grado] ?? "bg-stone-100 text-stone-700"}`}>{GRADO_LABEL[t.grado as CacaoGrado] ?? t.grado}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 px-6 py-5">
        {t.productorNombre && <Field label="Productor" value={t.productorNombre} />}
        <Field label="Variedad" value={t.variedad ?? "—"} />
        <Field label="Origen" value={t.sector ?? "Pucallpa, Perú"} />
        {t.altitudMsnm != null && <Field label="Altitud" value={`${t.altitudMsnm} msnm`} />}
        {t.certificacion && <div className="col-span-2"><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">✓ {t.certificacion.replace("_", " ")}</span></div>}
      </div>

      {(t.cut.bien != null || t.cut.violeta != null) && (
        <div className="px-6 py-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">Calidad del grano</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-stone-100">
            {[{ v: t.cut.bien ?? 0, c: "#16a34a" }, { v: t.cut.violeta ?? 0, c: "#ff6b5b" }, { v: t.cut.pizarroso ?? 0, c: "#ef4444" }, { v: t.cut.mohoso ?? 0, c: "#b91c1c" }].map((s, i) => s.v > 0 && <div key={i} style={{ width: `${s.v}%`, background: s.c }} />)}
          </div>
          <div className="mt-2 flex justify-between text-xs text-stone-500">
            <span>Bien fermentado {t.cut.bien ?? 0}%</span>
            {t.humedadPct != null && <span>Humedad {t.humedadPct.toFixed(1)}%</span>}
          </div>
        </div>
      )}

      {t.beneficio && (
        <div className="px-6 py-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-400">Beneficio (post-cosecha)</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fermentación" value={t.beneficio.fermDias != null ? `${t.beneficio.fermDias} días${t.beneficio.tipoFermentador ? ` · ${t.beneficio.tipoFermentador}` : ""}` : "—"} />
            <Field label="Secado" value={t.beneficio.secDias != null ? `${t.beneficio.secDias} días${t.beneficio.metodoSecado ? ` · ${t.beneficio.metodoSecado}` : ""}` : "—"} />
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-stone-400">{label}</div>
      <div className="text-sm font-semibold text-stone-800">{value}</div>
    </div>
  );
}
