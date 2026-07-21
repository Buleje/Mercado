"use client";

/**
 * LothMapaView — mapa del aprovechamiento en el bosque. El gemelo espacial del
 * Libro TH: el Libro dice CUÁNTA madera se sacó; el mapa dice DE DÓNDE.
 *
 * Cada línea del libro ya captura GPS + foto de campo (evidencia) pero hasta acá
 * eran INVISIBLES. Este mapa las surfacea: un punto por operación geolocalizada,
 * coloreado por sección (tala/trozado/despacho…), con popup de especie, volumen,
 * fecha y foto. Es trazabilidad visual del origen — y lo que exige EUDR
 * (geolocalización de la parcela de aprovechamiento).
 *
 * Reusa el setup Leaflet del CtpPlantaMapa (satélite Esri maxNativeZoom 17 en
 * Ciudad Constitución) pero dibuja PUNTOS (no polígonos).
 */
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Layers, Loader2, Camera, TreePine } from "@buleje/design-system/icons";
import { BRAND_GEO } from "@/lib/geo";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SAT_MAX_NATIVE = 17;

const SECTION_COLOR: Record<string, string> = {
  tala: "#16a34a",
  trozado: "#0d9488",
  despacho_troza: "#e11d48",
  consumo_troza: "#6b7280",
  producto_terminado: "#0ea5e9",
  despacho_producto: "#f43f5e",
};
const SECTION_LABEL: Record<string, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de troza",
  consumo_troza: "Consumo de troza",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

interface GeoEntry {
  lat: number;
  lng: number;
  section: string;
  code: string;
  species: string | null;
  cites: boolean;
  volumeM3: number | null;
  quantity: number | null;
  unit: string | null;
  photoUrl: string | null;
  date: string;
}

function toGeo(entries: LothEntryDTO[]): GeoEntry[] {
  const out: GeoEntry[] = [];
  for (const e of entries) {
    const lat = e.gpsLat != null ? Number(e.gpsLat) : NaN;
    const lng = e.gpsLng != null ? Number(e.gpsLng) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    out.push({
      lat,
      lng,
      section: e.section,
      code: e.trozaCode || e.treeCode || e.productType || "—",
      species: e.speciesCommon,
      cites: e.cites,
      volumeM3: e.volumeM3 != null ? Number(e.volumeM3) : null,
      quantity: e.quantity != null ? Number(e.quantity) : null,
      unit: e.unit,
      photoUrl: e.photoUrl,
      date: e.entryDate,
    });
  }
  return out;
}

