"use client";

/**
 * CtpPlantaMapa — mapa satelital del ASERRADERO: dibujá las zonas de tu planta
 * (entrada/GTF, patio de trozas, aserrado, secado, patio de producto, despacho)
 * como polígonos con código y tipo, coloreadas por tipo. El gemelo espacial del
 * Libro CTP: el Libro dice cuánta madera hay; el mapa dice DÓNDE está y por dónde
 * se mueve. Adaptado del Campo de cacao (CacaoCampoMapa), midiendo en m² (no ha)
 * y coloreando por tipo de zona. Dibujo manual (click a click, sin leaflet-draw).
 */
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Undo2, Check, X, Layers, MapPin, Loader2, Maximize, Minimize, Edit3, Trash2, Locate, Tag, Route, Navigation, Download } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import AdminModal from "@/components/admin/shared/AdminModal";
import { BRAND_GEO } from "@/lib/geo";
import { geodesicAreaM2, haversineM, formatDist } from "@/lib/cacao/geo-area";
import { pointInPolygon } from "@/lib/forestal/loth-geo";
import { DND_ITEM } from "./CtpPlantaPanel";
import { ZONA_TIPOS, zonaTipoMeta, type ItemKind, type PlantaZona, type ZonaInv, type ZonaTipo } from "@/lib/forestal/planta-zona-types";
import { marcasDeZona } from "@/lib/forestal/planta-marcadores";
import { etiquetaCorta, MARCA_CSS, marcaHtml, marcaSobranteHtml } from "@/lib/forestal/planta-iconos";

import { Btn, CampoGrid, Field, I, MODAL_BODY, ModalBody, ModalFooter } from "./ctp-shared";

export type { ZonaInv };

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fmtArea = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha` : `${Math.round(m2).toLocaleString("es-PE")} m²`);

/** HTML de la etiqueta sobre cada zona: código + tipo + área + inventario ubicado. */
function labelHtml(z: PlantaZona, inv?: ZonaInv, arriba = false): string {
  const meta = zonaTipoMeta(z.tipo);
  const header = `<div style="font-weight:800;font-size:12px">${escapeHtml(z.codigo)}${z.areaM2 != null ? ` · ${fmtArea(z.areaM2)}` : ""}</div><div style="font-weight:700;color:${meta.ring}">${escapeHtml(meta.label)}</div>`;
  const sub = z.nombre ? `<div style="opacity:.85">${escapeHtml(z.nombre)}</div>` : "";
  const parts: string[] = [];
  if (inv?.trozas) parts.push(`${inv.trozas} ${inv.trozas === 1 ? "troza" : "trozas"} · ${inv.m3.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³`);
  if (inv?.productos) parts.push(`${inv.productos} ${inv.productos === 1 ? "producto" : "productos"}`);
  if (inv?.despachos) parts.push(`${inv.despachos} ${inv.despachos === 1 ? "despacho" : "despachos"}`);
  // Color FIJO y no `var(--accent-glow)`: ese token vale `#00a0a047` —un teal
  // con 28 % de alpha— y daba 1.51:1 sobre el fondo de la etiqueta. Era el dato
  // más útil de las tres líneas (cuánta madera hay acá) y el menos legible. El
  // fondo de la etiqueta es fijo, así que el color también puede serlo.
  const invLine = parts.length ? `<div style="color:#5eead4;font-weight:700">${parts.join(" · ")}</div>` : "";
  return `<div class="${arriba ? "ctp-zona-ficha-arriba" : ""}" style="transform:translate(-50%,-50%);display:inline-block;white-space:nowrap;border-left:3px solid ${meta.ring};background:rgba(15,23,42,.82);color:#fff;padding:3px 8px;border-radius:8px;font:600 11px/1.4 system-ui;box-shadow:0 1px 3px rgba(0,0,0,.5)">${header}${sub}${invLine}</div>`;
}

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
// Última resolución real del satélite Esri en zonas remotas (Ciudad Constitución /
// concesiones). Más allá se upscalea (zoom digital) — el badge lo avisa.
const SAT_MAX_NATIVE = 17;

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
function drawMetrics(v: [number, number][]): { area: number; perim: number } {
  let perim = 0;
  for (let i = 1; i < v.length; i++) perim += haversineM(v[i - 1], v[i]);
  return { area: v.length >= 3 ? geodesicAreaM2(v) : 0, perim };
}

export interface CtpPlantaMapaProps {
  zonas: PlantaZona[];
  inventario?: Record<string, ZonaInv>;
  onChanged: () => void;
  /** Ítem tomado en la barra lateral: mientras lo haya, tocar una zona lo ubica
   *  ahí en vez de abrir su ficha. */
  enMano?: { id: string; label: string } | null;
  /** El ítem cayó dentro de una zona (arrastrado o tocado). */
  onSoltarEnZona?: (zonaId: string) => void;
  /** Cayó fuera de todo polígono: hay que decirlo, no fallar en silencio. */
  onSoltarAfuera?: () => void;
  /** Zona a destacar (el puntero está sobre su ítem en la lista). */
  zonaResaltada?: string | null;
  /** Pedido de centrar el mapa. El `n` hace que dos pedidos seguidos a la misma
   *  zona sigan disparando el efecto. */
  irA?: { zonaId: string; n: number } | null;
  /** Qué hay ubicado en cada zona: se dibuja como chapitas con icono adentro. */
  ubicados?: Record<string, MarcaItem[]>;
  /** El último que se soltó — entra con la animación de caída. */
  recienUbicado?: string | null;
  /** Punto elegido a mano para un ítem; los que no tienen, se reparten solos. */
  posiciones?: Record<string, { lat: number; lng: number }>;
  /** El operador arrastró un icono a otro punto DENTRO de su zona. */
  onMover?: (entryId: string, pos: { lat: number; lng: number }) => void;
  /** Sacar un ítem del mapa desde su ficha. */
  onQuitar?: (entryId: string) => void;
  /** HTML de la ficha de un ítem (lo arma la vista, que tiene los datos). */
  fichaDeItem?: (entryId: string) => string | null;
  /** HTML de la ficha de una zona con su resumen. */
  fichaDeZona?: (zonaId: string) => string | null;
  /** Emitir la guía con lo apilado en una cancha de reserva. */
  onDespachar?: (zonaId: string) => void;
}

