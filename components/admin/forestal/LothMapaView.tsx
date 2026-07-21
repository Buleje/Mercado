"use client";

/**
 * LothMapaView — cabina geoespacial del Libro TH. El gemelo espacial del libro:
 * el libro dice CUÁNTA madera salió; el mapa dice DE DÓNDE, y si eso resiste el
 * Reglamento UE Antideforestación (EUDR · Reglamento UE 2023/1115).
 *
 * Tres capas sobre el satélite Esri:
 *  1. Los PUNTOS de cada operación geolocalizada (tala/trozado/despacho…), con
 *     halo rojo si caen FUERA del polígono declarado (bandera de fiscalización).
 *  2. El POLÍGONO de la parcela de aprovechamiento — se dibuja tocando el mapa
 *     (sin leaflet-draw: click = vértice) y se persiste en el KV `loth-parcela`.
 *  3. La cabina EUDR (`LothEudrRail`): readiness, checklist, cross-check contra
 *     el área autorizada del POA y los exports de la DDS (GeoJSON + PDF).
 *
 * Reusa el setup Leaflet del CtpPlantaMapa (satélite Esri maxNativeZoom 17). La
 * matemática (área, punto-en-polígono, readiness) vive en `loth-geo` (pura).
 */
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Layers, Loader2, Camera, Undo2, Check, X, Eye, EyeOff } from "@buleje/design-system/icons";
import { BRAND_GEO } from "@/lib/geo";
import { csrfHeaders } from "@/lib/csrf-client";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  computeEudrReadiness,
  polygonAreaHa,
  hasParcela,
  pointInPolygon,
  buildEudrGeoJson,
  normalizeParcela,
  emptyParcela,
  type LothParcela,
  type LatLng,
  type OpForEudr,
  type EudrPoint,
} from "@/lib/forestal/loth-geo";
import LothEudrRail from "./LothEudrRail";
import { printLothEudrDds } from "@/lib/forestal/loth-eudr-print";

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SAT_MAX_NATIVE = 17;
const PARCELA_COLOR = "#0d9488"; // teal (accent)

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

const validCoord = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

