"use client";

/**
 * CacaoCampoMapa — mapa satelital para DIBUJAR el terreno y dividirlo en
 * secciones (polígonos) con código. Cada sección dibujada se colorea por el
 * estado de sus labores y abre su ficha al tocarla. Dibujo manual (click a
 * click, sin leaflet-draw). Fase 2 del tab Campo. Brandon 2026-07-02.
 */
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Undo2, Check, X, Layers, MapPin, Loader2, Maximize, Minimize, Edit3, Trash2, Locate, Tag, Route, Navigation, Download } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal from "@/components/admin/shared/AdminModal";
import { BRAND_GEO } from "@/lib/geo";
import { PARCELA_STATUS, CACAO_LABORES } from "@/lib/cacao/cacao-labores";
import { PLAGA_LABEL, SANIDAD_SEVERIDAD, type CacaoPlaga } from "@/lib/cacao/cacao-sanidad";

type ColorBy = "estado" | "sanidad";
import { geodesicAreaHa, haversineM, formatDist } from "@/lib/cacao/geo-area";

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Color + etiqueta de estado de una sección según el criterio (labores o sanidad). */
function polyMeta(p: Parcela, colorBy: ColorBy): { ring: string; label: string } {
  if (colorBy === "sanidad") {
    if (p.sanidad && p.sanidad.focos > 0) { const s = SANIDAD_SEVERIDAD[p.sanidad.severidadMax ?? "media"]; return { ring: s.ring, label: `Plaga ${s.label.toLowerCase()}` }; }
    return { ring: "var(--data-success-500)", label: "Sano" };
  }
  const m = PARCELA_STATUS[p.laborStatus];
  return { ring: m.ring, label: m.label };
}

/**
 * HTML de la etiqueta sobre cada sección: código + área + ESTADO en texto (según
 * el criterio de color) + detalle (labores vencidas/pendientes y plaga). Scrim
 * oscuro para contraste sobre satélite; borde izquierdo con el color del estado.
 */
function labelHtml(p: Parcela, colorBy: ColorBy): string {
  const meta = polyMeta(p, colorBy);
  const overdue: string[] = [], pending: string[] = [];
  for (const l of CACAO_LABORES) {
    const t = p.porTipo?.[l.tipo];
    if (!t) continue;
    if (t.vencido) overdue.push(l.label);
    else if (t.pendientes > 0) pending.push(l.label);
  }
  const cap = (arr: string[]) => (arr.length > 3 ? `${arr.slice(0, 2).join(", ")} +${arr.length - 2}` : arr.join(", "));
  const lines: string[] = [];
  if (overdue.length) lines.push(`<div style="color:var(--data-error-300,#fca5a5)">Vencidas: ${escapeHtml(cap(overdue))}</div>`);
  if (pending.length) lines.push(`<div style="color:var(--data-warning-300,#fcd34d)">Pendientes: ${escapeHtml(cap(pending))}</div>`);
  if (!overdue.length && !pending.length) lines.push(`<div style="color:var(--data-success-300,#86efac);opacity:.9">Sin labores pendientes</div>`);
  if (p.sanidad && p.sanidad.focos > 0) {
    const plagas = p.sanidad.plagas.map((pl) => PLAGA_LABEL[pl as CacaoPlaga] ?? pl);
    lines.push(`<div style="color:var(--data-error-300,#fca5a5);font-weight:700">Plaga: ${escapeHtml(cap(plagas))}</div>`);
  }
  const header = `<div style="font-weight:800;font-size:12px">${escapeHtml(p.codigo)}${p.areaHa != null ? ` · ${p.areaHa} ha` : ""}</div><div style="font-weight:700;color:${meta.ring}">${escapeHtml(meta.label)}</div>`;
  return `<div style="transform:translate(-50%,-50%);display:inline-block;white-space:nowrap;border-left:3px solid ${meta.ring};background:rgba(15,23,42,.82);color:#fff;padding:3px 8px;border-radius:8px;font:600 11px/1.4 system-ui;box-shadow:0 1px 3px rgba(0,0,0,.5)">${header}${lines.join("")}</div>`;
}
import type { Parcela } from "./CacaoCampo";

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const VARIEDADES = ["CCN-51", "criollo", "trinitario", "forastero", "nacional"];

/** Parsea texto de coordenadas (una "lat, lng" por línea) a puntos válidos.
 *  Acepta separador coma o espacio; ignora líneas inválidas. */
function parseCoordText(text: string): [number, number][] {
  const pts: [number, number][] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/(-?\d+(?:\.\d+)?)[,;\s]+(-?\d+(?:\.\d+)?)/);
    if (!m) continue;
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) pts.push([lat, lng]);
  }
  return pts;
}