function popupHtml(g: GeoEntry): string {
  const fecha = (() => {
    try {
      return new Date(g.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    } catch {
      return "";
    }
  })();
  const medida =
    g.volumeM3 != null ? `${g.volumeM3.toFixed(4)} m³` : g.quantity != null ? `${g.quantity.toFixed(2)} ${g.unit ?? ""}` : "";
  const foto = g.photoUrl ? `<img src="${esc(g.photoUrl)}" alt="" style="margin-top:6px;width:100%;max-height:120px;object-fit:cover;border-radius:6px" />` : "";
  return `<div style="font:600 12px/1.5 system-ui;min-width:150px">
    <div style="font-weight:800;font-size:13px">${esc(g.code)}${g.cites ? ' <span style="color:#e11d48">CITES</span>' : ""}</div>
    <div style="color:${SECTION_COLOR[g.section] ?? "#334155"};font-weight:700">${esc(SECTION_LABEL[g.section] ?? g.section)}</div>
    ${g.species ? `<div>${esc(g.species)}</div>` : ""}
    ${medida ? `<div style="font-weight:700">${esc(medida)}</div>` : ""}
    ${fecha ? `<div style="opacity:.7">${esc(fecha)}</div>` : ""}
    ${foto}
  </div>`;
}

export default function LothMapaView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const satRef = useRef<unknown>(null);
  const streetRef = useRef<unknown>(null);
  const markersRef = useRef<unknown>(null);

  const [entries, setEntries] = useState<GeoEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<"sat" | "street">("sat");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/loth?limit=500&includeAnnulled=1", { credentials: "include" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${r.status}`);
      }
      setEntries(toGeo((await r.json()).entries ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // Init del mapa (una sola vez).
  useEffect(() => {
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("leaflet").then((L: any) => {
      if (destroyed || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { center: [BRAND_GEO.lat, BRAND_GEO.lng], zoom: 12, maxZoom: 22 });
      mapRef.current = map;
      satRef.current = L.tileLayer(SAT, { maxZoom: 22, maxNativeZoom: SAT_MAX_NATIVE, attribution: "Tiles © Esri, Maxar" }).addTo(map);
      streetRef.current = L.tileLayer(STREET, { maxZoom: 22, maxNativeZoom: 19, attribution: "© OpenStreetMap" });
      markersRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      destroyed = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mapRef.current) { (mapRef.current as any).remove(); mapRef.current = null; }
    };
  }, []);

  // Dibujar los puntos cuando el mapa está listo y hay datos.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = LRef.current as any, map = mapRef.current as any, group = markersRef.current as any;
    if (!ready || !L || !map || !group || !entries) return;
    group.clearLayers();
    const bounds: [number, number][] = [];
    for (const g of entries) {
      const color = SECTION_COLOR[g.section] ?? "#334155";
      L.circleMarker([g.lat, g.lng], { radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.9 })
        .bindPopup(popupHtml(g))
        .addTo(group);
      bounds.push([g.lat, g.lng]);
    }
    if (bounds.length) {
      try {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 16 });
      } catch {
        /* bounds inválidos: se queda en el centro por defecto */
      }
    }
  }, [ready, entries]);

  // Toggle de capa satélite/calles.
  useEffect(() => {
    const map = mapRef.current, sat = satRef.current, street = streetRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!map || !sat || !street) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = map as any;
    if (layer === "sat") { m.removeLayer(street); m.addLayer(sat); }
    else { m.removeLayer(sat); m.addLayer(street); }
  }, [layer]);

  const total = entries?.length ?? 0;
  const porSeccion = (entries ?? []).reduce<Record<string, number>>((acc, g) => {
    acc[g.section] = (acc[g.section] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-tertiary)]">
          {loading && entries === null ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando ubicaciones…</span>
          ) : (
            <>
              <b className="font-mono tabular-nums text-[var(--text-secondary)]">{total}</b> {total === 1 ? "operación geolocalizada" : "operaciones geolocalizadas"}
              {total > 0 && " · " + Object.entries(porSeccion).map(([s, n]) => `${n} ${SECTION_LABEL[s]?.toLowerCase() ?? s}`).join(" · ")}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setLayer((l) => (l === "sat" ? "street" : "sat"))}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
        >
          <Layers className="h-3.5 w-3.5" /> {layer === "sat" ? "Ver calles" : "Ver satélite"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)]">
        <div ref={containerRef} className="h-[520px] w-full bg-[var(--surface-sunken)]" />
        {/* Estado vacío: mapa cargado pero sin puntos GPS */}
        {ready && entries !== null && total === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-md rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 p-5 text-center shadow-lg backdrop-blur">
              <MapPin className="mx-auto mb-2 h-8 w-8 text-[var(--text-tertiary)]" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Ninguna operación tiene ubicación GPS todavía</p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Al registrar una línea, tocá <b>Capturar ubicación GPS</b> en «Evidencia de campo» (o subí una foto). Las operaciones geolocalizadas aparecen acá como puntos.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Leyenda por sección */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {Object.keys(porSeccion).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span className="h-3 w-3 rounded-full border border-white" style={{ background: SECTION_COLOR[s] ?? "#334155" }} aria-hidden="true" />
              {SECTION_LABEL[s] ?? s}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <Camera className="h-3.5 w-3.5" /> Tocá un punto para ver la foto de campo
          </span>
        </div>
      )}
    </div>
  );
}