function toGeo(entries: LothEntryDTO[]): GeoEntry[] {
  const out: GeoEntry[] = [];
  for (const e of entries) {
    if (e.status === "anulado") continue;
    const lat = e.gpsLat != null ? Number(e.gpsLat) : NaN;
    const lng = e.gpsLng != null ? Number(e.gpsLng) : NaN;
    if (!validCoord(lat, lng)) continue;
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

function toOps(entries: LothEntryDTO[]): OpForEudr[] {
  return entries.map((e) => ({
    section: e.section,
    lat: e.gpsLat != null ? Number(e.gpsLat) : null,
    lng: e.gpsLng != null ? Number(e.gpsLng) : null,
    cites: e.cites,
    status: e.status,
  }));
}

function popupHtml(g: GeoEntry, dentro: boolean, declarada: boolean): string {
  const fecha = (() => {
    try {
      return new Date(g.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    } catch {
      return "";
    }
  })();
  const medida = g.volumeM3 != null ? `${g.volumeM3.toFixed(4)} m³` : g.quantity != null ? `${g.quantity.toFixed(2)} ${g.unit ?? ""}` : "";
  const foto = g.photoUrl ? `<img src="${esc(g.photoUrl)}" alt="" style="margin-top:6px;width:100%;max-height:120px;object-fit:cover;border-radius:6px" />` : "";
  const flag = declarada
    ? dentro
      ? '<div style="color:#15803d;font-weight:700">✓ dentro de la parcela</div>'
      : '<div style="color:#b91c1c;font-weight:700">✗ FUERA de la parcela</div>'
    : "";
  return `<div style="font:600 12px/1.5 system-ui;min-width:150px">
    <div style="font-weight:800;font-size:13px">${esc(g.code)}${g.cites ? ' <span style="color:#e11d48">CITES</span>' : ""}</div>
    <div style="color:${SECTION_COLOR[g.section] ?? "#334155"};font-weight:700">${esc(SECTION_LABEL[g.section] ?? g.section)}</div>
    ${g.species ? `<div>${esc(g.species)}</div>` : ""}
    ${medida ? `<div style="font-weight:700">${esc(medida)}</div>` : ""}
    ${fecha ? `<div style="opacity:.7">${esc(fecha)}</div>` : ""}
    ${flag}
    ${foto}
  </div>`;
}

interface ActivePlan {
  areaHa: number | null;
  parcelaCorta: string | null;
  titularName: string | null;
  planNumber: string | null;
}

export default function LothMapaView() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const satRef = useRef<unknown>(null);
  const streetRef = useRef<unknown>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parcelaRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draftRef = useRef<any>(null);
  const fittedRef = useRef(false);

  const [raw, setRaw] = useState<LothEntryDTO[] | null>(null);
  const [parcela, setParcela] = useState<LothParcela>(emptyParcela());
  const [plan, setPlan] = useState<ActivePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<"sat" | "street">("sat");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Dibujo de la parcela (sin leaflet-draw: click en el mapa = vértice).
  const [drawMode, setDrawMode] = useState(false);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eRes, pRes, plRes] = await Promise.all([
        fetch("/api/admin/forestal/loth?limit=500&includeAnnulled=1", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/parcela", { credentials: "include" }),
        fetch("/api/admin/forestal/plan?active=1", { credentials: "include" }),
      ]);
      if (!eRes.ok) throw new Error((await eRes.json().catch(() => ({}))).message ?? `HTTP ${eRes.status}`);
      setRaw((await eRes.json()).entries ?? []);
      if (pRes.ok) setParcela(normalizeParcela((await pRes.json()).parcela));
      if (plRes.ok) {
        const a = (await plRes.json()).active;
        setPlan(a ? { areaHa: a.areaHa != null ? Number(a.areaHa) : null, parcelaCorta: a.parcelaCorta ?? null, titularName: a.titularName ?? null, planNumber: a.planNumber ?? null } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const geoAll = useMemo(() => (raw ? toGeo(raw) : []), [raw]);
  const sectionsPresent = useMemo(() => Array.from(new Set(geoAll.map((g) => g.section))), [geoAll]);
  const geoShown = useMemo(() => geoAll.filter((g) => !hidden.has(g.section)), [geoAll, hidden]);
  const readiness = useMemo(() => computeEudrReadiness(raw ? toOps(raw) : [], parcela), [raw, parcela]);
  const declarada = hasParcela(parcela);
  const draftAreaHa = draft.length >= 3 ? polygonAreaHa(draft) : 0;

  // Persistir la parcela (PUT) — usado por dibujo, borrado y toggle deforestación.
  const persistParcela = useCallback(
    async (next: { vertices: LatLng[]; nota: string; deforestacionCero: boolean }) => {
      setSaving(true);
      setError(null);
      try {
        const r = await fetch("/api/admin/forestal/loth/parcela", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(next),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
        setParcela(normalizeParcela((await r.json()).parcela));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const startDraw = () => {
    setDraft(parcela.vertices.slice());
    setDrawMode(true);
  };
  const cancelDraw = () => {
    setDrawMode(false);
    setDraft([]);
  };
  const saveDraw = async () => {
    if (draft.length < 3) return;
    await persistParcela({ vertices: draft, nota: parcela.nota, deforestacionCero: parcela.deforestacionCero });
    setDrawMode(false);
    setDraft([]);
  };
  const clearParcela = async () => {
    if (!window.confirm("¿Borrar el polígono del área de aprovechamiento?")) return;
    await persistParcela({ vertices: [], nota: "", deforestacionCero: false });
  };
  const toggleDeforestacion = (v: boolean) => persistParcela({ vertices: parcela.vertices, nota: parcela.nota, deforestacionCero: v });

  const doExportGeoJson = () => {
    const points: EudrPoint[] = geoAll.map((g) => ({ lat: g.lat, lng: g.lng, section: g.section, code: g.code, species: g.species, cites: g.cites, volumeM3: g.volumeM3, date: g.date }));
    const fc = buildEudrGeoJson({ parcela, points, titular: plan?.titularName, titulo: plan?.planNumber });
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dds-eudr-libro-th.geojson";
    a.click();
    URL.revokeObjectURL(url);
  };
  const doPrintDds = () => {
    printLothEudrDds().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  };

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
      parcelaRef.current = L.layerGroup().addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      draftRef.current = L.layerGroup().addTo(map);
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

  // Click en el mapa mientras se dibuja = nuevo vértice.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!drawMode) return;
    map.doubleClickZoom.disable();
    // Cursor imperativo: NO vía className del contenedor — React reescribiría el
    // atributo `class` en cada render y borraría las clases que Leaflet le agrega
    // (`leaflet-container`…), rompiendo el mapa.
    const el = map.getContainer() as HTMLElement;
    el.style.cursor = "crosshair";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onClick = (e: any) => setDraft((d) => [...d, [e.latlng.lat, e.latlng.lng]]);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      if (mapRef.current) {
        mapRef.current.doubleClickZoom.enable();
        (mapRef.current.getContainer() as HTMLElement).style.cursor = "";
      }
    };
  }, [ready, drawMode]);

  // Dibujar la parcela guardada (oculta mientras se edita: el draft la reemplaza).
  useEffect(() => {
    const L = LRef.current;
    const group = parcelaRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (!drawMode && declarada) {
      L.polygon(parcela.vertices, { color: PARCELA_COLOR, weight: 2, fillColor: PARCELA_COLOR, fillOpacity: 0.12 }).addTo(group);
    }
  }, [ready, parcela, declarada, drawMode]);

  // Dibujar el borrador en vivo mientras se marca.
  useEffect(() => {
    const L = LRef.current;
    const group = draftRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (!drawMode || draft.length === 0) return;
    if (draft.length >= 3) {
      L.polygon(draft, { color: PARCELA_COLOR, weight: 2, dashArray: "6 4", fillColor: PARCELA_COLOR, fillOpacity: 0.1 }).addTo(group);
    } else if (draft.length === 2) {
      L.polyline(draft, { color: PARCELA_COLOR, weight: 2, dashArray: "6 4" }).addTo(group);
    }
    draft.forEach((v, i) =>
      L.circleMarker(v, { radius: 5, color: "#fff", weight: 2, fillColor: PARCELA_COLOR, fillOpacity: 1 })
        .bindTooltip(String(i + 1), { permanent: true, direction: "top", className: "loth-vertex-label", offset: [0, -6] })
        .addTo(group),
    );
  }, [ready, draft, drawMode]);

  // Dibujar los puntos (con halo rojo si caen fuera de la parcela declarada).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = markersRef.current;
    if (!ready || !L || !map || !group) return;
    group.clearLayers();
    for (const g of geoShown) {
      const color = SECTION_COLOR[g.section] ?? "#334155";
      const dentro = declarada ? pointInPolygon([g.lat, g.lng], parcela.vertices) : true;
      if (declarada && !dentro) {
        L.circleMarker([g.lat, g.lng], { radius: 12, color: "#e11d48", weight: 2, opacity: 0.9, fill: false }).addTo(group);
      }
      L.circleMarker([g.lat, g.lng], { radius: 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.9 })
        .bindPopup(popupHtml(g, dentro, declarada))
        .addTo(group);
    }
  }, [ready, geoShown, parcela, declarada]);

  // Encuadre inicial: una vez, sobre puntos + parcela.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || fittedRef.current || !raw) return;
    const pts: [number, number][] = [...geoAll.map((g): [number, number] => [g.lat, g.lng]), ...parcela.vertices];
    if (pts.length) {
      try {
        map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
        fittedRef.current = true;
      } catch {
        /* bounds inválidos: centro por defecto */
      }
    }
  }, [ready, raw, geoAll, parcela]);

  // Toggle de capa satélite/calles.
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

  const total = geoAll.length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Columna mapa */}
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--text-tertiary)]">
            {loading && raw === null ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando ubicaciones…</span>
            ) : (
              <>
                <b className="font-mono tabular-nums text-[var(--text-secondary)]">{total}</b> {total === 1 ? "operación geolocalizada" : "operaciones geolocalizadas"}
                {declarada && <> · parcela <b className="text-[var(--text-secondary)]">{readiness.areaHa.toFixed(1)} ha</b></>}
                {declarada && readiness.fuera > 0 && <span className="text-[var(--data-error-700)]"> · {readiness.fuera} fuera</span>}
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

        {/* Filtro por sección */}
        {sectionsPresent.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {sectionsPresent.map((s) => {
              const on = !hidden.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setHidden((h) => {
                      const n = new Set(h);
                      if (n.has(s)) n.delete(s);
                      else n.add(s);
                      return n;
                    })
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${
                    on ? "border-transparent text-white" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"
                  }`}
                  style={on ? { backgroundColor: SECTION_COLOR[s] ?? "#334155" } : undefined}
                >
                  {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {SECTION_LABEL[s] ?? s}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)]">
          {/* className ESTÁTICO a propósito: Leaflet agrega sus clases al
              contenedor imperativamente; un className dinámico haría que React
              reescriba el atributo y las borre. El cursor va por style (efecto). */}
          <div ref={containerRef} className="h-[520px] w-full bg-[var(--surface-sunken)]" />

          {/* Barra de dibujo */}
          {drawMode && (
            <div className="absolute inset-x-3 top-3 z-[600] flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[var(--brand-ink)] bg-[var(--surface-raised)]/95 px-3 py-2 shadow-lg backdrop-blur">
              <MapPin className="h-4 w-4 text-[var(--brand-ink)]" />
              <span className="text-xs font-bold text-[var(--text-primary)]">
                Tocá el mapa para marcar vértices · <b className="font-mono tabular-nums">{draft.length}</b>
                {draft.length >= 3 && <span className="text-[var(--text-tertiary)]"> · {draftAreaHa.toFixed(1)} ha</span>}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={draft.length === 0} className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40">
                  <Undo2 className="h-3.5 w-3.5" /> Deshacer
                </button>
                <button type="button" onClick={saveDraw} disabled={draft.length < 3 || saving} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                </button>
                <button type="button" onClick={cancelDraw} className="inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Estado vacío: mapa cargado, sin puntos ni parcela ni dibujo en curso */}
          {ready && raw !== null && total === 0 && !declarada && !drawMode && (
            <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-6">
              <div className="pointer-events-auto max-w-md rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 p-5 text-center shadow-lg backdrop-blur">
                <MapPin className="mx-auto mb-2 h-8 w-8 text-[var(--text-tertiary)]" />
                <p className="text-sm font-bold text-[var(--text-primary)]">Todavía no hay geolocalización</p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Dibujá la <b>parcela de aprovechamiento</b> (botón en la cabina EUDR) y capturá el <b>GPS</b> al registrar cada tala. Ambos son la base del cumplimiento EUDR.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Leyenda */}
        {(total > 0 || declarada) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {sectionsPresent.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <span className="h-3 w-3 rounded-full border border-white" style={{ background: SECTION_COLOR[s] ?? "#334155" }} aria-hidden="true" />
                {SECTION_LABEL[s] ?? s}
              </span>
            ))}
            {declarada && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <span className="h-3 w-4 rounded-sm border-2" style={{ borderColor: PARCELA_COLOR, background: `${PARCELA_COLOR}22` }} aria-hidden="true" />
                Parcela
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <Camera className="h-3.5 w-3.5" /> Tocá un punto para ver la foto de campo
            </span>
          </div>
        )}
      </div>

      {/* Cabina EUDR */}
      <LothEudrRail
        readiness={readiness}
        parcela={parcela}
        planAreaHa={plan?.areaHa ?? null}
        planParcelaCorta={plan?.parcelaCorta ?? null}
        drawMode={drawMode}
        saving={saving}
        onStartDraw={startDraw}
        onClearParcela={clearParcela}
        onToggleDeforestacion={toggleDeforestacion}
        onExportGeoJson={doExportGeoJson}
        onPrintDds={doPrintDds}
      />
    </div>
  );
}
