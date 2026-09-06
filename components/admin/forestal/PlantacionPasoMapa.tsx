"use client";

/**
 * PlantacionPasoMapa — Sección 13 del RNPF ("Ubicación de la Plantación"):
 * el polígono de cada bloque, dibujado desde sus vértices UTM.
 *
 * Mucho más simple que `LothMapaCanvas` (censo, grilla UTM, capas oficiales):
 * acá sólo hace falta pintar polígonos + centroides y, si hay un bloque
 * "activo" elegido arriba, agregar un vértice nuevo al tocar el mapa
 * (`puntoAVertice`). La edición fina (mover/borrar/reordenar) ya la tiene
 * `PlantacionVerticesTabla` — este mapa es sólo agregar + ver.
 *
 * GOTCHA Leaflet (mismo que el resto de los mapas forestales): el className
 * del contenedor va ESTÁTICO — Leaflet agrega sus propias clases y un
 * className dinámico haría que React las borrara.
 *
 * El mapa se monta SIEMPRE (no se condiciona al número de bloques): si el
 * contenedor sólo aparece cuando `bloques.length > 0`, el efecto de init
 * (deps `[]`) nunca vuelve a correr cuando el primer bloque se agrega después
 * del montaje. En cambio, el estado vacío se dibuja como overlay ENCIMA del
 * mapa ya montado (mismo patrón que `CtpEudrMap`).
 */
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, MapPin } from "@buleje/design-system/icons";
import { BRAND_GEO } from "@/lib/geo";
import { vertexCode } from "@/lib/forestal/loth-utm";
import { centroideConjunto, geometriaBloque, puntoAVertice, type BloqueGeometria } from "@/lib/forestal/plantacion-cartografia";
import type { BloqueInput } from "@/lib/forestal/plantacion-tramite";

const SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const STREET = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SAT_MAX_NATIVE = 17;
/** Un color por bloque, cíclico. Leaflet vive fuera del DS (igual que el resto
 *  de los mapas forestales): no hay tokens para vectores sobre satélite. */
const PALETA = ["#0d9488", "#d97706", "#7c3aed", "#dc2626", "#2563eb"];

function nombreBloque(b: BloqueInput, i: number): string {
  return `Bloque ${b.numero || i + 1}${b.nombre ? ` — ${b.nombre}` : ""}`;
}

