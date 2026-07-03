"use client";

/**
 * CacaoMapa — mapa geográfico de la operación: dónde COMPRÁS (productores, con
 * marcadores proporcionales al volumen) + dónde CULTIVÁS (tus secciones de campo,
 * como polígonos). Una sola vista satelital con filtro por sector y ranking de
 * volumen por zona. Leaflet propio (no el compartido) para polígonos + símbolos
 * proporcionales + satélite. Brandon 2026-07-03.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Scale, Layers, RefreshCw, AlertCircle, Navigation, Trees, Users } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { BRAND_GEO } from "@/lib/geo";
import { PARCELA_STATUS, type CacaoParcelaStatus } from "@/lib/cacao/cacao-labores";
import "leaflet/dist/leaflet.css";

interface PStats { kg: number; pagado: number; lotes: number }
interface Producer { id: string; codigo: string | null; nombre: string; sector: string | null; latitud: string | null; longitud: string | null; status: string; stats: PStats }
interface Parcela { id: string; codigo: string; areaHa: number | null; poligono: string | null; laborStatus: CacaoParcelaStatus }

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const n2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 0 });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }) as Record<string, string>)[c] ?? c);
const coord = (v: string | null): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
function parseCoords(json: string | null): [number, number][] | null {
  if (!json) return null;
  try { const a = JSON.parse(json); if (Array.isArray(a) && a.length >= 3 && a.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number"))) return a as [number, number][]; } catch { /* noop */ }
  return null;
}

