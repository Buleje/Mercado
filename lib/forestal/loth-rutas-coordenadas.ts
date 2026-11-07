/**
 * loth-rutas-coordenadas — las RUTAS (vías, trochas, caminos) y los PUNTOS
 * (patio, campamento, acopio, ingreso…) de la cartografía del Libro TH, dichos
 * con sus coordenadas: largo, pendiente máxima si se conoce el relieve, inicio
 * y fin en UTM y en lat/lng, y cada vértice. Y lo que sale de eso: el texto
 * para copiar, las hojas del Excel, el GeoJSON y el KML.
 *
 * Lo leen el bloque «Rutas y puntos» debajo del mapa y la ficha que se abre al
 * tocar una ruta en el mapa: si cada uno armara el suyo, podrían decir cosas
 * distintas.
 *
 * La zona UTM se deduce de la LONGITUD (Blas, Ucayali: 18 S); una ruta entera
 * va en la zona de la mayoría de sus puntos, como un plano, para que sus
 * vértices no salten de huso a mitad de camino.
 *
 * PURO y client-safe (sin DOM, sin `lib/db/*`).
 */

import type { LatLng } from "./loth-geo";
import { referenciaMeta, viaMeta, type LothReferencia, type LothVia } from "./loth-cartografia";
import type { GrillaElevacion } from "./loth-geografia";
import { PREFIJO_PROPUESTA } from "./loth-geografia";
import { crearPlano, aXY, Relieve } from "./loth-planificador-terreno";
import { distanceM, dominantZone, formatMeters, toUtm, zoneLabel } from "./loth-utm";
import { formatNumber } from "@/lib/format";

/** Una coordenada dicha de las dos formas: UTM (como el plano) y lat/lng (como el GPS y Google Maps). */
export interface CoordRuta {
  lat: number;
  lng: number;
  /** Huso UTM (Perú: 17, 18 o 19). */
  zone: number;
  south: boolean;
  /** «18S»: huso y hemisferio, como en el cajetín del plano. */
  zona: string;
  este: number;
  norte: number;
}

export interface VerticeRuta extends CoordRuta {
  /** 1, 2, 3… en el orden de la traza. */
  n: number;
  /** Metros recorridos desde el inicio hasta este vértice. */
  acumuladoM: number;
}

export interface FilaRuta {
  id: string;
  /** `via:<id>` — la clave con la que el mapa y la lista se hablan. */
  clave: string;
  nombre: string;
  tipo: LothVia["tipo"];
  tipoLabel: string;
  /** Color del tipo de vía (el mismo del mapa y de la leyenda). */
  color: string;
  largoM: number;
  /** Pendiente máxima del recorrido (%). null = no se tiene el relieve de la zona. */
  pendienteMaxPct: number | null;
  inicio: CoordRuta;
  fin: CoordRuta;
  vertices: VerticeRuta[];
  /** La agregó el planificador (id `prop-…`). */
  propuesta: boolean;
}

export interface FilaPunto {
  id: string;
  /** `ref:<id>`. */
  clave: string;
  nombre: string;
  tipo: LothReferencia["tipo"];
  tipoLabel: string;
  color: string;
  punto: CoordRuta;
  nota: string;
}

export const claveDeRuta = (id: string) => `via:${id}`;
export const claveDePunto = (id: string) => `ref:${id}`;

/** La coordenada en UTM (zona deducida de la longitud, o la forzada) y lat/lng. */
export function coordDe(p: LatLng, zonaForzada?: number): CoordRuta {
  const u = toUtm(p[0], p[1], zonaForzada);
  return { lat: p[0], lng: p[1], zone: u.zone, south: u.south, zona: zoneLabel(u.zone, u.south), este: u.easting, norte: u.northing };
}

/**
 * Pendiente máxima de una traza sobre la grilla de altitud (%), con la MISMA
 * cuenta del planificador (`Relieve.tramo`): así la ruta que propuso con «18 %»
 * se lee igual en la lista. null si no hay grilla o la traza cae fuera de ella.
 */
export function pendienteMaxDeTraza(puntos: readonly LatLng[], grilla: GrillaElevacion | null | undefined): number | null {
  if (!grilla || puntos.length < 2) return null;
  const plano = crearPlano(puntos[0][0], puntos[0][1]);
  const relieve = new Relieve(grilla, plano);
  let max: number | null = null;
  for (let i = 1; i < puntos.length; i++) {
    const [ax, ay] = aXY(plano, puntos[i - 1]);
    const [bx, by] = aXY(plano, puntos[i]);
    const { pendMax } = relieve.tramo(ax, ay, bx, by);
    if (pendMax != null && Number.isFinite(pendMax)) max = max == null ? pendMax : Math.max(max, pendMax);
  }
  return max == null ? null : Math.round(max * 10) / 10;
}

