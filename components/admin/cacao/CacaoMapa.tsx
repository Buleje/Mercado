"use client";

/**
 * CacaoMapa — mapa agregado de parcelas de productores de cacao. Reusa los
 * lat/long que ya se capturan en la ficha (form GPS + picker Leaflet) pero que
 * nunca se veían juntos. Multi-marker con popup (kg, pago, lotes) + fitBounds,
 * KPIs de cobertura geográfica y aviso de productores sin ubicar. Brandon 2026-07-02.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Scale, Layers, RefreshCw, AlertCircle, Navigation } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import LeafletMap, { type LeafletMarker } from "@/components/LeafletMap";
import { BRAND_GEO } from "@/lib/geo";

interface PStats { kg: number; pagado: number; lotes: number }
interface Producer {
  id: string; codigo: string | null; nombre: string; sector: string | null;
  latitud: string | null; longitud: string | null; status: string; stats: PStats;
}

const n2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }) as Record<string, string>)[c] ?? c);
const coord = (v: string | null): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function CacaoMapa() {
  const [producers, setProducers] = useState<Producer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao?view=producers-stats&all=1", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setProducers(d.producers ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const geo = useMemo(() => producers.filter((p) => coord(p.latitud) != null && coord(p.longitud) != null), [producers]);
  const sinUbicar = producers.length - geo.length;

  const markers = useMemo<LeafletMarker[]>(() => geo.map((p) => {
    const kg = p.stats.lotes ? `${n2(p.stats.kg)} kg · S/ ${n2(p.stats.pagado)} · ${p.stats.lotes} lote${p.stats.lotes === 1 ? "" : "s"}` : "Sin compras aún";
    const sub = [p.codigo, p.sector].filter(Boolean).map((x) => esc(String(x))).join(" · ");
    return {
      lat: coord(p.latitud)!,
      lon: coord(p.longitud)!,
      popupHtml: `<div style="min-width:150px"><strong>${esc(p.nombre)}</strong>${sub ? `<br><span style="color:#666;font-size:12px">${sub}</span>` : ""}<br><span style="font-size:12px">${esc(kg)}</span></div>`,
    };
  }), [geo]);

  const kpis = useMemo(() => ({
    mapeados: geo.length,
    total: producers.length,
    kg: geo.reduce((a, p) => a + p.stats.kg, 0),
    sectores: new Set(geo.map((p) => p.sector).filter(Boolean)).size,
  }), [geo, producers.length]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Parcelas mapeadas" value={String(kpis.mapeados)} subValue={`de ${kpis.total} productores`} icon={MapPin} emphasis={kpis.mapeados > 0 ? "success" : "neutral"} />
        <StatCard label="Kg geolocalizado" value={`${n2(kpis.kg)} kg`} icon={Scale} emphasis="neutral" />
        <StatCard label="Zonas / sectores" value={String(kpis.sectores)} icon={Layers} emphasis="neutral" />
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      {sinUbicar > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--text-secondary)]">
          <Navigation className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" />
          <span><strong className="text-[var(--text-primary)]">{sinUbicar}</strong> productor{sinUbicar === 1 ? "" : "es"} sin ubicación. Agregá la parcela con GPS desde su ficha (pestaña Productores) para verlos en el mapa.</span>
        </div>
      )}

      {loading && producers.length === 0 ? (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
      ) : geo.length === 0 ? (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><MapPin className="h-7 w-7" /></span>
          <p className="text-base font-bold text-[var(--text-primary)]">Ningún productor tiene ubicación aún</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">Editá un productor y marcá su parcela con GPS o en el mapa para empezar a construir tu mapa de acopio.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)]">
          <LeafletMap lat={BRAND_GEO.lat} lon={BRAND_GEO.lng} markers={markers} height={460} />
        </div>
      )}
    </div>
  );
}
