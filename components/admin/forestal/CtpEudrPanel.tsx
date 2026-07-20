"use client";

/**
 * CtpEudrPanel — geolocalización de orígenes + Declaración de Diligencia Debida
 * (DDS) EUDR (ADR-140). La EUDR bloquea el ingreso a la UE sin geolocalización de
 * la parcela + DDS; la cadena de custodia ya existe, acá se le agrega el dato
 * geográfico y se genera el dossier por despacho.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { CardTitle } from "@buleje/design-system";
import { AlertCircle, CheckCircle2, FileText, Globe, Loader2, MapPin, ShieldCheck } from "@buleje/design-system/icons";

// Reusa el picker de geo del marketplace (Leaflet + pin draggable). ssr:false
// porque Leaflet toca window. Marcar en el mapa = alternativa a tipear lat/lng.
const GeolocationPickerModal = dynamic(() => import("@/components/marketplace/GeolocationPickerModal"), { ssr: false });
import { csrfHeaders } from "@/lib/csrf-client";
import { imprimirDds, type DdsEmisor } from "@/lib/forestal/eudr-print";
import { origenGeolocalizado, type DdsData, type OrigenGeo } from "@/lib/forestal/eudr-types";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

interface OriginRow { originCode: string; originType: string | null; region: string | null; ingresos: number }
interface DespachoRow { id: string; lineNo: number; productType: string | null; speciesCommon: string | null; gtfNumber: string | null; destino: string | null }

const EUDR = "/api/admin/forestal/ctp/eudr";

export default function CtpEudrPanel({ period }: { period: CtpPeriod }) {
  const [origins, setOrigins] = useState<OriginRow[] | null>(null);
  const [geo, setGeo] = useState<Record<string, OrigenGeo>>({});
  const [despachos, setDespachos] = useState<DespachoRow[]>([]);
  const [emisor, setEmisor] = useState<DdsEmisor>({});
  const [error, setError] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [ddsBusy, setDdsBusy] = useState<string | null>(null);
  const [ddsResult, setDdsResult] = useState<{ id: string; riesgo: string; gaps: string[] } | null>(null);
  const [selDesp, setSelDesp] = useState<string>("");
  const [draft, setDraft] = useState<Record<string, { lat: string; lng: string; df: boolean }>>({});
  // Origen cuyo picker de mapa está abierto (null = cerrado).
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (period.from) params.set("from", period.from);
      if (period.to) params.set("to", period.to);
      const [e, d, f] = await Promise.all([
        fetch(EUDR, { credentials: "include" }).then((r) => r.json()),
        fetch(`/api/admin/forestal/ctp?section=despacho&${params}`, { credentials: "include" }).then((r) => r.json()),
        fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
      ]);
      setOrigins(Array.isArray(e.origins) ? e.origins : []);
      const gmap: Record<string, OrigenGeo> = {};
      for (const g of (Array.isArray(e.geo) ? e.geo : []) as OrigenGeo[]) gmap[g.originCode] = g;
      setGeo(gmap);
      setDespachos(Array.isArray(d.entries) ? d.entries : []);
      const ficha = f.ficha ?? f;
      setEmisor({ razonSocial: ficha.razonSocial, ruc: ficha.ruc, codigoCtp: ficha.codigoCtp, registroArffs: ficha.registroArffs });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOrigins([]);
    }
  }, [period.from, period.to]);
  useEffect(() => { void load(); }, [load]);

  function draftOf(code: string) {
    if (draft[code]) return draft[code];
    const g = geo[code];
    return { lat: g?.lat != null ? String(g.lat) : "", lng: g?.lng != null ? String(g.lng) : "", df: g?.deforestationFree === true };
  }
  function setDraftField(code: string, field: "lat" | "lng" | "df", value: string | boolean) {
    setDraft((d) => ({ ...d, [code]: { ...draftOf(code), [field]: value } }));
  }

  async function saveGeo(code: string) {
    const d = draftOf(code);
    setSavingCode(code); setError(null);
    try {
      const body = { originCode: code, lat: d.lat.trim() ? Number(d.lat) : null, lng: d.lng.trim() ? Number(d.lng) : null, deforestationFree: d.df };
      const r = await fetch(EUDR, { method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setGeo((g) => ({ ...g, [code]: j.geo }));
      setDraft((dr) => { const n = { ...dr }; delete n[code]; return n; });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingCode(null);
    }
  }

  async function generarDds(id: string) {
    setDdsBusy(id); setError(null); setDdsResult(null);
    try {
      const r = await fetch(`${EUDR}?despacho=${encodeURIComponent(id)}`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      const dds = j.dds as DdsData;
      imprimirDds(dds, emisor);
      setDdsResult({ id, riesgo: dds.riesgo, gaps: dds.gaps });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDdsBusy(null);
    }
  }

  const geolocalizados = useMemo(() => (origins ?? []).filter((o) => origenGeolocalizado(geo[o.originCode])).length, [origins, geo]);

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Error:</strong> {error}</div>
        </div>
      )}

      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-dark)]"><Globe className="h-5 w-5" /></span>
          <div className="min-w-0">
            <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">Geolocalización de orígenes (EUDR)</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">La UE exige la geolocalización de la parcela de cosecha (Reg. 2023/1115). Cargá las coordenadas de cada concesión/predio del que compraste — se reusan en todos sus ingresos.{origins ? ` ${geolocalizados}/${origins.length} orígenes geolocalizados.` : ""}</p>
          </div>
        </div>

        {origins === null ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
        ) : origins.length === 0 ? (
          <p className="mt-4 rounded-xl border-2 border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">No hay orígenes con código en los ingresos. Cargá ingresos con «Código de Origen» para geolocalizarlos.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {origins.map((o) => {
              const d = draftOf(o.originCode);
              const g = geo[o.originCode];
              const loc = origenGeolocalizado(g);
              const dirty = !!draft[o.originCode];
              return (
                <div key={o.originCode} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                  <div className="min-w-[10rem] flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]"><MapPin className={`h-3.5 w-3.5 ${loc ? "text-[var(--data-success-700)]" : "text-[var(--text-tertiary)]"}`} /> {o.originCode}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{o.originType ?? "—"}{o.region ? ` · ${o.region}` : ""} · {o.ingresos} ingreso{o.ingresos === 1 ? "" : "s"}</p>
                  </div>
                  <input inputMode="decimal" value={d.lat} onChange={(e) => setDraftField(o.originCode, "lat", e.target.value)} placeholder="lat" className="h-11 w-28 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]" />
                  <input inputMode="decimal" value={d.lng} onChange={(e) => setDraftField(o.originCode, "lng", e.target.value)} placeholder="lng" className="h-11 w-28 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]" />
                  <button type="button" onClick={() => setPickerFor(o.originCode)} title="Marcá la parcela en el mapa en vez de tipear las coordenadas" className="inline-flex h-11 items-center gap-1.5 rounded-lg border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/15">
                    <MapPin className="h-4 w-4" /> <span className="hidden sm:inline">Mapa</span>
                  </button>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
                    <input type="checkbox" checked={d.df} onChange={(e) => setDraftField(o.originCode, "df", e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" /> sin deforestación
                  </label>
                  <button type="button" onClick={() => void saveGeo(o.originCode)} disabled={savingCode === o.originCode || !dirty} className="inline-flex h-11 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40">
                    {savingCode === o.originCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Guardar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DDS por despacho */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <CardTitle as="h3" className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]"><FileText className="h-4 w-4" /> Generar Declaración de Diligencia Debida (DDS)</CardTitle>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Elegí un despacho del período: el DDS camina su cadena de custodia, adjunta la geolocalización de cada origen y evalúa el riesgo (solo «negligible» si traza + geo + sin-deforestación).</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <select value={selDesp} onChange={(e) => setSelDesp(e.target.value)} className="h-12 min-w-[16rem] flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-base font-bold text-[var(--text-primary)] focus:border-[var(--accent)]">
            <option value="">Elegí un despacho…</option>
            {despachos.map((d) => (
              <option key={d.id} value={d.id}>#{d.lineNo} · {d.productType ?? "—"} · {d.speciesCommon ?? "—"}{d.gtfNumber ? ` · ${d.gtfNumber}` : ""}{d.destino ? ` → ${d.destino}` : ""}</option>
            ))}
          </select>
          <button type="button" onClick={() => selDesp && void generarDds(selDesp)} disabled={!selDesp || ddsBusy === selDesp} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
            {ddsBusy === selDesp ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generar DDS
          </button>
        </div>
        {ddsResult && ddsResult.id === selDesp && (
          <div className={`mt-4 rounded-xl border-2 p-3 text-sm ${ddsResult.riesgo === "negligible" ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]" : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)]"}`}>
            <p className="flex items-center gap-2 font-bold">{ddsResult.riesgo === "negligible" ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} Riesgo {ddsResult.riesgo === "negligible" ? "NEGLIGIBLE — apto para la UE" : "NO negligible"}</p>
            {ddsResult.gaps.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{ddsResult.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>}
            <p className="mt-1 text-xs opacity-80">El DDS se abrió para imprimir/PDF.</p>
          </div>
        )}
        {despachos.length === 0 && <p className="mt-3 text-sm text-[var(--text-tertiary)]">No hay despachos en el período seleccionado.</p>}
      </div>

      {/* Picker de mapa: marcar la parcela con el pin → llena lat/lng del origen. */}
      {pickerFor && (
        <GeolocationPickerModal
          open
          title={`Ubicar la parcela · ${pickerFor}`}
          onClose={() => setPickerFor(null)}
          onConfirm={(lat, lon) => {
            setDraftField(pickerFor, "lat", lat.toFixed(6));
            setDraftField(pickerFor, "lng", lon.toFixed(6));
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}
