"use client";

/**
 * useCroquisLeaflet — el mapa del CROQUIS del aserradero (ADR-465): Leaflet con
 * `L.CRS.Simple`, donde una unidad es un METRO y un punto es `[y, x]` desde la
 * esquina inferior izquierda del terreno. Sobre la imagen del plano dibuja las
 * zonas (color de su tipo), lo que hay parado en cada una —la pila entera o la
 * troza separada—, las máquinas D1–D7 y, si se pide, el flujo del plano.
 *
 * Los handlers de Leaflet se registran una vez y viven fuera de React: leen
 * todo por `optsRef`, o se quedarían con el primer valor para siempre.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { pointInPolygon } from "@/lib/forestal/loth-geo";
import { marcasDeZona } from "@/lib/forestal/planta-marcadores";
import { etiquetaCorta, marcaHtml, marcaSobranteHtml } from "@/lib/forestal/planta-iconos";
import {
  centroidePlano, codigoCorto, codigoTroza, fmtMedidaCorta, flujoAplica, coincide, parsearPoligono, posicionMaquina, puntaDeFlecha,
  resumirZonaCroquis, soltarMaquina, zonaCoincide, FLUJO_PLANO_V8, FRANJA_FUERA_M,
  type ContenidoZona, type FiltrosCroquis, type Punto,
} from "@/lib/forestal/planta-croquis";
import { etiquetaZonaHtml, maquinaHtml, rotuloHtml, trozaSueltaHtml } from "@/lib/forestal/planta-croquis-html";
import { zonaTipoMeta, type MaquinaPlanta, type PlantaCroquis, type PlantaZona } from "@/lib/forestal/planta-zona-types";

export interface MarcaCroquis { tipo: "pila" | "troza"; id: string; zonaId: string }
export type SeleccionCroquis = { tipo: "zona" | "pila" | "troza" | "maquina"; id: string };

export interface CroquisLeafletOpts {
  croquis: PlantaCroquis;
  zonas: PlantaZona[];
  contenido: Record<string, ContenidoZona>;
  filtros: FiltrosCroquis;
  mostrarFlujo: boolean;
  mostrarEtiquetas: boolean;
  seleccion: SeleccionCroquis | null;
  resaltada: string | null;
  recien: string | null;
  /** Mientras se dibuja, tocar una zona agrega un vértice (no abre su ficha). */
  dibujando: boolean;
  onTocarZona: (zonaId: string, p: Punto) => void;
  onTocarMarca: (m: MarcaCroquis) => void;
  onTocarMaquina: (codigo: string) => void;
  onMoverMarca: (m: MarcaCroquis, zonaId: string, p: Punto) => void;
  onMarcaAfuera: () => void;
  onMoverMaquina: (m: MaquinaPlanta) => void;
  onTocarFondo: (p: Punto) => void;
}

const COLOR_FLUJO = "var(--data-warning-500)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- instancias Leaflet (import dinámico)
type Any = any;

