/**
 * loth-plano-fondo — QUÉ imagen va de fondo en lo que SALE del mapa del Libro
 * TH (el plano impreso y el PNG de la vista), cómo se dice su fuente y su
 * FECHA, y a qué tamaño se pide para que el papel salga nítido.
 *
 * Por qué (Brandon, 29-09-2026): el plano del expediente salía con la foto de
 * Esri aunque en pantalla estuviera Sentinel-2. En Blas esa foto es del
 * 18-jun-2022; sin fecha impresa, se lee como «así está hoy».
 *
 *   · Plano con base de foto (en pantalla «Foto de Esri» o «Satélite
 *     reciente»): Sentinel-2 de la fecha elegida en el mapa o, si no se
 *     eligió, la sugerida (la más nueva con ≤ 30 % de nubes sobre el área).
 *     Sin escenas, la foto de Esri con SU fecha. Si la imagen de Sentinel-2 no
 *     carga en la lámina, la lámina cae a Esri y cambia el texto con ella.
 *   · PNG «lo que ves»: la base que está en pantalla, con su fecha.
 *   · Mapa topográfico o de calles: es un mapa, no una foto; se dice de quién.
 *
 * Puro: sin window ni fetch (lo prueba `forestal-loth-plano-fondo.test.ts`).
 */

import { formatDateLong } from "@/lib/format";
import { FUENTE_ESRI_IMAGERY } from "@/lib/esri-imagery";
import {
  S2_RECORTE_MAX_PX,
  fechaCorta,
  itemQueMasCubre,
  urlRecorteS2,
  type BboxLngLat,
} from "./loth-imagenes";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
/** Export estático de Esri (`imageSR=4326` → proyección lineal sobre el recuadro pedido). */
export const ESRI_EXPORT = {
  topo: `${ESRI}/World_Topo_Map/MapServer/export`,
  satelite: `${ESRI}/World_Imagery/MapServer/export`,
  calles: `${ESRI}/World_Street_Map/MapServer/export`,
} as const;
export type ServicioEsri = keyof typeof ESRI_EXPORT;

/** La base que el mapa tiene en pantalla (mismos ids que `BasemapId` del canvas). */
export type BaseEnPantalla = "topo" | "sat" | "s2" | "street";