function parseCoords(json: string | null): [number, number][] | null {
  if (!json) return null;
  try {
    const a = JSON.parse(json);
    if (Array.isArray(a) && a.length >= 3 && a.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number"))) return a as [number, number][];
  } catch { /* json inválido */ }
  return null;
}
const centroid = (pts: [number, number][]): [number, number] => {
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]] as [number, number], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
};
/** Área (ha, ≥3 pts) + perímetro (m, línea recorrida) de un polígono en construcción. */
function drawMetrics(v: [number, number][]): { area: number; perim: number } {
  let perim = 0;
  for (let i = 1; i < v.length; i++) perim += haversineM(v[i - 1], v[i]);
  return { area: v.length >= 3 ? geodesicAreaHa(v) : 0, perim };
}

export default function CacaoCampoMapa({ parcelas, onOpenParcela, onChanged }: { parcelas: Parcela[]; onOpenParcela: (id: string) => void; onChanged: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Leaflet instances (dynamic import)
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polysRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drawRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streetRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- capa de edición (polígono + handles de vértice)
  const editLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editPolyRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- capa de medición + marcador de mi ubicación
  const measureLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locateMarkerRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [nVerts, setNVerts] = useState(0);
  const [drawArea, setDrawArea] = useState(0);
  const [drawPerim, setDrawPerim] = useState(0);
  const [layer, setLayer] = useState<"sat" | "street">("sat");
  const [fullscreen, setFullscreen] = useState(false);
  const [pending, setPending] = useState<[number, number][] | null>(null);
  const [coordModal, setCoordModal] = useState(false);
  // Edición de secciones existentes: mover vértices → recalcula área en vivo.
  const [editing, setEditing] = useState(false);
  const [editSel, setEditSel] = useState<{ id: string; codigo: string } | null>(null);
  const [editArea, setEditArea] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  // Funciones de alto nivel: etiquetas, coloreo temático, medición, GPS, ir a sección.
  const [showLabels, setShowLabels] = useState(true);
  const [colorBy, setColorBy] = useState<ColorBy>("estado");
  const [cursor, setCursor] = useState<{ lat: number; lng: number } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measureDist, setMeasureDist] = useState(0);
  const [measureArea, setMeasureArea] = useState(0);
  const [measurePts, setMeasurePts] = useState(0);
  const [locating, setLocating] = useState(false);
  const [mapMsg, setMapMsg] = useState<string | null>(null);
  const editVertsRef = useRef<[number, number][]>([]);
  const editingRef = useRef(false);
  const measuringRef = useRef(false);
  const measureVertsRef = useRef<[number, number][]>([]);
  const showLabelsRef = useRef(true);
  const colorByRef = useRef<ColorBy>("estado");
  colorByRef.current = colorBy;
  const vertsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  const parcelasRef = useRef(parcelas);
  parcelasRef.current = parcelas;
  const onOpenRef = useRef(onOpenParcela);
  onOpenRef.current = onOpenParcela;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectForEditRef = useRef<(p: any) => void>(() => {});

  const redrawDrawing = useCallback(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!drawRef.current) drawRef.current = L.layerGroup().addTo(map);
    drawRef.current.clearLayers();
    const v = vertsRef.current;
    if (v.length === 0) return;
    if (v.length >= 2) L.polygon(v, { color: "#facc15", weight: 2, dashArray: "5,5", fillOpacity: 0.15 }).addTo(drawRef.current);
    v.forEach((p, i) => L.circleMarker(p, { radius: 5, color: "#facc15", fillColor: "#fff", fillOpacity: 1, weight: 2 }).bindTooltip(String(i + 1)).addTo(drawRef.current));
    // Etiqueta de área en vivo al centro del polígono en construcción.
    if (v.length >= 3) L.marker(centroid(v), { interactive: false, icon: L.divIcon({ className: "", html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;background:rgba(15,23,42,.82);color:#fff;padding:2px 7px;border-radius:7px;font:700 11px system-ui;box-shadow:0 1px 3px rgba(0,0,0,.5)">${geodesicAreaHa(v)} ha</div>`, iconSize: [0, 0] }) }).addTo(drawRef.current);
  }, []);

  const renderPolys = useCallback((fit = true) => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!polysRef.current) polysRef.current = L.layerGroup().addTo(map);
    polysRef.current.clearLayers();
    const bounds: [number, number][] = [];
    for (const p of parcelasRef.current) {
      const pts = parseCoords(p.poligono ?? null);
      if (!pts) continue;
      const meta = polyMeta(p, colorByRef.current);
      const poly = L.polygon(pts, { color: meta.ring, fillColor: meta.ring, fillOpacity: 0.35, weight: 2 });
      poly.bindTooltip(`${p.codigo}${p.areaHa != null ? ` · ${p.areaHa} ha` : ""} · ${meta.label}${editingRef.current ? " · tocá para editar" : ""}`, { sticky: true });
      poly.on("click", () => {
        if (drawingRef.current || measuringRef.current) return;
        if (editingRef.current) selectForEditRef.current(p);
        else onOpenRef.current(p.id);
      });
      poly.addTo(polysRef.current);
      // Etiqueta con el estado en texto (toggle "Etiquetas").
      if (showLabelsRef.current) {
        L.marker(centroid(pts), { interactive: false, icon: L.divIcon({ className: "", html: labelHtml(p, colorByRef.current), iconSize: [0, 0] }) }).addTo(polysRef.current);
      }
      pts.forEach((pt) => bounds.push(pt));
    }
    if (fit && bounds.length) { try { map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 17 }); } catch { /* noop */ } }
  }, []);

  // Init once
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { center: [BRAND_GEO.lat, BRAND_GEO.lng], zoom: 15, maxZoom: 21 });
      mapRef.current = map;
      // maxNativeZoom: Esri/OSM no tienen tiles nativos a zoom muy alto en zonas
      // rurales → mostraban "Map data not yet available". Con maxNativeZoom, Leaflet
      // reescala el último tile disponible en vez de pedir tiles inexistentes.
      satRef.current = L.tileLayer(SAT, { maxZoom: 21, maxNativeZoom: 17, attribution: "Tiles © Esri, Maxar, Earthstar Geographics" }).addTo(map);
      streetRef.current = L.tileLayer(STREET, { maxZoom: 21, maxNativeZoom: 19, attribution: '© OpenStreetMap' });
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        const ll: [number, number] = [e.latlng.lat, e.latlng.lng];
        if (drawingRef.current) {
          vertsRef.current = [...vertsRef.current, ll];
          setNVerts(vertsRef.current.length);
          const m = drawMetrics(vertsRef.current); setDrawArea(m.area); setDrawPerim(m.perim);
          redrawDrawing();
        } else if (measuringRef.current) {
          measureVertsRef.current = [...measureVertsRef.current, ll];
          renderMeasure();
        }
      });
      // Controles profesionales: barra de escala (métrica) + lectura de coordenadas.
      L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);
      map.on("mousemove", (e: { latlng: { lat: number; lng: number } }) => setCursor({ lat: e.latlng.lat, lng: e.latlng.lng }));
      map.on("mouseout", () => setCursor(null));
      setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 200);
      setReady(true);
      renderPolys();
    });
    return () => { destroyed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render polygons when data changes
  useEffect(() => { if (ready) renderPolys(); }, [parcelas, ready, renderPolys]);
  // Recolorear/retextear sin re-encuadrar al cambiar el criterio de color.
  useEffect(() => { if (ready) renderPolys(false); }, [colorBy, ready, renderPolys]);

  // Switch base layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !satRef.current || !streetRef.current) return;
    if (layer === "sat") { map.removeLayer(streetRef.current); satRef.current.addTo(map); }
    else { map.removeLayer(satRef.current); streetRef.current.addTo(map); }
  }, [layer]);

  // Pantalla completa: Leaflet necesita invalidateSize tras cambiar de tamaño;
  // bloqueamos el scroll del body y salimos con Escape (salvo que haya un modal
  // abierto — ahí Radix maneja el Escape primero).
  useEffect(() => {
    const map = mapRef.current;
    const t = map ? setTimeout(() => map.invalidateSize(), 220) : null;
    if (!fullscreen) return () => { if (t) clearTimeout(t); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      if (t) clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, pending]);

  function startDraw() { vertsRef.current = []; setNVerts(0); setDrawArea(0); setDrawPerim(0); setMapMsg(null); drawingRef.current = true; setDrawing(true); redrawDrawing(); }
  function cancelDraw() { vertsRef.current = []; setNVerts(0); setDrawArea(0); setDrawPerim(0); drawingRef.current = false; setDrawing(false); if (drawRef.current) drawRef.current.clearLayers(); }
  function undo() { vertsRef.current = vertsRef.current.slice(0, -1); setNVerts(vertsRef.current.length); const m = drawMetrics(vertsRef.current); setDrawArea(m.area); setDrawPerim(m.perim); redrawDrawing(); }
  function finishDraw() { if (vertsRef.current.length < 3) return; setPending(vertsRef.current); }
  /** Agrega un vértice en la ubicación GPS actual — para "caminar" el contorno del terreno. */
  function addGpsPoint() {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setMapMsg("Tu navegador no permite ubicación."); return; }
    setLocating(true); setMapMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        vertsRef.current = [...vertsRef.current, ll]; setNVerts(vertsRef.current.length);
        const m = drawMetrics(vertsRef.current); setDrawArea(m.area); setDrawPerim(m.perim);
        redrawDrawing();
        if (mapRef.current) mapRef.current.panTo(ll);
      },
      (err: { code: number }) => { setLocating(false); setMapMsg(err.code === 1 ? "Activá el permiso de ubicación para marcar por GPS." : "No pude obtener tu ubicación."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // ── Edición de secciones existentes: arrastrar vértices + área en vivo ──
  function renderEdit() {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!editLayerRef.current) editLayerRef.current = L.layerGroup().addTo(map);
    editLayerRef.current.clearLayers();
    const verts = editVertsRef.current;
    if (verts.length < 3) return;
    editPolyRef.current = L.polygon(verts, { color: "#38bdf8", weight: 2, fillColor: "#38bdf8", fillOpacity: 0.2, dashArray: "4,4" }).addTo(editLayerRef.current);
    const handle = L.divIcon({ className: "", html: '<span style="display:block;width:14px;height:14px;border-radius:50%;background:#38bdf8;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35)"></span>', iconSize: [14, 14], iconAnchor: [7, 7] });
    verts.forEach((pt, i) => {
      const mk = L.marker(pt, { draggable: true, icon: handle }).addTo(editLayerRef.current);
      mk.on("drag", (e: { target: { getLatLng: () => { lat: number; lng: number } } }) => {
        const ll = e.target.getLatLng();
        editVertsRef.current[i] = [ll.lat, ll.lng];
        editPolyRef.current?.setLatLngs(editVertsRef.current);
        setEditArea(geodesicAreaHa(editVertsRef.current));
      });
    });
    setEditArea(geodesicAreaHa(verts));
  }
  function selectForEdit(p: { id: string; codigo: string; poligono?: string | null }) {
    const pts = parseCoords(p.poligono ?? null);
    if (!pts) return;
    setEditSel({ id: p.id, codigo: p.codigo }); setConfirmDel(false); setEditErr(null);
    editVertsRef.current = pts.map((x) => [x[0], x[1]] as [number, number]);
    renderEdit();
  }
  selectForEditRef.current = selectForEdit;
  function enterEdit() { if (drawingRef.current) cancelDraw(); editingRef.current = true; setEditing(true); }
  function exitEdit() {
    editingRef.current = false; setEditing(false); setEditSel(null); setConfirmDel(false); setEditErr(null); setSavingEdit(false);
    editVertsRef.current = [];
    if (editLayerRef.current) editLayerRef.current.clearLayers();
  }
  async function saveEdit() {
    if (!editSel || editVertsRef.current.length < 3) return;
    setSavingEdit(true); setEditErr(null);
    try {
      const r = await fetch("/api/admin/cacao/campo", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ action: "update_parcela", id: editSel.id, patch: { poligono: JSON.stringify(editVertsRef.current), areaHa: geodesicAreaHa(editVertsRef.current) } }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      exitEdit(); onChanged();
    } catch (e) { setEditErr(e instanceof Error ? e.message : String(e)); setSavingEdit(false); }
  }
  async function deleteSel() {
    if (!editSel) return;
    setSavingEdit(true); setEditErr(null);
    try {
      const r = await fetch(`/api/admin/cacao/campo?type=parcela&id=${encodeURIComponent(editSel.id)}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      exitEdit(); onChanged();
    } catch (e) { setEditErr(e instanceof Error ? e.message : String(e)); setSavingEdit(false); setConfirmDel(false); }
  }

  // ── Medición de distancia/área (no crea sección) ──
  function renderMeasure() {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!measureLayerRef.current) measureLayerRef.current = L.layerGroup().addTo(map);
    measureLayerRef.current.clearLayers();
    const v = measureVertsRef.current;
    setMeasurePts(v.length);
    if (v.length === 0) { setMeasureDist(0); setMeasureArea(0); return; }
    if (v.length >= 2) L.polyline(v, { color: "#f472b6", weight: 3, dashArray: "6,4" }).addTo(measureLayerRef.current);
    v.forEach((p) => L.circleMarker(p, { radius: 5, color: "#f472b6", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(measureLayerRef.current));
    let dist = 0;
    for (let i = 1; i < v.length; i++) dist += haversineM(v[i - 1], v[i]);
    setMeasureDist(dist);
    setMeasureArea(v.length >= 3 ? geodesicAreaHa(v) : 0);
  }
  function startMeasure() {
    if (drawingRef.current) cancelDraw();
    if (editingRef.current) exitEdit();
    measureVertsRef.current = []; measuringRef.current = true; setMeasuring(true);
    setMeasurePts(0); setMeasureDist(0); setMeasureArea(0); setMapMsg(null);
  }
  function undoMeasure() { measureVertsRef.current = measureVertsRef.current.slice(0, -1); renderMeasure(); }
  function clearMeasure() { measureVertsRef.current = []; renderMeasure(); }
  function exitMeasure() { measuringRef.current = false; setMeasuring(false); measureVertsRef.current = []; if (measureLayerRef.current) measureLayerRef.current.clearLayers(); }

  // ── Ir a sección / GPS / etiquetas ──
  function flyTo(id: string) {
    const p = parcelasRef.current.find((x) => x.id === id);
    const L = LRef.current, map = mapRef.current;
    if (!p || !L || !map) return;
    const pts = parseCoords(p.poligono ?? null);
    if (pts && pts.length) { try { map.flyToBounds(L.latLngBounds(pts), { maxZoom: 18, padding: [40, 40] }); } catch { /* noop */ } }
  }
  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setMapMsg("Tu navegador no permite ubicación."); return; }
    setLocating(true); setMapMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const L = LRef.current, map = mapRef.current;
        if (!L || !map) return;
        const { latitude, longitude } = pos.coords;
        if (locateMarkerRef.current) map.removeLayer(locateMarkerRef.current);
        locateMarkerRef.current = L.circleMarker([latitude, longitude], { radius: 8, color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 3 }).bindTooltip("Estás acá", { direction: "top" }).addTo(map);
        map.flyTo([latitude, longitude], 16);
      },
      (err: { code: number }) => { setLocating(false); setMapMsg(err.code === 1 ? "Activá el permiso de ubicación en tu navegador para usar el GPS." : "No pude obtener tu ubicación."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  function toggleLabels() { const v = !showLabelsRef.current; showLabelsRef.current = v; setShowLabels(v); renderPolys(false); }
  /** Vuela a una coordenada exacta y deja un marcador (locación de survey). */
  function goToCoord(lat: number, lng: number) {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (locateMarkerRef.current) map.removeLayer(locateMarkerRef.current);
    locateMarkerRef.current = L.circleMarker([lat, lng], { radius: 7, color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 3 }).bindTooltip(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, { direction: "top" }).addTo(map);
    map.flyTo([lat, lng], 18);
  }
  /** Exporta las secciones dibujadas como GeoJSON (FeatureCollection) — para plan
   *  de manejo, EUDR/certificación o SIG. GeoJSON usa orden [lng, lat] y anillo cerrado. */
  function exportGeoJSON() {
    const features = parcelasRef.current.map((p) => {
      const pts = parseCoords(p.poligono ?? null);
      if (!pts) return null;
      const ring = [...pts.map(([lat, lng]) => [lng, lat]), [pts[0][1], pts[0][0]]];
      return { type: "Feature", properties: { codigo: p.codigo, nombre: p.nombre, areaHa: p.areaHa, variedad: p.variedad, estado: p.laborStatus, focosSanidad: p.sanidad?.focos ?? 0 }, geometry: { type: "Polygon", coordinates: [ring] } };
    }).filter(Boolean);
    if (!features.length) { setMapMsg("Dibujá al menos una sección para exportar."); return; }
    const fc = { type: "FeatureCollection", features };
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "campo-secciones.geojson"; a.click();
    URL.revokeObjectURL(url);
  }

  const hasPolygons = parcelas.some((p) => parseCoords(p.poligono ?? null));
  const conPoligono = parcelas.filter((p) => parseCoords(p.poligono ?? null));
  // Sugerencia de código para la próxima sección: siguiente número del prefijo más usado.
  const suggestedCodigo = (() => {
    const byPrefix = new Map<string, number[]>();
    for (const p of parcelas) {
      const mt = /^([A-Za-z]+)-?(\d+)/.exec(p.codigo.trim());
      if (mt) { const pre = mt[1].toUpperCase(); const arr = byPrefix.get(pre) ?? []; arr.push(parseInt(mt[2], 10)); byPrefix.set(pre, arr); }
    }
    if (!byPrefix.size) return "A-01";
    const [pre, nums] = [...byPrefix.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    return `${pre}-${String(Math.max(...nums) + 1).padStart(2, "0")}`;
  })();
  const legendItems: { c: string; l: string }[] = colorBy === "sanidad"
    ? [{ c: "var(--data-success-500)", l: "Sano" }, { c: SANIDAD_SEVERIDAD.baja.ring, l: "Plaga baja" }, { c: SANIDAD_SEVERIDAD.media.ring, l: "Plaga media" }, { c: SANIDAD_SEVERIDAD.alta.ring, l: "Plaga alta" }]
    : (["al_dia", "pendiente", "vencido", "sin_labores"] as const).map((s) => ({ c: PARCELA_STATUS[s].ring, l: PARCELA_STATUS[s].label }));

  return (
    <div className={fullscreen ? "fixed inset-0 z-[45] flex flex-col gap-3 bg-[var(--surface-canvas)] p-3 sm:p-4" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-2">
        {drawing ? (
          <>
            <span className="inline-flex h-11 items-center rounded-xl bg-[var(--data-warning-50)] px-3 text-sm font-bold text-[var(--data-warning-700)]">Tocá el mapa para marcar los vértices ({nVerts}){drawPerim > 0 ? ` · ${formatDist(drawPerim)}` : ""}{drawArea > 0 ? ` · ${drawArea.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha` : ""}</span>
            <button type="button" onClick={addGpsPoint} disabled={locating} title="Agregar un vértice en mi ubicación GPS (caminar el terreno)" className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50">{locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}<span className="hidden sm:inline">Punto GPS</span></button>
            <button type="button" onClick={undo} disabled={nVerts === 0} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Undo2 className="h-4 w-4" />Deshacer</button>
            <button type="button" onClick={finishDraw} disabled={nVerts < 3} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-success-600)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"><Check className="h-4 w-4" />Terminar ({nVerts})</button>
            <button type="button" onClick={cancelDraw} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Cancelar</button>
          </>
        ) : editing ? (
          editSel ? (
            <>
              <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-info-50)] px-3 text-sm font-bold text-[var(--data-info-700)]"><Edit3 className="h-4 w-4" />Editando {editSel.codigo} · {editArea.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha</span>
              <button type="button" onClick={saveEdit} disabled={savingEdit} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-success-600)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar</button>
              {!confirmDel ? (
                <button type="button" onClick={() => setConfirmDel(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--data-error-500)] px-3 text-sm font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-50)]"><Trash2 className="h-4 w-4" />Borrar</button>
              ) : (
                <button type="button" onClick={deleteSel} disabled={savingEdit} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-error-600)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Confirmar borrar</button>
              )}
              <button type="button" onClick={exitEdit} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Salir</button>
            </>
          ) : (
            <>
              <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--data-info-50)] px-3 text-sm font-bold text-[var(--data-info-700)]"><Edit3 className="h-4 w-4" />Tocá una sección para mover sus límites</span>
              <button type="button" onClick={exitEdit} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Salir</button>
            </>
          )
        ) : measuring ? (
          <>
            <span className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-sm font-bold text-[var(--text-primary)]"><Route className="h-4 w-4 text-[var(--accent)]" />{measurePts < 2 ? "Tocá el mapa para medir" : formatDist(measureDist)}{measureArea > 0 ? ` · ${measureArea.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha` : ""}</span>
            <button type="button" onClick={undoMeasure} disabled={measurePts === 0} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Undo2 className="h-4 w-4" />Deshacer</button>
            <button type="button" onClick={clearMeasure} disabled={measurePts === 0} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><X className="h-4 w-4" />Limpiar</button>
            <button type="button" onClick={exitMeasure} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Check className="h-4 w-4" />Listo</button>
          </>
        ) : (
          <>
            <button type="button" onClick={startDraw} disabled={!ready} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"><Pencil className="h-4 w-4" />Dibujar sección</button>
            {hasPolygons && <button type="button" onClick={enterEdit} disabled={!ready} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Edit3 className="h-4 w-4" />Editar</button>}
            <button type="button" onClick={startMeasure} disabled={!ready} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Route className="h-4 w-4" />Medir</button>
            <button type="button" onClick={() => setCoordModal(true)} disabled={!ready} title="Crear o ir a una sección por coordenadas GPS" className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Navigation className="h-4 w-4" />Coordenadas</button>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {conPoligono.length > 0 && (
            <select value="" onChange={(e) => { if (e.target.value) flyTo(e.target.value); }} title="Ir a una sección" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
              <option value="">Ir a sección…</option>
              {conPoligono.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
            </select>
          )}
          <button type="button" onClick={locate} disabled={locating} title="Centrar el mapa en mi ubicación (GPS)" className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50">{locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}<span className="hidden sm:inline">Mi ubicación</span></button>
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)} title="Colorear las secciones por" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
            <option value="estado">Color: Estado</option>
            <option value="sanidad">Color: Sanidad</option>
          </select>
          {hasPolygons && <button type="button" onClick={toggleLabels} title="Mostrar los códigos sobre las secciones" className={`inline-flex h-11 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold hover:bg-[var(--surface-canvas)] ${showLabels ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]"}`}><Tag className="h-4 w-4" /><span className="hidden sm:inline">Etiquetas</span></button>}
          {hasPolygons && <button type="button" onClick={exportGeoJSON} title="Exportar las secciones como GeoJSON (plan de manejo / EUDR / SIG)" className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Download className="h-4 w-4" /><span className="hidden sm:inline">Exportar</span></button>}
          <button type="button" onClick={() => setLayer((l) => (l === "sat" ? "street" : "sat"))} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Layers className="h-4 w-4" />{layer === "sat" ? "Satélite" : "Calles"}</button>
          <button type="button" onClick={() => setFullscreen((v) => !v)} title={fullscreen ? "Salir de pantalla completa (Esc)" : "Ver el mapa a pantalla completa"} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">{fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}<span className="hidden sm:inline">{fullscreen ? "Salir" : "Pantalla completa"}</span></button>
        </div>
      </div>

      <div className={fullscreen ? "relative flex-1 min-h-0" : "relative"}>
        {/* `isolate` = isolation:isolate → el mapa crea su PROPIO stacking context,
            así los z-index internos de Leaflet (controles z-800, tooltips z-650…)
            quedan contenidos y nunca escapan por encima de los modales (z-50). */}
        <div ref={containerRef} style={{ height: fullscreen ? "100%" : 480, cursor: drawing || measuring ? "crosshair" : "" }} className="isolate w-full overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]" />
        {ready && !hasPolygons && !drawing && !measuring && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-xs rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 text-center shadow-[var(--shadow-lg)]">
              <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Pencil className="h-6 w-6" /></span>
              <p className="text-sm font-bold text-[var(--text-primary)]">Dibujá tu primera sección para verla en el mapa</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Tocá “Dibujar sección” y marcá el contorno de tu terreno. Aparecerá acá coloreada por su estado.</p>
              <button type="button" onClick={startDraw} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90"><Pencil className="h-4 w-4" />Dibujar sección</button>
            </div>
          </div>
        )}
        {/* Leyenda del criterio de color (mapa temático) */}
        {ready && hasPolygons && (
          <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-md)]">
            <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{colorBy === "sanidad" ? "Sanidad" : "Estado de labores"}</p>
            <div className="space-y-0.5">
              {legendItems.map((it) => <span key={it.l} className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: it.c }} />{it.l}</span>)}
            </div>
          </div>
        )}
        {/* Lectura de coordenadas del cursor (mapeo profesional) */}
        {cursor && <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">{Number(cursor.lat).toFixed(5)}, {Number(cursor.lng).toFixed(5)}</div>}
      </div>
      {editErr && <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-xs font-bold text-[var(--data-error-700)]">{editErr}</p>}
      {mapMsg && <p className="flex items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-xs font-bold text-[var(--data-warning-700)]">{mapMsg}<button type="button" onClick={() => setMapMsg(null)} className="shrink-0 text-[var(--data-warning-700)]"><X className="h-4 w-4" /></button></p>}
      {!fullscreen && !editing && !measuring && <p className="text-xs text-[var(--text-tertiary)]"><MapPin className="mr-1 inline h-3 w-3" />Tocá una sección dibujada para ver y registrar sus labores. Dibujá con al menos 3 puntos.</p>}
      {!fullscreen && editing && <p className="text-xs text-[var(--text-tertiary)]"><Edit3 className="mr-1 inline h-3 w-3" />Arrastrá los puntos azules para mover los límites; el área en hectáreas se recalcula sola. Guardá para aplicar.</p>}
      {!fullscreen && measuring && <p className="text-xs text-[var(--text-tertiary)]"><Route className="mr-1 inline h-3 w-3" />Tocá puntos en el mapa para medir distancia; con 3+ puntos también calcula el área. No crea ninguna sección.</p>}

      {pending && <AsignarSeccionModal poligono={pending} suggestedCodigo={suggestedCodigo} onClose={() => setPending(null)} onSaved={() => { setPending(null); cancelDraw(); onChanged(); }} />}
      {coordModal && <CoordenadasModal onClose={() => setCoordModal(false)} onCreate={(pts) => { setCoordModal(false); setPending(pts); }} onGoTo={(lat, lng) => { setCoordModal(false); goToCoord(lat, lng); }} />}
    </div>
  );
}

/** Mapeo por coordenadas (grado plan de manejo): crear una sección pegando la
 *  lista de puntos GPS del levantamiento, o volar a una coordenada exacta. */
function CoordenadasModal({ onClose, onCreate, onGoTo }: { onClose: () => void; onCreate: (pts: [number, number][]) => void; onGoTo: (lat: number, lng: number) => void }) {
  const [text, setText] = useState("");
  const [goLat, setGoLat] = useState("");
  const [goLng, setGoLng] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pts = parseCoordText(text);
  const area = pts.length >= 3 ? geodesicAreaHa(pts) : 0;

  function crear() {
    if (pts.length < 3) { setError("Necesitás al menos 3 coordenadas válidas (una «lat, lng» por línea)."); return; }
    onCreate(pts);
  }
  function ir() {
    const lat = parseFloat(goLat), lng = parseFloat(goLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError("Coordenada inválida."); return; }
    onGoTo(lat, lng);
  }

  const I = "h-11 w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <AdminModal open onClose={onClose} variant="wide" icon={Navigation} title="Mapeo por coordenadas" description="Creá una sección desde tu levantamiento GPS o andá a una coordenada exacta.">
      <div className="space-y-5 p-5">
        <div>
          <p className="mb-1 text-sm font-bold text-[var(--text-primary)]">Crear sección por coordenadas</p>
          <p className="mb-2 text-xs text-[var(--text-tertiary)]">Pegá los vértices del terreno, una coordenada por línea: <span className="font-mono">latitud, longitud</span> (ej. de tu GPS). Se cierra el polígono solo.</p>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); }} rows={6} placeholder={"-8.38200, -74.53100\n-8.38150, -74.52950\n-8.38300, -74.52980"} className={`${I} h-auto py-2 font-mono`} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-lg bg-[var(--surface-sunken)] px-3 text-xs font-bold text-[var(--text-secondary)]">{pts.length} puntos válidos{area > 0 ? ` · ${area.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha` : ""}</span>
            <button type="button" onClick={crear} disabled={pts.length < 3} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"><Check className="h-4 w-4" />Continuar</button>
          </div>
        </div>
        <div className="border-t-2 border-[var(--rule-base)] pt-4">
          <p className="mb-2 text-sm font-bold text-[var(--text-primary)]">Ir a una coordenada</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-[var(--text-secondary)]">Latitud<input value={goLat} onChange={(e) => setGoLat(e.target.value)} placeholder="-8.3820" className={`mt-1 ${I} w-36`} /></label>
            <label className="text-xs font-bold text-[var(--text-secondary)]">Longitud<input value={goLng} onChange={(e) => setGoLng(e.target.value)} placeholder="-74.5310" className={`mt-1 ${I} w-36`} /></label>
            <button type="button" onClick={ir} className="inline-flex h-11 items-center gap-2 rounded-lg border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Navigation className="h-4 w-4" />Ir</button>
          </div>
        </div>
        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}
      </div>
    </AdminModal>
  );
}