/** Una fila por ruta, en el orden guardado. Las de menos de 2 puntos no son rutas. */
export function filasDeRutas(vias: readonly LothVia[], grilla?: GrillaElevacion | null): FilaRuta[] {
  const out: FilaRuta[] = [];
  for (const v of vias) {
    if (v.puntos.length < 2) continue;
    const meta = viaMeta(v.tipo);
    const zone = dominantZone(v.puntos);
    let acumuladoM = 0;
    const vertices = v.puntos.map((p, i): VerticeRuta => {
      if (i > 0) acumuladoM += distanceM(v.puntos[i - 1], p);
      return { ...coordDe(p, zone), n: i + 1, acumuladoM };
    });
    out.push({
      id: v.id,
      clave: claveDeRuta(v.id),
      nombre: v.nombre,
      tipo: v.tipo,
      tipoLabel: meta.label,
      color: meta.color,
      largoM: acumuladoM,
      pendienteMaxPct: pendienteMaxDeTraza(v.puntos, grilla),
      inicio: vertices[0],
      fin: vertices[vertices.length - 1],
      vertices,
      propuesta: v.id.startsWith(PREFIJO_PROPUESTA),
    });
  }
  return out;
}

export function filasDePuntos(refs: readonly LothReferencia[]): FilaPunto[] {
  return refs.map((r) => {
    const meta = referenciaMeta(r.tipo);
    return {
      id: r.id,
      clave: claveDePunto(r.id),
      nombre: r.nombre,
      tipo: r.tipo,
      tipoLabel: meta.label,
      color: meta.color,
      punto: coordDe([r.lat, r.lng]),
      nota: r.nota,
    };
  });
}

// ── Cómo se dicen ────────────────────────────────────────────────────────────