export default function CacaoMapa() {
  const [producers, setProducers] = useState<Producer[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layer, setLayer] = useState<"sat" | "street">("street");
  const [sector, setSector] = useState("todos");
  const [showProd, setShowProd] = useState(true);
  const [showCampo, setShowCampo] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet instances (dynamic import)
  const LRef = useRef<any>(null); const mapRef = useRef<any>(null); const satRef = useRef<any>(null); const streetRef = useRef<any>(null); const prodRef = useRef<any>(null); const campoRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rp, rc] = await Promise.all([
        fetch("/api/admin/cacao?view=producers-stats&all=1", { credentials: "include" }),
        fetch("/api/admin/cacao/campo?view=parcelas", { credentials: "include" }),
      ]);
      if (!rp.ok) throw new Error(`HTTP ${rp.status}`);
      setProducers((await rp.json()).producers ?? []);
      if (rc.ok) setParcelas((await rc.json()).parcelas ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const geo = useMemo(() => producers.filter((p) => coord(p.latitud) != null && coord(p.longitud) != null), [producers]);
  const sectores = useMemo(() => [...new Set(geo.map((p) => p.sector).filter((s): s is string => !!s))].sort(), [geo]);
  const filtered = useMemo(() => sector === "todos" ? geo : geo.filter((p) => p.sector === sector), [geo, sector]);
  const conPoligono = useMemo(() => parcelas.filter((p) => parseCoords(p.poligono)), [parcelas]);
  const sinUbicar = producers.length - geo.length;

  const kpis = useMemo(() => ({ mapeados: geo.length, total: producers.length, kg: filtered.reduce((a, p) => a + p.stats.kg, 0), sectores: sectores.length, secciones: conPoligono.length }), [geo, producers.length, filtered, sectores.length, conPoligono.length]);
  const porSector = useMemo(() => {
    const m = new Map<string, { kg: number; pagado: number }>();
    for (const p of geo) { const k = p.sector || "Sin sector"; const cur = m.get(k) ?? { kg: 0, pagado: 0 }; cur.kg += p.stats.kg; cur.pagado += p.stats.pagado; m.set(k, cur); }
    return [...m.entries()].map(([s, v]) => ({ sector: s, ...v })).sort((a, b) => b.kg - a.kg);
  }, [geo]);

  // refs espejo para el render de capas
  const filteredRef = useRef(filtered); filteredRef.current = filtered;
  const parcelasRef = useRef(conPoligono); parcelasRef.current = conPoligono;
  const showProdRef = useRef(showProd); showProdRef.current = showProd;
  const showCampoRef = useRef(showCampo); showCampoRef.current = showCampo;

  const renderLayers = useCallback((fit = true) => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!prodRef.current) prodRef.current = L.layerGroup().addTo(map);
    if (!campoRef.current) campoRef.current = L.layerGroup().addTo(map);
    prodRef.current.clearLayers(); campoRef.current.clearLayers();
    const bounds: [number, number][] = [];
    if (showCampoRef.current) for (const s of parcelasRef.current) {
      const pts = parseCoords(s.poligono); if (!pts) continue;
      const m = PARCELA_STATUS[s.laborStatus];
      L.polygon(pts, { color: m.ring, fillColor: m.ring, fillOpacity: 0.28, weight: 2, dashArray: "4,3" }).bindTooltip(`${s.codigo} · tu sección${s.areaHa != null ? ` · ${s.areaHa} ha` : ""}`, { sticky: true }).addTo(campoRef.current);
      pts.forEach((pt) => bounds.push(pt));
    }
    if (showProdRef.current) for (const p of filteredRef.current) {
      const lat = coord(p.latitud)!, lng = coord(p.longitud)!;
      const r = Math.max(6, Math.min(26, 6 + Math.sqrt(p.stats.kg) * 0.45));
      const kg = p.stats.lotes ? `${n2(p.stats.kg)} kg · S/ ${n2(p.stats.pagado)} · ${p.stats.lotes} lote${p.stats.lotes === 1 ? "" : "s"}` : "Sin compras aún";
      const sub = [p.codigo, p.sector].filter(Boolean).map((x) => esc(String(x))).join(" · ");
      L.circleMarker([lat, lng], { radius: r, color: "var(--accent)", fillColor: "var(--accent)", fillOpacity: 0.6, weight: 2 })
        .bindPopup(`<div style="min-width:150px"><strong>${esc(p.nombre)}</strong>${sub ? `<br><span style="color:#666;font-size:12px">${sub}</span>` : ""}<br><span style="font-size:12px">${esc(kg)}</span></div>`)
        .addTo(prodRef.current);
      bounds.push([lat, lng]);
    }
    if (fit && bounds.length) { try { map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 }); } catch { /* noop */ } }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { center: [BRAND_GEO.lat, BRAND_GEO.lng], zoom: 8, maxZoom: 21 });
      mapRef.current = map;
      streetRef.current = L.tileLayer(STREET, { maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      satRef.current = L.tileLayer(SAT, { maxZoom: 21, maxNativeZoom: 17, attribution: "Tiles © Esri" });
      L.control.scale({ metric: true, imperial: false }).addTo(map);
      setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 200);
      setReady(true); renderLayers();
    });
    return () => { destroyed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (ready) renderLayers(); }, [producers, parcelas, ready, renderLayers]);
  useEffect(() => { if (ready) renderLayers(false); }, [sector, showProd, showCampo, ready, renderLayers]);
  useEffect(() => {
    const map = mapRef.current; if (!map || !satRef.current || !streetRef.current) return;
    if (layer === "sat") { map.removeLayer(streetRef.current); satRef.current.addTo(map); }
    else { map.removeLayer(satRef.current); streetRef.current.addTo(map); }
  }, [layer]);

  const btn = "inline-flex h-11 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold hover:bg-[var(--surface-canvas)]";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Productores mapeados" value={String(kpis.mapeados)} subValue={`de ${kpis.total}`} icon={Users} emphasis={kpis.mapeados > 0 ? "success" : "neutral"} />
        <StatCard label={sector === "todos" ? "Kg geolocalizado" : `Kg en ${sector}`} value={`${n0(kpis.kg)} kg`} icon={Scale} emphasis="neutral" />
        <StatCard label="Zonas / sectores" value={String(kpis.sectores)} icon={Layers} emphasis="neutral" />
        <StatCard label="Mis secciones" value={String(kpis.secciones)} subValue="en el mapa" icon={Trees} emphasis="neutral" />
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {sinUbicar > 0 && <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 text-sm text-[var(--text-secondary)]"><Navigation className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" /><span><strong className="text-[var(--text-primary)]">{sinUbicar}</strong> productor{sinUbicar === 1 ? "" : "es"} sin ubicación. Agregá su parcela con GPS desde Productores.</span></div>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setShowProd((v) => !v)} className={`${btn} ${showProd ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]"}`}><Users className="h-4 w-4" />Productores</button>
        <button type="button" onClick={() => setShowCampo((v) => !v)} className={`${btn} ${showCampo ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]"}`}><Trees className="h-4 w-4" />Mi campo</button>
        {sectores.length > 0 && <select value={sector} onChange={(e) => setSector(e.target.value)} className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"><option value="todos">Todos los sectores</option>{sectores.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
        <button type="button" onClick={() => setLayer((l) => (l === "sat" ? "street" : "sat"))} className={`${btn} ml-auto border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]`}><Layers className="h-4 w-4" />{layer === "sat" ? "Satélite" : "Calles"}</button>
        <button type="button" onClick={load} className={`${btn} border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]`}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>

      {/* El contenedor del mapa se renderiza SIEMPRE (el init de Leaflet corre en
          un effect [] al montar; si el div fuera condicional no existiría todavía
          y el mapa nunca iniciaría). Loading/empty van como overlay encima. */}
      <div className="relative">
        <div ref={containerRef} style={{ height: 480 }} className="isolate w-full overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]" />
        {loading && producers.length === 0 && parcelas.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"><div className="text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div></div>
        )}
        {ready && !loading && geo.length === 0 && conPoligono.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 text-center shadow-[var(--shadow-lg)]">
              <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><MapPin className="h-7 w-7" /></span>
              <p className="text-base font-bold text-[var(--text-primary)]">Nada que mapear aún</p>
              <p className="mx-auto mt-1 text-sm text-[var(--text-secondary)]">Ubicá tus productores con GPS (pestaña Productores) o dibujá tus secciones (Campo → Mapa) para verlos acá juntos.</p>
            </div>
          </div>
        )}
      </div>

      {porSector.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Layers className="h-4 w-4 text-[var(--accent)]" />Volumen de acopio por zona</p>
          <div className="space-y-2">
            {(() => { const max = Math.max(...porSector.map((s) => s.kg), 1); return porSector.map((s) => (
              <div key={s.sector}>
                <div className="mb-1 flex justify-between text-sm"><span className="text-[var(--text-secondary)]">{s.sector}</span><span className="font-mono tabular-nums text-[var(--text-primary)]">{n0(s.kg)} kg · S/ {n0(s.pagado)}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round((s.kg / max) * 100)}%` }} /></div>
              </div>
            )); })()}
          </div>
        </div>
      )}
    </div>
  );
}