export default function PlantacionPasoMapa({
  bloques,
  soloLectura,
  onChange,
}: {
  bloques: BloqueInput[];
  soloLectura?: boolean;
  onChange: (bloques: BloqueInput[]) => void;
}) {
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
  const [activo, setActivo] = useState<number | null>(null);

  const activoValido = activo !== null && activo < bloques.length ? activo : null;
  const geometrias = useMemo<BloqueGeometria[]>(() => bloques.map((b) => geometriaBloque(b.vertices)), [bloques]);

  // Default sensato: el primer bloque incompleto (o el último, si todos están
  // cerrados). Sin esto el mapa se monta en "Ningún bloque" y los primeros
  // clicks del operador no hacen nada — dead-clicks que el test de la señora
  // de 55 años no perdona. Sólo pisa el valor cuando el actual quedó inválido
  // (bloque borrado) para no pelearle una elección manual.
  useEffect(() => {
    if (soloLectura || bloques.length === 0) return;
    if (activo !== null && activo < bloques.length) return;
    const incompleto = bloques.findIndex((b) => b.vertices.length < 3);
    setActivo(incompleto >= 0 ? incompleto : bloques.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bloques.length, soloLectura]);

  const onMapClick = useCallback(
    (lat: number, lng: number) => {
      if (soloLectura || activoValido === null) return;
      const bloque = bloques[activoValido];
      if (!bloque) return;
      const vertice = puntoAVertice(lat, lng, bloque.vertices.length);
      onChange(bloques.map((b, i) => (i === activoValido ? { ...b, vertices: [...b.vertices, vertice] } : b)));
    },
    [soloLectura, activoValido, bloques, onChange],
  );

  // Init una sola vez.
  useEffect(() => {
    let destroyed = false;
    const centroInicial = centroideConjunto(bloques.map((b) => geometriaBloque(b.vertices))) ?? [BRAND_GEO.lat, BRAND_GEO.lng];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("leaflet").then((L: any) => {
      if (destroyed || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { center: centroInicial, zoom: 14, maxZoom: 22 });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redibujar los polígonos/puntos de cada bloque + centroides.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = groupRef.current;
    if (!ready || !L || !map || !group) return;
    group.clearLayers();
    const bounds: [number, number][] = [];

    bloques.forEach((b, i) => {
      const g = geometrias[i];
      const color = PALETA[i % PALETA.length];
      const nombre = nombreBloque(b, i);

      if (g.ring.length >= 3) {
        L.polygon(g.ring, { color, weight: 2.5, fillColor: color, fillOpacity: 0.15 }).bindTooltip(nombre, { sticky: true }).addTo(group);
      } else if (g.ring.length === 2) {
        L.polyline(g.ring, { color, weight: 2.5, dashArray: "6 4" }).addTo(group);
      }

      g.ring.forEach((v, j) => {
        L.circleMarker(v, { radius: 5, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 })
          .bindTooltip(vertexCode(j), { permanent: g.ring.length <= 12, direction: "top", className: "loth-vertex-label", offset: [0, -6] })
          .addTo(group);
        bounds.push(v);
      });

      if (g.centroide && g.ring.length >= 3) {
        L.circleMarker(g.centroide, { radius: 4, color: "#0f172a", weight: 2, fillColor: "#fff", fillOpacity: 1 })
          .bindTooltip(`${nombre}${g.areaCalculadaHa != null ? ` · ${g.areaCalculadaHa.toFixed(2)} ha` : ""}`, { direction: "top", offset: [0, -8] })
          .addTo(group);
      }
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], Math.max(map.getZoom(), 16));
    } else if (bounds.length > 1) {
      try {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 17 });
      } catch {
        /* bounds inválidos → se queda en el encuadre actual */
      }
    }
  }, [ready, bloques, geometrias]);

  // Click en el mapa = vértice nuevo para el bloque activo.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const puedeAgregar = activoValido !== null && !soloLectura;
    (map.getContainer() as HTMLElement).style.cursor = puedeAgregar ? "crosshair" : "";
    if (!puedeAgregar) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onClick = (e: any) => onMapClick(e.latlng.lat, e.latlng.lng);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      if (mapRef.current) (mapRef.current.getContainer() as HTMLElement).style.cursor = "";
    };
  }, [ready, activoValido, soloLectura, onMapClick]);

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
    <div className="space-y-3">
      {bloques.length > 0 && !soloLectura && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="rpf-bloque-activo" className="text-xs font-bold text-[var(--text-secondary)]">
            Agregando vértices a
          </label>
          <select
            id="rpf-bloque-activo"
            value={activoValido ?? ""}
            onChange={(e) => setActivo(e.target.value === "" ? null : Number(e.target.value))}
            className="h-9 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text-primary)]"
          >
            <option value="">Ningún bloque (sólo ver)</option>
            {bloques.map((b, i) => (
              <option key={i} value={i}>
                {nombreBloque(b, i)}
              </option>
            ))}
          </select>
          {activoValido !== null && <span className="text-xs text-[var(--text-tertiary)]">Tocá el mapa para agregar un vértice</span>}
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)]">
        {/* className ESTÁTICO (gotcha Leaflet). */}
        <div ref={containerRef} className="h-[420px] w-full bg-[var(--surface-sunken)]" />

        {ready && (
          <button
            type="button"
            onClick={() => setLayer((l) => (l === "sat" ? "street" : "sat"))}
            className="absolute right-2 top-2 z-[400] inline-flex h-9 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-3 text-xs font-bold text-[var(--text-primary)] shadow-md backdrop-blur hover:bg-[var(--surface-canvas)]"
          >
            <Layers className="h-3.5 w-3.5" /> {layer === "sat" ? "Ver calles" : "Ver satélite"}
          </button>
        )}

        {bloques.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 p-5 text-center shadow-lg backdrop-blur">
              <MapPin className="mx-auto mb-2 h-8 w-8 text-[var(--text-tertiary)]" aria-hidden="true" />
              <p className="text-sm font-bold text-[var(--text-primary)]">Agregá un bloque en el paso anterior para verlo acá</p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">El mapa dibuja el polígono de cada bloque en cuanto tenga sus vértices.</p>
            </div>
          </div>
        )}
      </div>

      {bloques.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {bloques.map((b, i) => {
            const g = geometrias[i];
            return (
              <li key={i} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <span className="h-3 w-3 shrink-0 rounded-full border border-white" style={{ background: PALETA[i % PALETA.length] }} aria-hidden="true" />
                {nombreBloque(b, i)} —{" "}
                {g.areaCalculadaHa != null ? (
                  <b className="font-mono tabular-nums text-[var(--text-primary)]">{g.areaCalculadaHa.toLocaleString("es-PE", { maximumFractionDigits: 4 })} ha calculada</b>
                ) : b.vertices.length > 0 ? (
                  `${b.vertices.length} punto(s), faltan vértices`
                ) : (
                  "sin vértices"
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