/** «18S · E 521 278 · N 8 918 315». */
export const textoUtm = (c: CoordRuta) => `${c.zona} · E ${formatMeters(c.este, 0)} · N ${formatMeters(c.norte, 0)}`;
/** «-9.788330, -74.797749»: seis decimales (≈ 10 cm), como se pega en el GPS o en Google Maps. */
export const textoLatLng = (c: Pick<CoordRuta, "lat" | "lng">) => `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
/** «812 m» (siempre en metros: es lo que se camina). */
export const textoLargo = (m: number) => `${formatNumber(Math.round(m), 0)} m`;
export const textoPendiente = (p: number | null) => (p == null ? "sin dato" : `${Math.round(p)} %`);

/** Lo que se copia de una ruta: se lee en WhatsApp o se pega en el informe. */
export function textoDeRuta(f: FilaRuta, conVertices = false): string {
  const cabeza = [
    `${f.nombre} (${f.tipoLabel}) · ${textoLargo(f.largoM)}${f.pendienteMaxPct != null ? ` · pendiente máx. ${textoPendiente(f.pendienteMaxPct)}` : ""}`,
    `Inicio: ${textoUtm(f.inicio)} · ${textoLatLng(f.inicio)}`,
    `Fin: ${textoUtm(f.fin)} · ${textoLatLng(f.fin)}`,
  ];
  if (!conVertices) return cabeza.join("\n");
  return [...cabeza, ...f.vertices.map((v) => `${v.n}. ${textoUtm(v)} · ${textoLatLng(v)} · ${textoLargo(v.acumuladoM)}`)].join("\n");
}

export function textoDePunto(f: FilaPunto): string {
  return `${f.nombre} (${f.tipoLabel}): ${textoUtm(f.punto)} · ${textoLatLng(f.punto)}`;
}

/** Todo junto, para «Copiar todo». */
export function textoDeTodo(rutas: readonly FilaRuta[], puntos: readonly FilaPunto[]): string {
  return [...rutas.map((r) => textoDeRuta(r)), ...puntos.map(textoDePunto)].join("\n\n");
}

// ── Lo que sale en archivo ───────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;
const r7 = (n: number) => Math.round(n * 1e7) / 1e7;

/** Tres hojas: una fila por ruta, una por vértice, una por punto. Encabezados en su idioma. */
export function hojasDeRutas(rutas: readonly FilaRuta[], puntos: readonly FilaPunto[]): { nombre: string; filas: Record<string, unknown>[] }[] {
  return [
    {
      nombre: "Rutas",
      filas: rutas.map((f) => ({
        Ruta: f.nombre,
        Tipo: f.tipoLabel,
        "Largo (m)": Math.round(f.largoM),
        "Pendiente máx. (%)": f.pendienteMaxPct ?? "",
        Vértices: f.vertices.length,
        Zona: f.inicio.zona,
        "Inicio Este": r2(f.inicio.este),
        "Inicio Norte": r2(f.inicio.norte),
        "Inicio latitud": r7(f.inicio.lat),
        "Inicio longitud": r7(f.inicio.lng),
        "Fin Este": r2(f.fin.este),
        "Fin Norte": r2(f.fin.norte),
        "Fin latitud": r7(f.fin.lat),
        "Fin longitud": r7(f.fin.lng),
      })),
    },
    {
      nombre: "Vértices de las rutas",
      filas: rutas.flatMap((f) =>
        f.vertices.map((v) => ({
          Ruta: f.nombre,
          "N°": v.n,
          Zona: v.zona,
          Este: r2(v.este),
          Norte: r2(v.norte),
          Latitud: r7(v.lat),
          Longitud: r7(v.lng),
          "Desde el inicio (m)": Math.round(v.acumuladoM),
        })),
      ),
    },
    {
      nombre: "Puntos",
      filas: puntos.map((p) => ({
        Punto: p.nombre,
        Tipo: p.tipoLabel,
        Zona: p.punto.zona,
        Este: r2(p.punto.este),
        Norte: r2(p.punto.norte),
        Latitud: r7(p.punto.lat),
        Longitud: r7(p.punto.lng),
        Nota: p.nota,
      })),
    },
  ];
}

/** GeoJSON (WGS 84, [lng, lat]): líneas para las rutas, puntos para las referencias. Lo abre QGIS. */
export function geoJsonDeRutas(rutas: readonly FilaRuta[], puntos: readonly FilaPunto[]) {
  return {
    type: "FeatureCollection" as const,
    features: [
      ...rutas.map((f) => ({
        type: "Feature" as const,
        properties: { nombre: f.nombre, tipo: f.tipoLabel, largo_m: Math.round(f.largoM), pendiente_max_pct: f.pendienteMaxPct, zona_utm: f.inicio.zona },
        geometry: { type: "LineString" as const, coordinates: f.vertices.map((v) => [r7(v.lng), r7(v.lat)]) },
      })),
      ...puntos.map((p) => ({
        type: "Feature" as const,
        properties: { nombre: p.nombre, tipo: p.tipoLabel, este: r2(p.punto.este), norte: r2(p.punto.norte), zona_utm: p.punto.zona, nota: p.nota },
        geometry: { type: "Point" as const, coordinates: [r7(p.punto.lng), r7(p.punto.lat)] },
      })),
    ],
  };
}

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);
/** KML pide el color como aabbggrr. */
const colorKml = (hex: string) => {
  const h = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return `ff${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`;
};

/** KML para Google Earth o el celular: cada ruta con el color de su tipo, cada punto con su coordenada UTM en la descripción. */
export function kmlDeRutas(rutas: readonly FilaRuta[], puntos: readonly FilaPunto[], nombre = "Rutas y puntos del Libro TH"): string {
  const lineas = rutas
    .map(
      (f) =>
        `<Placemark><name>${xml(f.nombre)}</name><description>${xml(`${f.tipoLabel} · ${textoLargo(f.largoM)}`)}</description>` +
        `<Style><LineStyle><color>${colorKml(f.color)}</color><width>3</width></LineStyle></Style>` +
        `<LineString><tessellate>1</tessellate><coordinates>${f.vertices.map((v) => `${v.lng.toFixed(7)},${v.lat.toFixed(7)},0`).join(" ")}</coordinates></LineString></Placemark>`,
    )
    .join("\n  ");
  const pts = puntos
    .map(
      (p) =>
        `<Placemark><name>${xml(p.nombre)}</name><description>${xml(`${p.tipoLabel} · ${textoUtm(p.punto)}`)}</description>` +
        `<Point><coordinates>${p.punto.lng.toFixed(7)},${p.punto.lat.toFixed(7)},0</coordinates></Point></Placemark>`,
    )
    .join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>${xml(nombre)}</name>
  ${lineas}
  ${pts}
</Document></kml>`;
}