/** Lo mínimo que necesita el mapa de un ítem para ponerle su chapita. */
export interface MarcaItem {
  id: string;
  kind: ItemKind;
  label: string;
  cites: boolean;
  /** Cantidad ya formateada («12.5 m³»): se escribe arriba del icono. */
  cantidad?: string;
}

export default function CtpPlantaMapa({
  zonas, inventario, onChanged, enMano = null, onSoltarEnZona, onSoltarAfuera, zonaResaltada = null, irA = null,
  ubicados, recienUbicado = null, posiciones, onMover, onQuitar, fichaDeItem, fichaDeZona, onDespachar,
}: CtpPlantaMapaProps) {
  /** Zona bajo el puntero mientras se arrastra un ítem (previsualiza el destino). */
  const [sobreZona, setSobreZona] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- instancias Leaflet (import dinámico)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editPolyRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // Zoom actual — para avisar cuando se pasa el detalle real del satélite.
  const [zoom, setZoom] = useState(17);
  const [pending, setPending] = useState<[number, number][] | null>(null);
  const [coordModal, setCoordModal] = useState(false);
  const [ficha, setFicha] = useState<PlantaZona | null>(null);
  // Edición de geometría (mover vértices).
  const [editing, setEditing] = useState(false);
  const [editSel, setEditSel] = useState<{ id: string; codigo: string } | null>(null);
  const [editArea, setEditArea] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
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
  const vertsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef(false);
  const zonasRef = useRef(zonas);
  zonasRef.current = zonas;
  const invRef = useRef(inventario);
  invRef.current = inventario;
  const onFichaRef = useRef<(z: PlantaZona) => void>(() => {});
  onFichaRef.current = (z) => setFicha(z);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectForEditRef = useRef<(z: any) => void>(() => {});
  /**
   * Los handlers de Leaflet se registran una vez y viven fuera de React: leen el
   * estado por ref o se quedarían con el primer valor para siempre.
   */
  const enManoRef = useRef(enMano);
  enManoRef.current = enMano;
  const onSoltarRef = useRef(onSoltarEnZona);
  onSoltarRef.current = onSoltarEnZona;
  const onAfueraRef = useRef(onSoltarAfuera);
  onAfueraRef.current = onSoltarAfuera;
  const ubicadosRef = useRef(ubicados);
  ubicadosRef.current = ubicados;
  const recienRef = useRef(recienUbicado);
  recienRef.current = recienUbicado;
  const posicionesRef = useRef(posiciones);
  posicionesRef.current = posiciones;
  const onMoverRef = useRef(onMover);
  onMoverRef.current = onMover;
  const onQuitarRef = useRef(onQuitar);
  onQuitarRef.current = onQuitar;
  const fichaItemRef = useRef(fichaDeItem);
  fichaItemRef.current = fichaDeItem;
  const fichaZonaRef = useRef(fichaDeZona);
  fichaZonaRef.current = fichaDeZona;
  const onDespacharRef = useRef(onDespachar);
  onDespacharRef.current = onDespachar;
  /** Zona cuya ficha emergente está abierta (el botón «ver ficha» la necesita). */
  const zonaFichaAbiertaRef = useRef<string | null>(null);
  /** zonaId → capa dibujada, para resaltar sin volver a dibujar el mapa entero. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polyByZonaRef = useRef<Map<string, any>>(new Map());

  const redrawDrawing = useCallback(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!drawRef.current) drawRef.current = L.layerGroup().addTo(map);
    drawRef.current.clearLayers();
    const v = vertsRef.current;
    if (v.length === 0) return;
    if (v.length >= 2) L.polygon(v, { color: "#facc15", weight: 2, dashArray: "5,5", fillOpacity: 0.15 }).addTo(drawRef.current);
    v.forEach((p, i) => L.circleMarker(p, { radius: 5, color: "#facc15", fillColor: "#fff", fillOpacity: 1, weight: 2 }).bindTooltip(String(i + 1)).addTo(drawRef.current));
    if (v.length >= 3) L.marker(centroid(v), { interactive: false, icon: L.divIcon({ className: "", html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;background:rgba(15,23,42,.82);color:#fff;padding:2px 7px;border-radius:7px;font:700 11px system-ui;box-shadow:0 1px 3px rgba(0,0,0,.5)">${fmtArea(geodesicAreaM2(v))}</div>`, iconSize: [0, 0] }) }).addTo(drawRef.current);
  }, []);

  /**
   * Las chapitas de lo que está ubicado en la zona.
   *
   * Cada una es un marcador ARRASTRABLE: el patio tiene su orden y el operador
   * pone el icono donde está la pila de verdad. Al soltarlo se valida que el
   * punto siga dentro del polígono — si se fue afuera, vuelve solo, porque una
   * troza dibujada fuera de su zona dice que está en la de al lado.
   *
   * Tocarlas abre su ficha. Mientras se arrastra un ítem DESDE la barra lateral
   * dejan de recibir eventos, para que el drop llegue al polígono de abajo:
   * soltar sobre una pila que ya existe es lo más natural del mundo.
   */
  const dibujarMarcas = useCallback((z: PlantaZona, pts: [number, number][] | null, color: string) => {
    const L = LRef.current;
    const items = ubicadosRef.current?.[z.id] ?? [];
    if (!L || items.length === 0 || !polysRef.current) return;
    const centro: [number, number] | null = z.lat != null && z.lng != null ? [z.lat, z.lng] : null;
    // Los que tienen punto propio se quedan donde el operador los dejó; el
    // reparto automático es sólo para los que nunca se movieron.
    const guardadas = posicionesRef.current ?? {};
    const sueltos = items.filter((i) => !guardadas[i.id]);
    const { marcas: repartidas, sobran } = marcasDeZona(pts, centro, sueltos);
    const marcas = [
      ...items.filter((i) => guardadas[i.id]).map((item) => ({ item, pos: [guardadas[item.id].lat, guardadas[item.id].lng] as [number, number] })),
      ...repartidas,
    ];
    for (const m of marcas) {
      const mk = L.marker(m.pos, {
        draggable: true,
        zIndexOffset: 400,
        icon: L.divIcon({
          className: "",
          html: marcaHtml({
            kind: m.item.kind,
            texto: etiquetaCorta(m.item.label),
            cantidad: m.item.cantidad,
            color,
            cites: m.item.cites,
            entrando: recienRef.current === m.item.id,
          }),
          // Tamaño REAL, no [0,0]: el área que se puede agarrar para arrastrar
          // es la del icono de Leaflet, y con tamaño cero no hay nada que
          // agarrar (medido: el marcador no se movía ni un píxel).
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      });
      mk.on("dragstart", () => { mk.getElement()?.classList.add("ctp-marca-moviendo"); });
      mk.on("dragend", () => {
        mk.getElement()?.classList.remove("ctp-marca-moviendo");
        const ll = mk.getLatLng();
        const dentro = !pts || pointInPolygon([ll.lat, ll.lng], pts);
        if (dentro) onMoverRef.current?.(m.item.id, { lat: ll.lat, lng: ll.lng });
        else {
          // Fuera de su zona: vuelve a donde estaba y se avisa. Reasignar de
          // zona arrastrando el icono sería fácil de hacer sin querer.
          mk.setLatLng(m.pos);
          setMapMsg("Ese punto queda fuera de la zona. Para cambiarla, arrastrá desde la lista.");
        }
      });
      mk.on("click", () => {
        if (drawingRef.current || measuringRef.current || editingRef.current) return;
        if (enManoRef.current) { onSoltarRef.current?.(z.id); return; }
        const html = fichaItemRef.current?.(m.item.id);
        if (html) mk.bindPopup(html, { className: "ctp-popup", offset: [0, -14] }).openPopup();
      });
      mk.addTo(polysRef.current);
    }
    if (sobran > 0 && marcas.length) {
      // El «+N» va sobre la última posición repartida, no en el centro: ahí ya
      // hay chapitas y se lee como parte de la pila.
      L.marker(marcas[marcas.length - 1].pos, {
        interactive: false, zIndexOffset: 401,
        icon: L.divIcon({ className: "", html: marcaSobranteHtml(sobran, color), iconSize: [0, 0] }),
      }).addTo(polysRef.current);
    }
  }, []);

  const renderPolys = useCallback((fit = true) => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!polysRef.current) polysRef.current = L.layerGroup().addTo(map);
    polysRef.current.clearLayers();
    polyByZonaRef.current = new Map();
    const bounds: [number, number][] = [];
    for (const z of zonasRef.current) {
      const pts = parseCoords(z.poligono ?? null);
      const meta = zonaTipoMeta(z.tipo);
      if (pts) {
        const poly = L.polygon(pts, { color: meta.ring, fillColor: meta.ring, fillOpacity: 0.35, weight: 2 });
        poly.bindTooltip(`${z.codigo} · ${meta.label}${editingRef.current ? " · tocá para mover límites" : ""}`, { sticky: true });
        poly.on("click", () => {
          if (drawingRef.current || measuringRef.current) return;
          // Con un ítem en la mano, tocar la zona lo UBICA ahí. Abrir la ficha
          // en ese momento sería perder el gesto que el operador venía haciendo.
          if (enManoRef.current) { onSoltarRef.current?.(z.id); return; }
          if (editingRef.current) { selectForEditRef.current(z); return; }
          // Tocar la zona muestra QUÉ hay adentro; editar el terreno es un paso
          // más, desde el botón de la ficha.
          const html = fichaZonaRef.current?.(z.id);
          zonaFichaAbiertaRef.current = z.id;
          if (html) poly.bindPopup(html, { className: "ctp-popup", maxWidth: 300 }).openPopup();
          else onFichaRef.current(z);
        });
        poly.addTo(polysRef.current);
        polyByZonaRef.current.set(z.id, poly);
        // La ficha de la zona va al centro cuando está vacía, y al BORDE DE
        // ARRIBA cuando tiene madera adentro: en el centro se montaba encima de
        // las chapitas y no se leía ni una cosa ni la otra.
        if (showLabelsRef.current) {
          const conMarcas = (ubicadosRef.current?.[z.id]?.length ?? 0) > 0;
          const c = centroid(pts);
          const anclaFicha: [number, number] = conMarcas
            ? [Math.max(...pts.map((p) => p[0])), c[1]]
            : c;
          L.marker(anclaFicha, {
            interactive: false,
            icon: L.divIcon({ className: "", html: labelHtml(z, invRef.current?.[z.id], conMarcas), iconSize: [0, 0] }),
          }).addTo(polysRef.current);
        }
        dibujarMarcas(z, pts, meta.ring);
        pts.forEach((pt) => bounds.push(pt));
      } else if (z.lat != null && z.lng != null) {
        // Zona sin polígono: marcador simple.
        const mk = L.circleMarker([z.lat, z.lng], { radius: 8, color: meta.ring, fillColor: meta.ring, fillOpacity: 0.6, weight: 3 });
        mk.bindTooltip(`${z.codigo} · ${meta.label}`, { sticky: true });
        mk.on("click", () => {
          if (drawingRef.current || measuringRef.current) return;
          if (enManoRef.current) { onSoltarRef.current?.(z.id); return; }
          if (!editingRef.current) onFichaRef.current(z);
        });
        mk.addTo(polysRef.current);
        polyByZonaRef.current.set(z.id, mk);
        dibujarMarcas(z, null, meta.ring);
        bounds.push([z.lat, z.lng]);
      }
    }
    if (fit && bounds.length) { try { map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 19 }); } catch { /* noop */ } }
  }, [dibujarMarcas]);

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { center: [BRAND_GEO.lat, BRAND_GEO.lng], zoom: 17, maxZoom: 22 });
      mapRef.current = map;
      map.on("zoomend", () => setZoom(map.getZoom()));
      // maxNativeZoom 17 (no 18): Esri World_Imagery NO tiene imagen a z18 en
      // zonas remotas como Ciudad Constitución / concesiones forestales — a z18+
      // devuelve el tile gris "Map data not yet available". Con 17, Leaflet pide
      // el z17 real (última resolución disponible) y lo UPSCALEA para z18-22 →
      // se ve borroso al acercar mucho, pero nunca el placeholder. Las zonas
      // dibujadas son vectores (nítidas igual). Verificado en navegador 2026-07-19.
      satRef.current = L.tileLayer(SAT, { maxZoom: 22, maxNativeZoom: SAT_MAX_NATIVE, attribution: "Tiles © Esri, Maxar, Earthstar Geographics" }).addTo(map);
      streetRef.current = L.tileLayer(STREET, { maxZoom: 22, maxNativeZoom: 19, attribution: "© OpenStreetMap" });
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
      L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);
      map.on("mousemove", (e: { latlng: { lat: number; lng: number } }) => setCursor({ lat: e.latlng.lat, lng: e.latlng.lng }));
      // Los botones de las fichas viven en HTML que inserta Leaflet, fuera del
      // árbol de React: no hay onClick que ponerles. Se delega en el contenedor.
      containerRef.current?.addEventListener("click", (ev) => {
        const el = (ev.target as HTMLElement)?.closest?.("[data-quitar],[data-ficha],[data-despachar]") as HTMLElement | null;
        if (!el) return;
        ev.preventDefault();
        ev.stopPropagation();
        const quitar = el.getAttribute("data-quitar");
        if (quitar) { onQuitarRef.current?.(quitar); map.closePopup(); return; }
        if (el.hasAttribute("data-despachar") && zonaFichaAbiertaRef.current) {
          const zid = zonaFichaAbiertaRef.current;
          map.closePopup();
          onDespacharRef.current?.(zid);
          return;
        }
        if (el.hasAttribute("data-ficha") && zonaFichaAbiertaRef.current) {
          const z = zonasRef.current.find((x) => x.id === zonaFichaAbiertaRef.current);
          map.closePopup();
          if (z) onFichaRef.current(z);
        }
      });
      map.on("mouseout", () => setCursor(null));
      setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 200);
      setReady(true);
      renderPolys();
    });
    return () => { destroyed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (ready) renderPolys(); }, [zonas, ready, renderPolys]);
  // Re-pintar etiquetas cuando cambia el inventario ubicado (sin re-encuadrar).
  useEffect(() => { if (ready) renderPolys(false); }, [inventario, ready, renderPolys]);
  useEffect(() => { if (ready) renderPolys(false); }, [ubicados, posiciones, ready, renderPolys]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !satRef.current || !streetRef.current) return;
    if (layer === "sat") { map.removeLayer(streetRef.current); satRef.current.addTo(map); }
    else { map.removeLayer(satRef.current); streetRef.current.addTo(map); }
  }, [layer]);

  useEffect(() => {
    const map = mapRef.current;
    const t = map ? setTimeout(() => map.invalidateSize(), 220) : null;
    if (!fullscreen) return () => { if (t) clearTimeout(t); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending && !ficha) setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      if (t) clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, pending, ficha]);

  function startDraw() { vertsRef.current = []; setNVerts(0); setDrawArea(0); setDrawPerim(0); setMapMsg(null); drawingRef.current = true; setDrawing(true); redrawDrawing(); }
  function cancelDraw() { vertsRef.current = []; setNVerts(0); setDrawArea(0); setDrawPerim(0); drawingRef.current = false; setDrawing(false); if (drawRef.current) drawRef.current.clearLayers(); }
  function undo() { vertsRef.current = vertsRef.current.slice(0, -1); setNVerts(vertsRef.current.length); const m = drawMetrics(vertsRef.current); setDrawArea(m.area); setDrawPerim(m.perim); redrawDrawing(); }
  function finishDraw() { if (vertsRef.current.length < 3) return; setPending(vertsRef.current); }
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
        setEditArea(geodesicAreaM2(editVertsRef.current));
      });
    });
    setEditArea(geodesicAreaM2(verts));
  }
  function selectForEdit(z: { id: string; codigo: string; poligono?: string | null }) {
    const pts = parseCoords(z.poligono ?? null);
    if (!pts) return;
    setEditSel({ id: z.id, codigo: z.codigo }); setEditErr(null);
    editVertsRef.current = pts.map((x) => [x[0], x[1]] as [number, number]);
    renderEdit();
  }
  selectForEditRef.current = selectForEdit;
  function enterEdit() { if (drawingRef.current) cancelDraw(); editingRef.current = true; setEditing(true); }
  function exitEdit() {
    editingRef.current = false; setEditing(false); setEditSel(null); setEditErr(null); setSavingEdit(false);
    editVertsRef.current = [];
    if (editLayerRef.current) editLayerRef.current.clearLayers();
  }
  async function saveEdit() {
    if (!editSel || editVertsRef.current.length < 3) return;
    setSavingEdit(true); setEditErr(null);
    try {
      const c = centroid(editVertsRef.current);
      const r = await fetch("/api/admin/forestal/ctp/planta", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ id: editSel.id, codigo: editSel.codigo, tipo: zonasRef.current.find((z) => z.id === editSel.id)?.tipo ?? "otro", poligono: JSON.stringify(editVertsRef.current), lat: Number(c[0].toFixed(7)), lng: Number(c[1].toFixed(7)), areaM2: Math.round(geodesicAreaM2(editVertsRef.current)) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      exitEdit(); onChanged();
    } catch (e) { setEditErr(e instanceof Error ? e.message : String(e)); setSavingEdit(false); }
  }

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
    setMeasureArea(v.length >= 3 ? geodesicAreaM2(v) : 0);
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

  const flyTo = useCallback((id: string) => {
    const z = zonasRef.current.find((x) => x.id === id);
    const L = LRef.current, map = mapRef.current;
    if (!z || !L || !map) return;
    const pts = parseCoords(z.poligono ?? null);
    if (pts && pts.length) { try { map.flyToBounds(L.latLngBounds(pts), { maxZoom: 20, padding: [40, 40] }); } catch { /* noop */ } }
    else if (z.lat != null && z.lng != null) map.flyTo([z.lat, z.lng], 19);
  }, []);

  // Centrar cuando la barra lateral lo pide (chip «ir a la zona»).
  useEffect(() => { if (irA?.zonaId) flyTo(irA.zonaId); }, [irA, flyTo]);

  /**
   * Resaltar una zona: se cambia el ESTILO de su capa, no se vuelve a dibujar el
   * mapa. Redibujar en cada `mouseenter` de la lista hace parpadear las etiquetas
   * y pierde el tooltip abierto.
   */
  useEffect(() => {
    for (const [zid, capa] of polyByZonaRef.current) {
      const z = zonasRef.current.find((x) => x.id === zid);
      if (!z || !capa?.setStyle) continue;
      const meta = zonaTipoMeta(z.tipo);
      const on = zid === (sobreZona ?? zonaResaltada);
      // La zona bajo el puntero mientras se arrastra late; la resaltada por
      // hover sólo se marca. Son dos cosas distintas y se leen distinto.
      const el = capa.getElement?.();
      if (el) el.classList.toggle("ctp-zona-objetivo", zid === sobreZona);
      try {
        capa.setStyle(parseCoords(z.poligono ?? null)
          ? { color: on ? "#fff" : meta.ring, weight: on ? 4 : 2, fillOpacity: on ? 0.6 : 0.35, fillColor: meta.ring }
          : { color: on ? "#fff" : meta.ring, weight: on ? 5 : 3, fillOpacity: on ? 0.9 : 0.6, fillColor: meta.ring });
        if (on && capa.bringToFront) capa.bringToFront();
      } catch { /* capa ya removida */ }
    }
  }, [zonaResaltada, sobreZona, zonas]);

  /**
   * Soltar un ítem arrastrado: de las coordenadas del puntero al polígono que
   * lo contiene. Leaflet no dice «qué zona hay bajo este punto», así que se
   * convierte a lat/lng y se resuelve con `pointInPolygon` (el mismo del LO-TH).
   * Se recorre al REVÉS para que, con zonas superpuestas, gane la de arriba.
   */
  const zonaEnPunto = useCallback((clientX: number, clientY: number): string | null => {
    const map = mapRef.current;
    const cont = containerRef.current;
    if (!map || !cont) return null;
    const r = cont.getBoundingClientRect();
    const ll = map.containerPointToLatLng([clientX - r.left, clientY - r.top]);
    const p: [number, number] = [ll.lat, ll.lng];
    const zs = zonasRef.current;
    for (let i = zs.length - 1; i >= 0; i--) {
      const pts = parseCoords(zs[i].poligono ?? null);
      if (pts && pointInPolygon(p, pts)) return zs[i].id;
    }
    return null;
  }, []);

  const onDropItem = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(DND_ITEM)) return;
    e.preventDefault();
    setSobreZona(null);
    const zid = zonaEnPunto(e.clientX, e.clientY);
    if (zid) onSoltarRef.current?.(zid);
    else onAfueraRef.current?.();
  }, [zonaEnPunto]);

  const onDragOverItem = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(DND_ITEM)) return;
    e.preventDefault(); // sin esto el navegador rechaza el drop
    e.dataTransfer.dropEffect = "move";
    setSobreZona(zonaEnPunto(e.clientX, e.clientY));
  }, [zonaEnPunto]);
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
        map.flyTo([latitude, longitude], 18);
      },
      (err: { code: number }) => { setLocating(false); setMapMsg(err.code === 1 ? "Activá el permiso de ubicación en tu navegador para usar el GPS." : "No pude obtener tu ubicación."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  function toggleLabels() { const v = !showLabelsRef.current; showLabelsRef.current = v; setShowLabels(v); renderPolys(false); }
  function goToCoord(lat: number, lng: number) {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (locateMarkerRef.current) map.removeLayer(locateMarkerRef.current);
    locateMarkerRef.current = L.circleMarker([lat, lng], { radius: 7, color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 3 }).bindTooltip(`${lat.toFixed(6)}, ${lng.toFixed(6)}`, { direction: "top" }).addTo(map);
    map.flyTo([lat, lng], 20);
  }
  function exportGeoJSON() {
    const features = zonasRef.current.map((z) => {
      const pts = parseCoords(z.poligono ?? null);
      if (!pts) return null;
      const ring = [...pts.map(([lat, lng]) => [lng, lat]), [pts[0][1], pts[0][0]]];
      return { type: "Feature", properties: { codigo: z.codigo, nombre: z.nombre, tipo: z.tipo, areaM2: z.areaM2 }, geometry: { type: "Polygon", coordinates: [ring] } };
    }).filter(Boolean);
    if (!features.length) { setMapMsg("Dibujá al menos una zona para exportar."); return; }
    const fc = { type: "FeatureCollection", features };
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "planta-zonas.geojson"; a.click();
    URL.revokeObjectURL(url);
  }

  const conGeom = zonas.filter((z) => parseCoords(z.poligono ?? null) || (z.lat != null && z.lng != null));
  const hasZonas = conGeom.length > 0;
  // Sugerencia de código por tipo (PT-01, AS-01…) para la próxima zona.
  const suggestCodigo = (tipo: ZonaTipo) => {
    const pre = { entrada: "EN", patio_trozas: "PT", aserrado: "AS", secado: "SC", patio_producto: "PP", reserva: "RS", despacho: "DS", oficina: "OF", otro: "Z" }[tipo];
    const nums = zonas.map((z) => new RegExp(`^${pre}-?(\\d+)`, "i").exec(z.codigo)).filter(Boolean).map((m) => parseInt(m![1], 10));
    return `${pre}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
  };
  // Leyenda: solo los tipos presentes.
  const tiposPresentes = ZONA_TIPOS.filter((t) => zonas.some((z) => z.tipo === t.tipo));

  return (
    <div className={fullscreen ? "fixed inset-0 z-[45] flex flex-col gap-3 bg-[var(--surface-canvas)] p-3 sm:p-4" : "space-y-3"}>
      <div className="flex flex-wrap items-center gap-1.5">
        {drawing ? (
          <>
            <span className="inline-flex h-9 items-center rounded-xl bg-[var(--data-warning-50)] px-3 text-sm font-bold text-[var(--data-warning-700)]">Tocá el mapa para marcar la zona ({nVerts}){drawPerim > 0 ? ` · ${formatDist(drawPerim)}` : ""}{drawArea > 0 ? ` · ${fmtArea(drawArea)}` : ""}</span>
            <button type="button" onClick={addGpsPoint} disabled={locating} title="Agregar un vértice en mi ubicación GPS (caminar la planta)" className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50">{locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}<span className="hidden sm:inline">Punto GPS</span></button>
            <button type="button" onClick={undo} disabled={nVerts === 0} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Undo2 className="h-4 w-4" />Deshacer</button>
            <button type="button" onClick={finishDraw} disabled={nVerts < 3} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--data-success-600)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"><Check className="h-4 w-4" />Terminar ({nVerts})</button>
            <button type="button" onClick={cancelDraw} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Cancelar</button>
          </>
        ) : editing ? (
          editSel ? (
            <>
              <span className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--data-info-50)] px-3 text-sm font-bold text-[var(--data-info-700)]"><Edit3 className="h-4 w-4" />Moviendo {editSel.codigo} · {fmtArea(editArea)}</span>
              <button type="button" onClick={saveEdit} disabled={savingEdit} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--data-success-600)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">{savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Guardar</button>
              <button type="button" onClick={exitEdit} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Salir</button>
            </>
          ) : (
            <>
              <span className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--data-info-50)] px-3 text-sm font-bold text-[var(--data-info-700)]"><Edit3 className="h-4 w-4" />Tocá una zona para mover sus límites</span>
              <button type="button" onClick={exitEdit} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><X className="h-4 w-4" />Salir</button>
            </>
          )
        ) : measuring ? (
          <>
            <span className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-sm font-bold text-[var(--text-primary)]"><Route className="h-4 w-4 text-[var(--accent)]" />{measurePts < 2 ? "Tocá el mapa para medir" : formatDist(measureDist)}{measureArea > 0 ? ` · ${fmtArea(measureArea)}` : ""}</span>
            <button type="button" onClick={undoMeasure} disabled={measurePts === 0} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Undo2 className="h-4 w-4" />Deshacer</button>
            <button type="button" onClick={clearMeasure} disabled={measurePts === 0} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><X className="h-4 w-4" />Limpiar</button>
            <button type="button" onClick={exitMeasure} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Check className="h-4 w-4" />Listo</button>
          </>
        ) : (
          <>
            <button type="button" onClick={startDraw} disabled={!ready} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"><Pencil className="h-4 w-4" /><span className="hidden sm:inline">Dibujar zona</span></button>
            {hasZonas && <button type="button" onClick={enterEdit} disabled={!ready} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Edit3 className="h-4 w-4" /><span className="hidden sm:inline">Editar</span></button>}
            <button type="button" onClick={startMeasure} disabled={!ready} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Route className="h-4 w-4" /><span className="hidden sm:inline">Medir</span></button>
            <button type="button" onClick={() => setCoordModal(true)} disabled={!ready} title="Crear o ir a una zona por coordenadas GPS" className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Navigation className="h-4 w-4" /><span className="hidden lg:inline">Coordenadas</span></button>
          </>
        )}
        <span aria-hidden className="mx-0.5 hidden h-6 w-px shrink-0 bg-[var(--rule-base)] lg:block" />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {conGeom.length > 0 && (
            <select value="" onChange={(e) => { if (e.target.value) flyTo(e.target.value); }} title="Ir a una zona" className="h-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
              <option value="">Ir a zona…</option>
              {conGeom.map((z) => <option key={z.id} value={z.id}>{z.codigo}</option>)}
            </select>
          )}
          <button type="button" onClick={locate} disabled={locating} title="Centrar el mapa en mi ubicación (GPS)" className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50">{locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}<span className="hidden sm:inline">Mi ubicación</span></button>
          {hasZonas && <button type="button" onClick={toggleLabels} title="Mostrar los códigos sobre las zonas" className={`inline-flex h-9 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold hover:bg-[var(--surface-canvas)] ${showLabels ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)]"}`}><Tag className="h-4 w-4" /><span className="hidden sm:inline">Etiquetas</span></button>}
          {conGeom.some((z) => parseCoords(z.poligono ?? null)) && <button type="button" onClick={exportGeoJSON} title="Exportar las zonas como GeoJSON (SIG / plano de planta)" className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Download className="h-4 w-4" /><span className="hidden sm:inline">Exportar</span></button>}
          <button type="button" onClick={() => setLayer((l) => (l === "sat" ? "street" : "sat"))} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Layers className="h-4 w-4" />{layer === "sat" ? "Satélite" : "Calles"}</button>
          <button type="button" onClick={() => setFullscreen((v) => !v)} title={fullscreen ? "Salir de pantalla completa (Esc)" : "Ver el mapa a pantalla completa"} className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">{fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}<span className="hidden sm:inline">{fullscreen ? "Salir" : "Pantalla completa"}</span></button>
        </div>
      </div>

      <div className={fullscreen ? "relative flex-1 min-h-0" : "relative"}>
        <div
          ref={containerRef}
          onDragOver={onDragOverItem}
          onDragLeave={() => setSobreZona(null)}
          onDrop={onDropItem}
          style={{ height: fullscreen ? "100%" : 480, cursor: drawing || measuring ? "crosshair" : enMano ? "copy" : "" }}
          className="isolate w-full overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]"
        />
        {/* Realce de «hay algo en la mano». Va SUPERPUESTO y no sobre el div del
            mapa: Leaflet escribe sus propias clases ahí (un className de React
            que cambia se las lleva puestas) y, medido, una regla de `.leaflet-
            container` le gana incluso al `style` inline — el borde no cambiaba.
            Un hermano absoluto no discute con nadie. */}
        {enMano && (
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-inset ring-[var(--accent)]">
            <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white shadow-[var(--shadow-md)]">
              Tocá la zona donde está {enMano.label}
            </span>
          </div>
        )}
        {ready && !hasZonas && !drawing && !measuring && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-xs rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 text-center shadow-[var(--shadow-lg)]">
              <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><Pencil className="h-6 w-6" /></span>
              <p className="text-sm font-bold text-[var(--text-primary)]">Dibujá la primera zona de tu aserradero</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Tocá “Dibujar zona”, marcá el contorno del patio de trozas, la sierra o el despacho, y asignale su tipo. Aparecerá coloreada en el mapa.</p>
              <button type="button" onClick={startDraw} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90"><Pencil className="h-4 w-4" /><span className="hidden sm:inline">Dibujar zona</span></button>
            </div>
          </div>
        )}
        {ready && tiposPresentes.length > 0 && (
          <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-md)]">
            <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Tipo de zona</p>
            <div className="space-y-0.5">
              {tiposPresentes.map((t) => <span key={t.tipo} className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.ring }} />{t.label}</span>)}
            </div>
          </div>
        )}
        {cursor && <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 font-mono text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">{Number(cursor.lat).toFixed(5)}, {Number(cursor.lng).toFixed(5)}</div>}
        {/* Aviso de zoom digital: el satélite no tiene más detalle a este zoom en
            zonas remotas — la imagen se ve borrosa (upscale), NO está rota. */}
        {ready && layer === "sat" && zoom > SAT_MAX_NATIVE && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--data-warning-500)]/40 bg-[var(--surface-raised)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] shadow-[var(--shadow-md)]">
            <Layers className="h-3.5 w-3.5 text-[var(--data-warning-600,var(--data-warning-500))]" />
            Zoom digital · máximo detalle satelital
          </div>
        )}
      </div>
      {editErr && <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2 text-xs font-bold text-[var(--data-error-700)]">{editErr}</p>}
      {mapMsg && <p className="flex items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-xs font-bold text-[var(--data-warning-700)]">{mapMsg}<button type="button" onClick={() => setMapMsg(null)} className="shrink-0 text-[var(--data-warning-700)]"><X className="h-4 w-4" /></button></p>}
      {!fullscreen && !editing && !measuring && <p className="text-xs text-[var(--text-tertiary)]"><MapPin className="mr-1 inline h-3 w-3" />Tocá una zona para ver/editar su ficha. Dibujá el contorno con al menos 3 puntos.</p>}

      {/* Estilos de las chapitas del mapa. Van acá y no en el módulo de iconos
          porque Leaflet inserta ese HTML fuera del árbol de React: un CSS module
          o un `style` de componente no lo alcanzaría. */}
      <style jsx global>{MARCA_CSS}</style>

      {pending && <AsignarZonaModal poligono={pending} suggest={suggestCodigo} onClose={() => setPending(null)} onSaved={() => { setPending(null); cancelDraw(); onChanged(); }} />}
      {coordModal && <CoordenadasModal onClose={() => setCoordModal(false)} onCreate={(pts) => { setCoordModal(false); setPending(pts); }} onGoTo={(lat, lng) => { setCoordModal(false); goToCoord(lat, lng); }} />}
      {ficha && <ZonaFichaModal zona={ficha} onClose={() => setFicha(null)} onSaved={() => { setFicha(null); onChanged(); }} onDeleted={() => { setFicha(null); onChanged(); }} />}
    </div>
  );
}