/** `refs` los comparte con `useCroquisDibujo`, que dibuja sobre el mismo mapa. */
export function useCroquisLeaflet(containerRef: RefObject<HTMLDivElement | null>, refs: { LRef: RefObject<Any>; mapRef: RefObject<Any> }, o: CroquisLeafletOpts) {
  const { LRef, mapRef } = refs;
  const capas = useRef<Record<"fondo" | "zonas" | "marcas" | "maq" | "flujo", Any>>({ fondo: null, zonas: null, marcas: null, maq: null, flujo: null });
  const [ready, setReady] = useState(false);
  const optsRef = useRef(o);
  optsRef.current = o;

  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { crs: L.CRS.Simple, minZoom: -1, maxZoom: 6, zoomSnap: 0.25, zoomDelta: 0.5, attributionControl: false });
      mapRef.current = map;
      // La imagen va DEBAJO de las zonas (pane propio) y el flujo entre las
      // zonas y las marcas, sin robarles clics.
      map.createPane("ctpFondo").style.zIndex = "300";
      const pf = map.createPane("ctpFlujo");
      pf.style.zIndex = "450"; pf.style.pointerEvents = "none";
      capas.current = {
        fondo: L.layerGroup().addTo(map), zonas: L.layerGroup().addTo(map), flujo: L.layerGroup().addTo(map),
        marcas: L.layerGroup().addTo(map), maq: L.layerGroup().addTo(map),
      };
      L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => optsRef.current.onTocarFondo([e.latlng.lat, e.latlng.lng]));
      // De lejos (< 16 px por metro) las cantidades de las pilas se pisan entre
      // sí: se esconden y vuelven al acercar. Va por data-*, no por clase.
      const lejos = () => { if (containerRef.current) containerRef.current.dataset.lejos = map.getZoom() < 4 ? "1" : "0"; };
      map.on("zoomend", lejos);
      lejos();
      setTimeout(() => { if (!destroyed) map.invalidateSize(); }, 200);
      setReady(true);
    });
    return () => { destroyed = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [containerRef, LRef, mapRef]);

  const { anchoM, altoM, imagenUrl, maquinas } = o.croquis;
  const hayFuera = maquinas.some((m) => m.fuera);

  const encuadrar = useCallback(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    const { anchoM: an, altoM: al, maquinas: mq } = optsRef.current.croquis;
    const extra = mq.some((m) => m.fuera) ? FRANJA_FUERA_M : 0;
    map.fitBounds([[0, 0], [al, an + extra]], { padding: [10, 10] });
  }, [LRef, mapRef]);

  // Si la caja cambia de ancho (girar el celular, abrir el menú lateral), el
  // plano se vuelve a encuadrar: si no, queda un pedazo y nadie sabe por qué.
  useEffect(() => {
    const el = containerRef.current;
    if (!ready || !el || typeof ResizeObserver === "undefined") return;
    let ancho = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - ancho) < 8) return;
      ancho = el.clientWidth;
      mapRef.current?.invalidateSize();
      encuadrar();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, containerRef, mapRef, encuadrar]);

  // Encuadre y límites: el terreno entero a la vista, sin poder perderlo.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setMaxBounds([[-altoM * 0.4, -anchoM * 0.4], [altoM * 1.4, anchoM + FRANJA_FUERA_M + anchoM * 0.4]]);
    encuadrar();
  }, [ready, anchoM, altoM, encuadrar, mapRef]);

  // Fondo: la imagen del plano (o una cuadrícula de 5 m si no hay), el borde del
  // terreno y la franja de las máquinas que están en otro almacén.
  useEffect(() => {
    const L = LRef.current, g = capas.current.fondo;
    if (!ready || !L || !g) return;
    g.clearLayers();
    const b: [Punto, Punto] = [[0, 0], [altoM, anchoM]];
    if (imagenUrl) L.imageOverlay(imagenUrl, b, { pane: "ctpFondo", className: "ctp-croquis-img", interactive: false }).addTo(g);
    else {
      for (let x = 5; x < anchoM; x += 5) L.polyline([[0, x], [altoM, x]], { pane: "ctpFondo", color: "var(--rule-base)", weight: 1, interactive: false }).addTo(g);
      for (let y = 5; y < altoM; y += 5) L.polyline([[y, 0], [y, anchoM]], { pane: "ctpFondo", color: "var(--rule-base)", weight: 1, interactive: false }).addTo(g);
    }
    L.rectangle(b, { pane: "ctpFondo", color: "var(--text-tertiary)", weight: 1.5, dashArray: "6 4", fill: false, interactive: false }).addTo(g);
    if (hayFuera) {
      L.rectangle([[0, anchoM + 0.6], [altoM, anchoM + FRANJA_FUERA_M]], { pane: "ctpFondo", color: "var(--rule-strong)", weight: 1, dashArray: "3 4", fillColor: "var(--surface-sunken)", fillOpacity: 0.7, interactive: false }).addTo(g);
      L.marker([altoM - 1.2, anchoM + 0.3 + FRANJA_FUERA_M / 2], { interactive: false, icon: L.divIcon({ className: "", html: rotuloHtml("Fuera"), iconSize: [0, 0] }) }).addTo(g);
    }
  }, [ready, imagenUrl, anchoM, altoM, hayFuera, LRef]);

  // Zonas y lo que hay parado en ellas.
  const { zonas, contenido, filtros, mostrarEtiquetas, seleccion, resaltada, recien } = o;
  useEffect(() => {
    const L = LRef.current, gz = capas.current.zonas, gm = capas.current.marcas;
    if (!ready || !L || !gz || !gm) return;
    gz.clearLayers(); gm.clearLayers();
    const zonasConPol = zonas.map((z) => ({ z, pts: parsearPoligono(z.poligono) })).filter((x): x is { z: PlantaZona; pts: Punto[] } => !!x.pts);
    const zonaEn = (p: Punto) => { for (let i = zonasConPol.length - 1; i >= 0; i--) if (pointInPolygon(p, zonasConPol[i].pts)) return zonasConPol[i].z.id; return null; };
    for (const { z, pts } of zonasConPol) {
      const meta = zonaTipoMeta(z.tipo);
      const c = contenido[z.id];
      const ok = zonaCoincide(c, filtros);
      const marcada = (seleccion?.tipo === "zona" && seleccion.id === z.id) || resaltada === z.id;
      const poly = L.polygon(pts, { color: marcada ? "var(--text-primary)" : meta.ring, weight: marcada ? 3.5 : 2, fillColor: meta.ring, fillOpacity: ok ? (marcada ? 0.45 : 0.26) : 0.05, opacity: ok ? 1 : 0.35 });
      poly.bindTooltip(`${z.codigo} · ${meta.label}`, { sticky: true });
      poly.on("click", (e: { latlng: { lat: number; lng: number } }) => { if (!optsRef.current.dibujando) optsRef.current.onTocarZona(z.id, [e.latlng.lat, e.latlng.lng]); });
      poly.addTo(gz);

      const pilas = (c?.pilas ?? []).filter((p) => !p.vacia);
      const lista = [
        ...pilas.map((p) => ({ m: { tipo: "pila" as const, id: p.item.id, zonaId: z.id }, pos: p.pos, ok: coincide(p.item, filtros), html: marcaHtml({ kind: p.item.kind, texto: etiquetaCorta(p.item.label), cantidad: fmtMedidaCorta(p.medida) ?? undefined, color: meta.ring, cites: p.item.cites, entrando: recien === p.item.id }), size: [26, 26] as [number, number] })),
        ...(c?.sueltas ?? []).map((s) => ({ m: { tipo: "troza" as const, id: s.troza.id, zonaId: z.id }, pos: s.pos, ok: coincide(s.pila, filtros), html: trozaSueltaHtml({ codigo: codigoCorto(codigoTroza(s.troza)), color: meta.ring, seleccionada: seleccion?.tipo === "troza" && seleccion.id === s.troza.id }), size: [44, 20] as [number, number] })),
      ];
      // El punto guardado vale si sigue adentro del polígono (alguien pudo
      // redibujar la zona); los demás se reparten solos.
      const fijas = lista.filter((x) => x.pos && pointInPolygon(x.pos, pts));
      const { marcas: rep, sobran } = marcasDeZona(pts, centroidePlano(pts), lista.filter((x) => !fijas.includes(x)));
      const todas = [...fijas.map((x) => ({ item: x, pos: x.pos as Punto })), ...rep];
      for (const { item: x, pos } of todas) {
        const sel = (seleccion?.tipo === x.m.tipo && seleccion.id === x.m.id);
        const mk = L.marker(pos, {
          draggable: true, zIndexOffset: 400,
          icon: L.divIcon({ className: `${x.ok ? "" : "ctp-croquis-atenuado"}${sel && x.m.tipo === "pila" ? " ctp-croquis-sel" : ""}`, html: x.html, iconSize: x.size, iconAnchor: [x.size[0] / 2, x.size[1] / 2] }),
        });
        mk.on("click", () => { if (!optsRef.current.dibujando) optsRef.current.onTocarMarca(x.m); });
        mk.on("dragend", () => {
          const ll = mk.getLatLng();
          const p: Punto = [ll.lat, ll.lng];
          const destino = zonaEn(p);
          if (destino) optsRef.current.onMoverMarca(x.m, destino, p);
          else { mk.setLatLng(pos); optsRef.current.onMarcaAfuera(); }
        });
        mk.addTo(gm);
      }
      if (sobran > 0 && todas.length) {
        L.marker(todas[todas.length - 1].pos, { interactive: false, zIndexOffset: 401, icon: L.divIcon({ className: "", html: marcaSobranteHtml(sobran, meta.ring), iconSize: [0, 0] }) }).addTo(gm);
      }
      if (mostrarEtiquetas) {
        const r = resumirZonaCroquis(c);
        const dato = fmtMedidaCorta({ pt: r.pt || null, m3: r.m3 || null, piezas: r.piezas || null });
        const cen = centroidePlano(pts);
        // Con madera adentro, la etiqueta sube un poco sobre el borde: en el
        // centro tapaba las pilas y en el borde justo, la primera fila.
        const ancla: Punto = todas.length ? [Math.max(...pts.map((p) => p[0])) + 0.8, cen[1]] : cen;
        L.marker(ancla, { interactive: false, icon: L.divIcon({ className: "", html: etiquetaZonaHtml({ codigo: z.codigo, color: meta.ring, dato, atenuada: !ok }), iconSize: [0, 0] }) }).addTo(gz);
      }
    }
  }, [ready, zonas, contenido, filtros, mostrarEtiquetas, seleccion, resaltada, recien, LRef]);

  // Máquinas: arrastrables; soltarlas fuera del terreno las marca «fuera».
  useEffect(() => {
    const L = LRef.current, g = capas.current.maq;
    if (!ready || !L || !g) return;
    g.clearLayers();
    const c = optsRef.current.croquis;
    let iFuera = 0;
    for (const m of maquinas) {
      const pos = posicionMaquina(m, m.fuera ? iFuera++ : 0, c);
      const sel = seleccion?.tipo === "maquina" && seleccion.id === m.codigo;
      const mk = L.marker(pos, { draggable: true, zIndexOffset: 600, icon: L.divIcon({ className: "", html: maquinaHtml({ codigo: m.codigo, fuera: m.fuera, seleccionada: sel }), iconSize: [30, 22], iconAnchor: [15, 11] }) });
      mk.bindTooltip(`${m.codigo} · ${m.nombre}${m.fuera ? " · fuera de la planta" : ""}`, { direction: "top", offset: [0, -10] });
      mk.on("click", () => optsRef.current.onTocarMaquina(m.codigo));
      mk.on("dragend", () => { const ll = mk.getLatLng(); optsRef.current.onMoverMaquina(soltarMaquina(m, [ll.lat, ll.lng], optsRef.current.croquis)); });
      mk.addTo(g);
    }
  }, [ready, maquinas, seleccion, anchoM, altoM, LRef]);

  // Flujo de producción: el DIBUJO del plano, no datos del Libro.
  const { mostrarFlujo } = o;
  useEffect(() => {
    const L = LRef.current, g = capas.current.flujo;
    if (!ready || !L || !g) return;
    g.clearLayers();
    if (!mostrarFlujo || !flujoAplica({ anchoM, altoM })) return;
    for (const f of FLUJO_PLANO_V8) {
      L.polyline([f.de, f.a], { pane: "ctpFlujo", color: COLOR_FLUJO, weight: 3.5, className: "ctp-flujo", interactive: false }).addTo(g);
      L.polygon(puntaDeFlecha(f.de, f.a), { pane: "ctpFlujo", color: COLOR_FLUJO, fillColor: COLOR_FLUJO, fillOpacity: 1, weight: 1, interactive: false }).addTo(g);
    }
  }, [ready, mostrarFlujo, anchoM, altoM, LRef]);

  /** De un punto de pantalla (soltar algo arrastrado) a la zona del croquis que lo contiene. */
  const zonaEnPunto = useCallback((clientX: number, clientY: number): { zonaId: string; p: Punto } | null => {
    const map = mapRef.current, cont = containerRef.current;
    if (!map || !cont) return null;
    const r = cont.getBoundingClientRect();
    const ll = map.containerPointToLatLng([clientX - r.left, clientY - r.top]);
    const p: Punto = [ll.lat, ll.lng];
    const zs = optsRef.current.zonas;
    for (let i = zs.length - 1; i >= 0; i--) {
      const pts = parsearPoligono(zs[i].poligono);
      if (pts && pointInPolygon(p, pts)) return { zonaId: zs[i].id, p };
    }
    return null;
  }, [containerRef, mapRef]);

  const irAZona = useCallback((zonaId: string) => {
    const L = LRef.current, map = mapRef.current;
    const z = optsRef.current.zonas.find((x) => x.id === zonaId);
    const pts = parsearPoligono(z?.poligono);
    if (!L || !map || !pts) return;
    try { map.flyToBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 5 }); } catch { /* capa ya removida */ }
  }, [LRef, mapRef]);

  const invalidar = useCallback(() => { mapRef.current?.invalidateSize(); }, [mapRef]);

  return { ready, zonaEnPunto, irAZona, encuadrar, invalidar };
}