function AsignarSeccionModal({ poligono, suggestedCodigo, onClose, onSaved }: { poligono: [number, number][]; suggestedCodigo: string; onClose: () => void; onSaved: () => void }) {
  const areaCalc = geodesicAreaHa(poligono);
  let perimCalc = 0;
  for (let i = 0; i < poligono.length; i++) perimCalc += haversineM(poligono[i], poligono[(i + 1) % poligono.length]);
  const [f, setF] = useState({ codigo: suggestedCodigo, nombre: "", areaHa: String(areaCalc), variedad: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valido = f.codigo.trim().length >= 1;
  const c = centroid(poligono);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !valido) { if (!valido) setError("El código es obligatorio (ej. A-01)."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        codigo: f.codigo.trim(), nombre: f.nombre.trim() || null,
        areaHa: f.areaHa ? Number(f.areaHa) : null, variedad: f.variedad || null,
        poligono: JSON.stringify(poligono), latitud: Number(c[0].toFixed(7)), longitud: Number(c[1].toFixed(7)),
      };
      const r = await fetch("/api/admin/cacao/campo?type=parcela", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }

  const I = "h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <AdminModal open onClose={onClose} variant="default" icon={Pencil} title="Nueva sección dibujada" description={`${poligono.length} puntos · ${areaCalc.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha · ${formatDist(perimCalc)} de perímetro`}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold text-[var(--text-primary)]">Código *<input value={f.codigo} onChange={set("codigo")} placeholder="A-01" className={`mt-1 ${I}`} autoFocus /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Nombre<input value={f.nombre} onChange={set("nombre")} placeholder="Lote alto" className={`mt-1 ${I}`} /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Área (ha) <span className="font-normal text-[var(--text-tertiary)]">· calculada del dibujo</span><input type="number" step="0.01" min="0" value={f.areaHa} onChange={set("areaHa")} placeholder="1.0" className={`mt-1 ${I}`} /></label>
          <label className="text-sm font-bold text-[var(--text-primary)]">Variedad<select value={f.variedad} onChange={set("variedad")} className={`mt-1 ${I}`}><option value="">—</option>{VARIEDADES.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        </div>
        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Cancelar</button>
          <button type="submit" disabled={!valido || submitting} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar sección</button>
        </div>
      </form>
    </AdminModal>
  );
}
