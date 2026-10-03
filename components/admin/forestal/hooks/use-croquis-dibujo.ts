"use client";

/**
 * useCroquisDibujo — dibujar y editar zonas sobre el croquis, en METROS.
 *
 * El mismo gesto que el satélite (tocar punto a punto, deshacer, terminar;
 * mover los vértices de una zona) pero con geometría plana: cada punto se
 * ajusta al terreno y a 10 cm, y el área sale de la fórmula del cordón — en un
 * plano de 54 × 48 m la geodésica no tiene nada que decir.
 */

import { useCallback, useRef, useState, type RefObject } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatNumber } from "@/lib/format";
import { ajustarAlTerreno, areaPlanaM2, centroidePlano, parsearPoligono, perimetroPlanoM, type Punto } from "@/lib/forestal/planta-croquis";
import type { PlantaCroquis, PlantaZona } from "@/lib/forestal/planta-zona-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- instancias Leaflet (import dinámico)
type Any = any;

const COLOR_DIBUJO = "var(--data-warning-500)";
const COLOR_EDICION = "var(--data-info-500)";

export type ModoCroquis = "ver" | "dibujar" | "editar";

export function useCroquisDibujo(opts: {
  LRef: RefObject<Any>;
  mapRef: RefObject<Any>;
  croquis: PlantaCroquis;
  zonas: PlantaZona[];
  onChanged: () => void;
}) {
  const { LRef, mapRef, croquis, zonas, onChanged } = opts;
  const [modo, setModo] = useState<ModoCroquis>("ver");
  const [nVerts, setNVerts] = useState(0);
  const [area, setArea] = useState(0);
  const [perim, setPerim] = useState(0);
  const [pendiente, setPendiente] = useState<Punto[] | null>(null);
  const [editSel, setEditSel] = useState<{ id: string; codigo: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const vertsRef = useRef<Punto[]>([]);
  const capaRef = useRef<Any>(null);

  const capa = useCallback(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return null;
    if (!capaRef.current) capaRef.current = L.layerGroup().addTo(map);
    return capaRef.current;
  }, [LRef, mapRef]);

  const medir = useCallback((v: Punto[]) => {
    setNVerts(v.length); setArea(areaPlanaM2(v)); setPerim(perimetroPlanoM(v, false));
  }, []);

  const pintarTrazo = useCallback(() => {
    const L = LRef.current, g = capa();
    if (!L || !g) return;
    g.clearLayers();
    const v = vertsRef.current;
    if (v.length >= 2) L.polygon(v, { color: COLOR_DIBUJO, weight: 2, dashArray: "5,5", fillColor: COLOR_DIBUJO, fillOpacity: 0.15, interactive: false }).addTo(g);
    v.forEach((p, i) => L.circleMarker(p, { radius: 5, color: COLOR_DIBUJO, fillColor: "var(--surface-raised)", fillOpacity: 1, weight: 2 }).bindTooltip(String(i + 1)).addTo(g));
  }, [LRef, capa]);

  const limpiar = useCallback(() => {
    vertsRef.current = []; medir([]);
    capaRef.current?.clearLayers();
  }, [medir]);

  const iniciar = useCallback(() => { limpiar(); setEditSel(null); setModo("dibujar"); }, [limpiar]);
  const cancelar = useCallback(() => { limpiar(); setEditSel(null); setErrorEdicion(null); setGuardando(false); setModo("ver"); }, [limpiar]);

  /** Toque en el mapa mientras se dibuja: un vértice más, adentro del terreno. */
  const agregarPunto = useCallback((p: Punto) => {
    if (modo !== "dibujar") return;
    vertsRef.current = [...vertsRef.current, ajustarAlTerreno(p, croquis)];
    medir(vertsRef.current); pintarTrazo();
  }, [modo, croquis, medir, pintarTrazo]);

  const deshacer = useCallback(() => { vertsRef.current = vertsRef.current.slice(0, -1); medir(vertsRef.current); pintarTrazo(); }, [medir, pintarTrazo]);
  const terminar = useCallback(() => { if (vertsRef.current.length >= 3) setPendiente([...vertsRef.current]); }, []);
  /** La zona se guardó (o se canceló el modal): se limpia el trazo y se vuelve a mirar. */
  const cerrarPendiente = useCallback((guardada: boolean) => { setPendiente(null); if (guardada) { cancelar(); onChanged(); } }, [cancelar, onChanged]);

  const iniciarEdicion = useCallback(() => { limpiar(); setModo("editar"); }, [limpiar]);

  /** Elegir la zona a la que se le mueven los límites: un tirador por vértice. */
  const editarZona = useCallback((zonaId: string) => {
    // Tocar adentro de la zona que ya se está moviendo (errarle al tirador por
    // unos px) no la recarga: volvía a los vértices guardados y se perdía lo
    // arrastrado. Para empezar de nuevo está «Salir».
    if (editSel?.id === zonaId) return;
    const L = LRef.current, g = capa();
    const z = zonas.find((x) => x.id === zonaId);
    const pts = parsearPoligono(z?.poligono);
    if (!L || !g || !z || !pts) return;
    setEditSel({ id: z.id, codigo: z.codigo }); setErrorEdicion(null);
    vertsRef.current = pts.map((p) => [p[0], p[1]] as Punto);
    g.clearLayers();
    const poly = L.polygon(vertsRef.current, { color: COLOR_EDICION, weight: 2, dashArray: "4,4", fillColor: COLOR_EDICION, fillOpacity: 0.2, interactive: false }).addTo(g);
    const tirador = L.divIcon({ className: "", html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${COLOR_EDICION};border:2px solid var(--surface-raised);box-shadow:var(--shadow-sm)"></span>`, iconSize: [14, 14], iconAnchor: [7, 7] });
    vertsRef.current.forEach((pt, i) => {
      const mk = L.marker(pt, { draggable: true, icon: tirador, zIndexOffset: 800 }).addTo(g);
      mk.on("drag", () => {
        const ll = mk.getLatLng();
        vertsRef.current[i] = [ll.lat, ll.lng];
        poly.setLatLngs(vertsRef.current);
        setArea(areaPlanaM2(vertsRef.current));
      });
      mk.on("dragend", () => {
        const fix = ajustarAlTerreno(vertsRef.current[i], croquis);
        vertsRef.current[i] = fix; mk.setLatLng(fix); poly.setLatLngs(vertsRef.current);
        setArea(areaPlanaM2(vertsRef.current));
      });
    });
    setArea(areaPlanaM2(vertsRef.current));
  }, [LRef, capa, zonas, croquis, editSel]);

  const guardarEdicion = useCallback(async () => {
    const z = zonas.find((x) => x.id === editSel?.id);
    if (!z || vertsRef.current.length < 3) return;
    setGuardando(true); setErrorEdicion(null);
    try {
      const v = vertsRef.current;
      const c = centroidePlano(v);
      const r = await fetch("/api/admin/forestal/ctp/planta", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ id: z.id, codigo: z.codigo, nombre: z.nombre, tipo: z.tipo, notas: z.notas, poligono: JSON.stringify(v), lat: Number(c[0].toFixed(2)), lng: Number(c[1].toFixed(2)), areaM2: Math.round(areaPlanaM2(v)), plano: "croquis" }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? `HTTP ${r.status}`);
      cancelar(); onChanged();
    } catch (e) { setErrorEdicion(e instanceof Error ? e.message : String(e)); setGuardando(false); }
  }, [zonas, editSel, cancelar, onChanged]);

  const resumen = `${nVerts} ${nVerts === 1 ? "punto" : "puntos"}${perim > 0 ? ` · ${formatNumber(perim, { max: 1 })} m` : ""}${area > 0 ? ` · ${formatNumber(Math.round(area))} m²` : ""}`;

  return {
    modo, nVerts, area, resumen, pendiente, editSel, guardando, errorEdicion,
    iniciar, cancelar, agregarPunto, deshacer, terminar, cerrarPendiente, iniciarEdicion, editarZona, guardarEdicion,
  };
}