function CoordenadasModal({ onClose, onCreate, onGoTo }: { onClose: () => void; onCreate: (pts: [number, number][]) => void; onGoTo: (lat: number, lng: number) => void }) {
  const [text, setText] = useState("");
  const [goLat, setGoLat] = useState("");
  const [goLng, setGoLng] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pts = parseCoordText(text);
  const area = pts.length >= 3 ? geodesicAreaM2(pts) : 0;
  function crear() { if (pts.length < 3) { setError("Necesitás al menos 3 coordenadas válidas (una «lat, lng» por línea)."); return; } onCreate(pts); }
  function ir() {
    const lat = parseFloat(goLat), lng = parseFloat(goLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError("Coordenada inválida."); return; }
    onGoTo(lat, lng);
  }
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="wide"
      icon={Navigation}
      title="Mapeo por coordenadas"
      description="Creá una zona desde tu levantamiento GPS o andá a una coordenada exacta."
      footer={
        <ModalFooter error={error} nota={`${pts.length} punto(s) válido(s)${area > 0 ? ` · ${fmtArea(area)}` : ""}`}>
          <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
          <Btn variant="primary" onClick={crear} disabled={pts.length < 3}>
            <Check className="h-4 w-4" />
            Crear la zona
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-5">
        <div>
          <p className="mb-1 text-sm font-bold text-[var(--text-primary)]">Crear zona por coordenadas</p>
          <p className="mb-2 text-xs text-[var(--text-tertiary)]">Pegá los vértices, una coordenada por línea: <span className="font-mono">latitud, longitud</span>. Se cierra el polígono solo.</p>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); }} rows={6} placeholder={"-8.38200, -74.53100\n-8.38150, -74.52950\n-8.38300, -74.52980"} className={`${I} h-auto py-2 font-mono`} />
        </div>
        <div className="border-t border-[var(--rule-base)] pt-4">
          <p className="mb-2 text-sm font-bold text-[var(--text-primary)]">Ir a una coordenada</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Latitud">
              <input value={goLat} onChange={(e) => setGoLat(e.target.value)} placeholder="-8.3820" className={`${I} w-36 font-mono`} />
            </Field>
            <Field label="Longitud">
              <input value={goLng} onChange={(e) => setGoLng(e.target.value)} placeholder="-74.5310" className={`${I} w-36 font-mono`} />
            </Field>
            <Btn variant="secondary" onClick={ir}><Navigation className="h-4 w-4" />Ir</Btn>
          </div>
        </div>
      </ModalBody>
    </AdminModal>
  );
}