export interface Recuadro {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

export interface FondoEsri {
  tipo: "esri";
  /** De cuándo es la foto en el centro del área ("2022-06-18"); null si Esri no lo dijo. */
  fecha: string | null;
}
export interface FondoS2 {
  tipo: "s2";
  fecha: string;
  items: { id: string; bbox: BboxLngLat }[];
  /** Si la imagen no carga, la foto de Esri con su fecha. */
  respaldo: FondoEsri;
}
export interface FondoMapa {
  tipo: "mapa";
  base: "topo" | "calles";
  /** Si el mapa no carga, la foto de Esri con su fecha. */
  respaldo: FondoEsri;
}
export type FondoImagen = FondoS2 | FondoEsri | FondoMapa;

interface Entrada {
  base: BaseEnPantalla;
  /** La escena de Sentinel-2 del mapa: la elegida o, si no se eligió, la sugerida. */
  escena: { fecha: string; items: { id: string; bbox: BboxLngLat }[] } | null;
  esri: { fecha: string } | null;
}

/** El fondo del PLANO impreso (regla arriba). */
export function elegirFondoPlano({ base, escena, esri }: Entrada): FondoImagen {
  const respaldo: FondoEsri = { tipo: "esri", fecha: esri?.fecha ?? null };
  if (base === "topo") return { tipo: "mapa", base: "topo", respaldo };
  if (base === "street") return { tipo: "mapa", base: "calles", respaldo };
  return escena && escena.items.length > 0 ? { tipo: "s2", fecha: escena.fecha, items: escena.items, respaldo } : respaldo;
}

/** El fondo del PNG «lo que ves»: la foto de Esri si es lo que está en pantalla. */
export function elegirFondoVista(e: Entrada): FondoImagen {
  return e.base === "sat" ? { tipo: "esri", fecha: e.esri?.fecha ?? null } : elegirFondoPlano(e);
}

// ── Cómo se dice ─────────────────────────────────────────────────────────────

export interface TextoFondo {
  /** Cajetín: «Sentinel-2 · 23 de setiembre de 2026». */
  celda: string;
  /** Pie: «Imagen satelital: Sentinel-2 del 23 de setiembre de 2026 · Contiene datos…». */
  nota: string;
  /** Pantalla y escala del plano: «Sentinel-2 del 23 set 2026». */
  corto: string;
}

const fechaLarga = (iso: string) => formatDateLong(iso, { soloFecha: true });

/**
 * Copernicus pide «Contains modified Copernicus Sentinel data [año]» en lo que
 * se publique con sus imágenes modificadas (aviso legal de los datos Sentinel).
 */
export const atribucionCopernicus = (fecha: string) =>
  `Contiene datos Copernicus Sentinel modificados (${fecha.slice(0, 4)}) · Microsoft Planetary Computer`;

/** El `copyrightText` de cada servicio, tal cual lo publica Esri (leído el 29-09-2026). */
const FUENTE_MAPA: Record<FondoMapa["base"], { nombre: string; fuente: string }> = {
  topo: {
    nombre: "Mapa topográfico de Esri",
    fuente:
      "Esri World Topographic Map · Sources: Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), (c) OpenStreetMap contributors, and the GIS User Community",
  },
  calles: {
    nombre: "Mapa de calles de Esri",
    fuente:
      "Esri World Street Map · Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), Esri Korea, Esri (Thailand), NGCC, (c) OpenStreetMap contributors, and the GIS User Community",
  },
};

export function textoDelFondo(f: FondoImagen): TextoFondo {
  if (f.tipo === "s2") {
    return {
      celda: `Sentinel-2 · ${fechaLarga(f.fecha)}`,
      nota: `Imagen satelital: Sentinel-2 del ${fechaLarga(f.fecha)} · ${atribucionCopernicus(f.fecha)}`,
      corto: `Sentinel-2 del ${fechaCorta(f.fecha)}`,
    };
  }
  if (f.tipo === "esri") {
    // Nunca muda: si Esri no dijo de cuándo es, se imprime que no lo dijo.
    return f.fecha
      ? {
          celda: `Esri World Imagery · ${fechaLarga(f.fecha)}`,
          nota: `Imagen satelital: Esri World Imagery del ${fechaLarga(f.fecha)} · ${FUENTE_ESRI_IMAGERY}`,
          corto: `foto de Esri del ${fechaCorta(f.fecha)}`,
        }
      : {
          celda: "Esri World Imagery · fecha no informada",
          nota: `Imagen satelital: Esri World Imagery, fecha no informada por Esri en esta zona · ${FUENTE_ESRI_IMAGERY}`,
          corto: "foto de Esri sin fecha informada",
        };
  }
  const m = FUENTE_MAPA[f.base];
  return { celda: m.nombre, nota: `Mapa base: ${m.fuente}`, corto: m.nombre.charAt(0).toLowerCase() + m.nombre.slice(1) };
}

// ── Resolución ───────────────────────────────────────────────────────────────

/**
 * Ancho del mapa en el papel A3 apaisado (márgenes de 10 mm): el mismo con el
 * que se calcula la escala. MEDIDO en el PDF de la lámina el 29-09-2026: la
 * imagen de 3 012 px salió a 208 ppp = 36,8 cm (antes decía 25,5: eso es lo
 * que ocupa en un A4; en A3 la resolución quedaba en 208 ppp, no en 300).
 */
export const PLANO_ANCHO_CM = 36.8;
/** Puntos por pulgada de una impresión nítida. */
export const PLANO_DPI = 300;
/**
 * La foto de Esri en la selva termina en el nivel 17 de su caché (360° / 256 /
 * 2¹⁷ por píxel ≈ 1,19 m en el ecuador). Pedir más fino da HTTP 500 al
 * instante: medido el 29-09 sobre Blas, 0,03° a 2 800 px → 200 y a 2 900 → 500;
 * 0,0184° a 1 700 → 200 y a 1 800 → 500. Por eso el tope depende del recuadro.
 */
export const GRADOS_POR_PX_ESRI_Z17 = 360 / (256 * 2 ** 17);
/** Margen bajo ese límite (el servidor redondea). */
const MARGEN_Z17 = 0.95;
/** Tope declarado del export de Esri (`maxImageWidth`/`maxImageHeight`). */
export const ESRI_EXPORT_MAX_PX = 4096;
/** El mapa topográfico no tiene el límite del nivel 17, pero tarda: 2 500 px en 7,5 s y 3 012 en 18 s (medido). */
export const MAPA_MAX_PX = 2400;
/** Lo que se pedía antes (el marco del plano en pantalla): siempre respondió. Es el último respaldo. */
export const PLANO_PX_BASICO = { ancho: 1180, alto: 780 } as const;

export type TipoDeImagen = "s2" | "esri-foto" | "esri-mapa";

/**
 * Cuántos píxeles de ancho pedir (a lo sumo `objetivo`) sin pasarse del tope de
 * quien la sirve. Mantiene el `aspecto` (alto / ancho) del marco.
 */
export function pixelesParaAncho(tipo: TipoDeImagen, b: Recuadro, aspecto: number, objetivo: number): { ancho: number; alto: number } {
  const asp = Math.max(aspecto, 1e-6);
  // Tope por lado (ancho Y alto): un marco alto no puede pasarlo por el lado corto.
  const lado = tipo === "s2" ? S2_RECORTE_MAX_PX : tipo === "esri-mapa" ? MAPA_MAX_PX : ESRI_EXPORT_MAX_PX;
  let ancho = Math.min(objetivo, lado, lado / asp);
  if (tipo === "esri-foto") {
    // El eje más fino manda: el ancho que el recuadro permite a nivel 17, por el ancho y por el alto.
    const porAncho = ((b.lngMax - b.lngMin) / GRADOS_POR_PX_ESRI_Z17) * MARGEN_Z17;
    const porAlto = ((b.latMax - b.latMin) / GRADOS_POR_PX_ESRI_Z17 / asp) * MARGEN_Z17;
    ancho = Math.min(ancho, porAncho, porAlto);
  }
  const w = Math.max(64, Math.floor(ancho));
  return { ancho: w, alto: Math.max(64, Math.round(w * asp)) };
}

/** Los píxeles para llenar `anchoCm` de papel a `dpi` (por defecto, el mapa del plano A3 a 300 ppp = 4 346 px, que el tope deja en 4 096). */
export function pixelesDelFondo(tipo: TipoDeImagen, b: Recuadro, aspecto: number, anchoCm = PLANO_ANCHO_CM, dpi = PLANO_DPI): { ancho: number; alto: number } {
  return pixelesParaAncho(tipo, b, aspecto, Math.round((anchoCm / 2.54) * dpi));
}

/** URL del export estático de Esri para el recuadro. Foto en `jpg` (pesa 10 veces menos), mapas en `png`. */
export function urlExportEsri(servicio: ServicioEsri, b: Recuadro, ancho: number, alto: number): string {
  const formato = servicio === "satelite" ? "jpg" : "png";
  return `${ESRI_EXPORT[servicio]}?bbox=${b.lngMin},${b.latMin},${b.lngMax},${b.latMax}&bboxSR=4326&imageSR=4326&size=${Math.round(ancho)},${Math.round(alto)}&format=${formato}&f=image`;
}

// ── La lámina ────────────────────────────────────────────────────────────────

/** Una imagen de fondo con el texto que la acompaña (si entra ésta, el cajetín dice esto). */
export interface CapaFondo extends TextoFondo {
  src: string;
}

export interface FondoArmado {
  /** Otros cuadros de la misma pasada (transparentes fuera de su recuadro), debajo de la principal. */
  extras: string[];
  principal: CapaFondo;
  /** Lo que se prueba, en orden, si la principal no carga. */
  respaldos: CapaFondo[];
}

const cubreEntero = (bb: BboxLngLat, b: Recuadro) => bb[0] <= b.lngMin && bb[1] <= b.latMin && bb[2] >= b.lngMax && bb[3] >= b.latMax;
const toca = (bb: BboxLngLat, b: Recuadro) => bb[0] < b.lngMax && bb[2] > b.lngMin && bb[1] < b.latMax && bb[3] > b.latMin;

/** La foto de Esri a resolución de impresión y, por si el recuadro no la aguanta, al tamaño de siempre. */
function capasEsri(f: FondoEsri, b: Recuadro, aspecto: number): CapaFondo[] {
  const t = textoDelFondo(f);
  const px = pixelesDelFondo("esri-foto", b, aspecto);
  const alta = { ...t, src: urlExportEsri("satelite", b, px.ancho, px.alto) };
  // El tamaño «de siempre» tampoco pasa el nivel 17: un recuadro de ≈0,012° (el mínimo del plano) a 1 180 px daba HTTP 500 (medido 29-09).
  const bpx = pixelesParaAncho("esri-foto", b, aspecto, PLANO_PX_BASICO.ancho);
  const basica = { ...t, src: urlExportEsri("satelite", b, bpx.ancho, bpx.alto) };
  return px.ancho > bpx.ancho ? [alta, basica] : [basica];
}

/**
 * Las imágenes del marco del plano: la principal, los cuadros vecinos de la
 * misma pasada y la cadena de respaldo (siempre termina en la foto de Esri al
 * tamaño que nunca falló).
 */
export function armarFondoPlano(f: FondoImagen, b: Recuadro, aspecto: number): FondoArmado {
  // Una escena sin cuadros no tiene qué pedir: va la foto de Esri con su fecha.
  if (f.tipo === "s2" && f.items.length === 0) return armarFondoPlano(f.respaldo, b, aspecto);
  if (f.tipo === "s2") {
    const t = textoDelFondo(f);
    const px = pixelesDelFondo("s2", b, aspecto);
    const principal = itemQueMasCubre(f.items, b);
    // Un solo cuadro que cubre todo: jpg. Si el área cae en el borde de la pasada, png (transparente) y los vecinos debajo.
    const solo = cubreEntero(principal.bbox, b);
    const formato = solo ? "jpg" : "png";
    const url = (id: string) => urlRecorteS2(id, b, px.ancho, px.alto, { tope: S2_RECORTE_MAX_PX, formato, suavizar: true });
    return {
      extras: solo ? [] : f.items.filter((it) => it.id !== principal.id && toca(it.bbox, b)).map((it) => url(it.id)),
      principal: { ...t, src: url(principal.id) },
      respaldos: capasEsri(f.respaldo, b, aspecto),
    };
  }
  if (f.tipo === "esri") {
    const [principal, ...respaldos] = capasEsri(f, b, aspecto);
    return { extras: [], principal, respaldos };
  }
  const t = textoDelFondo(f);
  const servicio: ServicioEsri = f.base;
  const px = pixelesDelFondo("esri-mapa", b, aspecto);
  return {
    extras: [],
    principal: { ...t, src: urlExportEsri(servicio, b, px.ancho, px.alto) },
    // El mapa al tamaño de siempre y, si tampoco, la foto (con su texto: el cajetín no puede decir «mapa» sobre una foto).
    respaldos: [{ ...t, src: urlExportEsri(servicio, b, PLANO_PX_BASICO.ancho, PLANO_PX_BASICO.alto) }, ...capasEsri(f.respaldo, b, aspecto).slice(-1)],
  };
}

// ── El PNG de la vista ───────────────────────────────────────────────────────

export interface FondoDeImagen {
  url: string;
  fuente: string;
  respaldo?: { url: string; fuente: string };
}

/** La foto de Esri de la vista, sin pedirla más fina que su nivel 17 (a zoom 18 un PNG de 1 400 px daba HTTP 500). */
function esriDeLaVista(f: FondoEsri, b: Recuadro, ancho: number, alto: number) {
  const px = pixelesParaAncho("esri-foto", b, alto / ancho, ancho);
  return { url: urlExportEsri("satelite", b, px.ancho, px.alto), fuente: textoDelFondo(f).nota };
}

/** De dónde sale el fondo del PNG «lo que ves» (`ancho`×`alto`) y cómo se nombra, con la foto de Esri de respaldo. */
export function fondoDeLaImagen(f: FondoImagen, b: Recuadro, ancho: number, alto: number): FondoDeImagen {
  if (f.tipo === "esri") return esriDeLaVista(f, b, ancho, alto);
  const respaldo = esriDeLaVista(f.respaldo, b, ancho, alto);
  if (f.tipo === "s2") {
    const item = itemQueMasCubre(f.items, b);
    return { url: urlRecorteS2(item.id, b, ancho, alto, { suavizar: true }), fuente: textoDelFondo(f).nota, respaldo };
  }
  return { url: urlExportEsri(f.base, b, ancho, alto), fuente: textoDelFondo(f).nota, respaldo };
}
