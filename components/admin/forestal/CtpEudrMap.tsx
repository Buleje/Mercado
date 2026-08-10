"use client";

/**
 * CtpEudrMap — mapa de los orígenes de la planta (EUDR). El aserradero recibe
 * madera de MUCHAS parcelas; la UE exige la geolocalización de todas. Este mapa
 * las surfacea: un punto (o polígono, si el origen declaró uno) por concesión/
 * predio, coloreado por su estado — verde = geolocalizado + sin deforestación,
 * ámbar = geolocalizado sin atestar. La planta va anclada al centro.
 *
 * Gemelo del `LothMapaView` (bosque). Reusa el satélite Esri. OJO gotcha: el
 * className del contenedor Leaflet va ESTÁTICO — un className dinámico haría que
 * React reescriba el atributo y borre las clases que Leaflet agrega.
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Warehouse, Camera } from "@buleje/design-system/icons";
import { BRAND_GEO } from "@/lib/geo";
import { origenGeolocalizado, type OrigenGeo, type OrigenRow } from "@/lib/forestal/eudr-types";

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SAT_MAX_NATIVE = 17;
const C_DF = "#16a34a"; // geolocalizado + sin deforestación
const C_GEO = "#d97706"; // geolocalizado, sin atestar
const C_PLANT = "#0d9488"; // planta (teal accent)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function popupHtml(o: OrigenRow, g: OrigenGeo): string {
  const df = g.deforestationFree === true;
  return `<div style="font:600 12px/1.5 system-ui;min-width:150px">
    <div style="font-weight:800;font-size:13px">${esc(o.originCode)}</div>
    <div style="color:#475569">${esc(o.originType ?? "—")}${o.region ? " · " + esc(o.region) : ""}</div>
    <div>${o.ingresos} ingreso${o.ingresos === 1 ? "" : "s"}</div>
    <div style="color:${df ? "#15803d" : "#b45309"};font-weight:700">${df ? "✓ sin deforestación" : "⚠ falta atestar"}</div>
  </div>`;
}

export default function CtpEudrMap({ origins, geoByCode }: { origins: OrigenRow[]; geoByCode: Record<string, OrigenGeo> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const satRef = useRef<unknown>(null);
  const streetRef = useRef<unknown>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<"sat" | "street">("sat");

  const geoOrigins = useMemo(
    () => origins.map((o) => ({ o, g: geoByCode[o.originCode] })).filter((x) => origenGeolocalizado(x.g)),
    [origins, geoByCode],
  );
  const total = geoOrigins.length;

  // Init una sola vez.
  useEffect(() => {
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("leaflet").then((L: any) => {
      if (destroyed || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { center: [BRAND_GEO.lat, BRAND_GEO.lng], zoom: 11, maxZoom: 22 });
      mapRef.current = map;
      satRef.current = L.tileLayer(SAT, { maxZoom: 22, maxNativeZoom: SAT_MAX_NATIVE, attribution: "Tiles © Esri, Maxar" }).addTo(map);
      streetRef.current = L.tileLayer(STREET, { maxZoom: 22, maxNativeZoom: 19, attribution: "© OpenStreetMap" });
      groupRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Dibujar planta + orígenes cuando hay mapa y datos.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!ready || !L || !map || !group) return;
    group.clearLayers();
    const bounds: [number, number][] = [[BRAND_GEO.lat, BRAND_GEO.lng]];

    // Planta (ancla)
    L.circleMarker([BRAND_GEO.lat, BRAND_GEO.lng], { radius: 9, color: "#fff", weight: 3, fillColor: C_PLANT, fillOpacity: 1 })
      .bindTooltip("Planta (CTP)", { permanent: true, direction: "top", offset: [0, -8], className: "ctp-plant-label" })
      .addTo(group);

    for (const { o, g } of geoOrigins) {
      const df = g.deforestationFree === true;
      const color = df ? C_DF : C_GEO;
      let drawn = false;
      if (g.polygonJson) {
        try {
          const geom = JSON.parse(g.polygonJson);
          const gj = L.geoJSON(geom, { style: { color, weight: 2, fillColor: color, fillOpacity: 0.15 } }).bindPopup(popupHtml(o, g));
          gj.addTo(group);
          gj.getBounds && gj.getBounds().isValid() && gj.getBounds().getCenter && bounds.push([gj.getBounds().getCenter().lat, gj.getBounds().getCenter().lng]);
          drawn = true;
        } catch {
          /* polígono corrupto → cae al punto */
        }
      }
      if (!drawn && g.lat != null && g.lng != null) {
        L.circleMarker([g.lat, g.lng], { radius: 8, color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.9 }).bindPopup(popupHtml(o, g)).addTo(group);
        bounds.push([g.lat, g.lng]);
      }
    }

    if (bounds.length > 1) {
      try {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
      } catch {
        /* bounds inválidos → centro por defecto */
      }
    }
  }, [ready, geoOrigins]);

  // Toggle satélite/calles.
  useEffect(() => {
    const map = mapRef.current;
    const sat = satRef.current;
    const street = streetRef.current;
    if (!map || !sat || !street) return;
    if (layer === "sat") {
      map.removeLayer(street);
      map.addLayer(sat);
    } else {
      map.removeLayer(sat);
      map.addLayer(street);
    }
  }, [layer]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-tertiary)]">
          <b className="font-mono tabular-nums text-[var(--text-secondary)]">{total}</b> {total === 1 ? "origen geolocalizado" : "orígenes geolocalizados"} sobre el mapa
        </p>
        <button
          type="button"
          onClick={() => setLayer((l) => (l === "sat" ? "street" : "sat"))}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
        >
          <Layers className="h-3.5 w-3.5" /> {layer === "sat" ? "Ver calles" : "Ver satélite"}
        </button>
      </div>

      <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)]">
        {/* className ESTÁTICO (gotcha Leaflet): un className dinámico borraría las
            clases que Leaflet agrega al contenedor. */}
        <div ref={containerRef} className="h-[420px] w-full bg-[var(--surface-sunken)]" />
        {ready && total === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 p-5 text-center shadow-lg backdrop-blur">
              <Warehouse className="mx-auto mb-2 h-8 w-8 text-[var(--text-tertiary)]" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Ningún origen tiene coordenadas todavía</p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">Cargá la geolocalización de cada concesión/predio abajo (tipeando lat/lng o con «Mapa»). Aparecen acá como puntos.</p>
            </div>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="h-3 w-3 rounded-full border border-white" style={{ background: C_PLANT }} aria-hidden="true" /> Planta
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="h-3 w-3 rounded-full border border-white" style={{ background: C_DF }} aria-hidden="true" /> Sin deforestación
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="h-3 w-3 rounded-full border border-white" style={{ background: C_GEO }} aria-hidden="true" /> Falta atestar
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <Camera className="h-3.5 w-3.5" /> Tocá un punto para ver el detalle
          </span>
        </div>
      )}
    </div>
  );
}