function AsignarZonaModal({ poligono, suggest, onClose, onSaved }: { poligono: [number, number][]; suggest: (t: ZonaTipo) => string; onClose: () => void; onSaved: () => void }) {
  const areaCalc = geodesicAreaM2(poligono);
  let perimCalc = 0;
  for (let i = 0; i < poligono.length; i++) perimCalc += haversineM(poligono[i], poligono[(i + 1) % poligono.length]);
  const [tipo, setTipo] = useState<ZonaTipo>("patio_trozas");
  const [f, setF] = useState({ codigo: suggest("patio_trozas"), nombre: "", notas: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = centroid(poligono);
  const valido = f.codigo.trim().length >= 1;

  function onTipo(t: ZonaTipo) { setTipo(t); setF((s) => ({ ...s, codigo: s.codigo && !/^[A-Za-z]{1,2}-\d/.test(s.codigo) ? s.codigo : suggest(t) })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !valido) { if (!valido) setError("El código es obligatorio (ej. PT-01)."); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        codigo: f.codigo.trim(), nombre: f.nombre.trim() || null, tipo, notas: f.notas.trim() || null,
        poligono: JSON.stringify(poligono), lat: Number(c[0].toFixed(7)), lng: Number(c[1].toFixed(7)), areaM2: Math.round(areaCalc),
      };
      const r = await fetch("/api/admin/forestal/ctp/planta", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="default"
      icon={Pencil}
      title="Nueva zona de la planta"
      description={`${poligono.length} puntos · ${fmtArea(areaCalc)} · ${formatDist(perimCalc)} de perímetro`}
      footer={
        <ModalFooter error={error}>
          <Btn variant="ghost" onClick={onClose}><X className="h-4 w-4" />Cancelar</Btn>
          {/* El submit vive fuera del <form>: `form=` lo vuelve a atar. */}
          <Btn variant="primary" type="submit" form="planta-zona-nueva" disabled={!valido || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar zona
          </Btn>
        </ModalFooter>
      }
    >
      <form id="planta-zona-nueva" onSubmit={submit} className={`space-y-4 ${MODAL_BODY}`}>
        <div>
          <p className="mb-1.5 text-sm font-bold text-[var(--text-primary)]">Tipo de zona *</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ZONA_TIPOS.map((t) => (
              <button key={t.tipo} type="button" onClick={() => onTipo(t.tipo)} className={`flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left text-xs font-bold transition ${tipo === t.tipo ? "border-[var(--accent)] bg-primary/10 text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"}`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.ring }} />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <CampoGrid>
          <Field label="Código" required span={6}>
            <input value={f.codigo} onChange={(e) => setF((s) => ({ ...s, codigo: e.target.value }))} placeholder="PT-01" className={`${I} font-mono uppercase`} autoFocus />
          </Field>
          <Field label="Nombre" span={6}>
            <input value={f.nombre} onChange={(e) => setF((s) => ({ ...s, nombre: e.target.value }))} placeholder="Patio principal" className={I} />
          </Field>
          <Field label="Notas" span={12}>
            <textarea value={f.notas} onChange={(e) => setF((s) => ({ ...s, notas: e.target.value }))} rows={2} placeholder="Capacidad, referencia, qué se guarda acá…" className={`${I} h-auto py-2`} />
          </Field>
        </CampoGrid>
      </form>
    </AdminModal>
  );
}

function ZonaFichaModal({ zona, onClose, onSaved, onDeleted }: { zona: PlantaZona; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const [tipo, setTipo] = useState<ZonaTipo>(zona.tipo);
  const [f, setF] = useState({ codigo: zona.codigo, nombre: zona.nombre ?? "", notas: zona.notas ?? "" });
  const [submitting, setSubmitting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = zonaTipoMeta(tipo);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !f.codigo.trim()) { if (!f.codigo.trim()) setError("El código es obligatorio."); return; }
    setSubmitting(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp/planta", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ id: zona.id, codigo: f.codigo.trim(), nombre: f.nombre.trim() || null, tipo, notas: f.notas.trim() || null, poligono: zona.poligono, lat: zona.lat, lng: zona.lng, areaM2: zona.areaM2 }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); }
  }
  async function del() {
    setSubmitting(true); setError(null);
    try {
      const r = await fetch(`/api/admin/forestal/ctp/planta?id=${encodeURIComponent(zona.id)}`, { method: "DELETE", headers: csrfHeaders(), credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      onDeleted();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSubmitting(false); setConfirmDel(false); }
  }
  return (
    <AdminModal
      open
      onClose={onClose}
      variant="default"
      icon={MapPin}
      title={`Zona ${zona.codigo}`}
      description={`${meta.label}${zona.areaM2 != null ? ` · ${fmtArea(zona.areaM2)}` : ""}`}
      footer={
        <ModalFooter error={error}>
          {/* Borrar queda a la izquierda, separado de guardar: son opuestos y
              pegados uno al lado del otro se aprieta el que no era. */}
          <span className="mr-auto">
            {!confirmDel ? (
              <Btn variant="danger" onClick={() => setConfirmDel(true)}><Trash2 className="h-4 w-4" />Borrar zona</Btn>
            ) : (
              <Btn variant="danger" onClick={() => void del()} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Confirmar borrar
              </Btn>
            )}
          </span>
          <Btn variant="ghost" onClick={onClose}><X className="h-4 w-4" />Cerrar</Btn>
          <Btn variant="primary" type="submit" form="planta-zona-ficha" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Guardar
          </Btn>
        </ModalFooter>
      }
    >
      <form id="planta-zona-ficha" onSubmit={save} className={`space-y-4 ${MODAL_BODY}`}>
        <div>
          <p className="mb-1.5 text-sm font-bold text-[var(--text-primary)]">Tipo de zona</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ZONA_TIPOS.map((t) => (
              <button key={t.tipo} type="button" onClick={() => setTipo(t.tipo)} className={`flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left text-xs font-bold transition ${tipo === t.tipo ? "border-[var(--accent)] bg-primary/10 text-[var(--text-[var(--accent-ink)] dark:text-[var(--accent)])]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"}`}>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.ring }} />
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <CampoGrid>
          <Field label="Código" required span={6}>
            <input value={f.codigo} onChange={(e) => setF((s) => ({ ...s, codigo: e.target.value }))} className={`${I} font-mono uppercase`} />
          </Field>
          <Field label="Nombre" span={6}>
            <input value={f.nombre} onChange={(e) => setF((s) => ({ ...s, nombre: e.target.value }))} className={I} />
          </Field>
          <Field label="Notas" span={12}>
            <textarea value={f.notas} onChange={(e) => setF((s) => ({ ...s, notas: e.target.value }))} rows={2} className={`${I} h-auto py-2`} />
          </Field>
        </CampoGrid>
      </form>
    </AdminModal>
  );
}
