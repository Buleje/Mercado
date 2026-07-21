"use client";

/**
 * CtpOriginPolygonModal — dibuja el POLÍGONO de la parcela de un origen del CTP
 * (concesión/predio). EUDR exige polígono para parcelas > 4 ha (el punto solo
 * vale para ≤ 4 ha). Click en el mapa = vértice; al guardar produce un GeoJSON
 * `Polygon` que se persiste en `OrigenGeo.polygonJson` (el backend ya lo acepta).
 *
 * Reusa el patrón de dibujo de `LothMapaView` + la matemática de `loth-geo`.
 * Gotcha aplicado: el className del contenedor Leaflet va ESTÁTICO.
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { MapPin, Undo2, Check, X, Trash2, Loader2, Layers } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { BRAND_GEO } from "@/lib/geo";
import { polygonAreaHa, ringToGeoJsonPolygon, geoJsonPolygonToRing, type LatLng } from "@/lib/forestal/loth-geo";

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SAT_MAX_NATIVE = 17;
const COLOR = "#0d9488";

interface Props {
  originCode: string;
  initialPolygonJson?: string | null;
  center?: { lat: number; lng: number } | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (polygonJson: string, areaHa: number) => void;
}

export default function CtpOriginPolygonModal({ originCode, initialPolygonJson, center, saving, onClose, onSave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const satRef = useRef<unknown>(null);
  const streetRef = useRef<unknown>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupRef = useRef<any>(null);

  const [draft, setDraft] = useState<LatLng[]>(() => geoJsonPolygonToRing(initialPolygonJson));
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<"sat" | "street">("sat");
  const areaHa = draft.length >= 3 ? polygonAreaHa(draft) : 0;

  // Escape cierra.
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Init una sola vez.
  useEffect(() => {
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("leaflet").then((L: any) => {
      if (destroyed || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const c = center ?? { lat: BRAND_GEO.lat, lng: BRAND_GEO.lng };
      const start = geoJsonPolygonToRing(initialPolygonJson);
      const map = L.map(containerRef.current, { center: [c.lat, c.lng], zoom: start.length ? 14 : 13, maxZoom: 22 });
      mapRef.current = map;
      satRef.current = L.tileLayer(SAT, { maxZoom: 22, maxNativeZoom: SAT_MAX_NATIVE, attribution: "Tiles © Esri, Maxar" }).addTo(map);
      streetRef.current = L.tileLayer(STREET, { maxZoom: 22, maxNativeZoom: 19, attribution: "© OpenStreetMap" });
      groupRef.current = L.layerGroup().addTo(map);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => setDraft((d) => [...d, [e.latlng.lat, e.latlng.lng]]));
      map.getContainer().style.cursor = "crosshair";
      setReady(true);
      // El modal recién se muestra → Leaflet necesita recalcular su tamaño.
      setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 120);
      if (start.length >= 3) {
        try {
          map.fitBounds(L.latLngBounds(start), { padding: [40, 40], maxZoom: 16 });
        } catch {
          /* bounds inválidos → centro por defecto */
        }
      }
    });
    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Redibujar el borrador.
  useEffect(() => {
    const L = LRef.current;
    const group = groupRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (draft.length >= 3) {
      L.polygon(draft, { color: COLOR, weight: 2, dashArray: "6 4", fillColor: COLOR, fillOpacity: 0.12 }).addTo(group);
    } else if (draft.length === 2) {
      L.polyline(draft, { color: COLOR, weight: 2, dashArray: "6 4" }).addTo(group);
    }
    draft.forEach((v, i) =>
      L.circleMarker(v, { radius: 5, color: "#fff", weight: 2, fillColor: COLOR, fillOpacity: 1 })
        .bindTooltip(String(i + 1), { permanent: true, direction: "top", className: "loth-vertex-label", offset: [0, -6] })
        .addTo(group),
    );
  }, [ready, draft]);

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

  function save() {
    if (draft.length < 3) return;
    onSave(ringToGeoJsonPolygon(draft), areaHa);
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-[min(94vw,900px)] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b-2 border-[var(--rule-base)] px-5 py-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[var(--brand-ink)]" />
            <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">Dibujar parcela · {originCode}</CardTitle>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-2.5">
          <span className="text-xs font-bold text-[var(--text-secondary)]">
            Tocá el mapa para marcar vértices · <b className="font-mono tabular-nums">{draft.length}</b>
            {draft.length >= 3 && <span className="text-[var(--text-tertiary)]"> · {areaHa.toFixed(2)} ha</span>}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={draft.length === 0} className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40">
              <Undo2 className="h-3.5 w-3.5" /> Deshacer
            </button>
            <button type="button" onClick={() => setDraft([])} disabled={draft.length === 0} className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" /> Limpiar
            </button>
            <button type="button" onClick={() => setLayer((l) => (l === "sat" ? "street" : "sat"))} className="inline-flex h-9 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
              <Layers className="h-3.5 w-3.5" /> {layer === "sat" ? "Calles" : "Satélite"}
            </button>
          </div>
        </div>

        {/* className ESTÁTICO (gotcha Leaflet). Cursor por style en el init. */}
        <div ref={containerRef} className="h-[440px] w-full bg-[var(--surface-sunken)]" />

        <div className="flex items-center justify-end gap-2 border-t-2 border-[var(--rule-base)] px-5 py-3">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <X className="h-4 w-4" /> Cancelar
          </button>
          <button type="button" onClick={save} disabled={draft.length < 3 || saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar polígono
          </button>
        </div>
      </div>
    </div>
  );
}
