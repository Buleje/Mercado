/**
 * loth-wayback — el ARCHIVO HISTÓRICO satelital (Esri World Imagery Wayback)
 * puesto al servicio del EUDR.
 *
 * El Reglamento UE 2023/1115 exige acreditar que la parcela está libre de
 * deforestación **posterior al 31-dic-2020**. Hasta acá eso era una casilla que
 * el titular tildaba: una atestación sin evidencia. Wayback publica ~195
 * versiones fechadas de la imagen satelital mundial, así que se puede mirar la
 * MISMA parcela antes del corte y hoy, y comparar con los ojos.
 *
 * Este módulo es la parte pura: normaliza el catálogo de versiones y elige la
 * que corresponde a una fecha. La capa de tiles la monta `LothMapaCanvas`.
 *
 * Fuente del catálogo (verificada 2026-07-22, 195 releases):
 * https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json
 */

/** Corte EUDR: la producción no puede venir de tierra deforestada después. */
export const EUDR_CUTOFF = "2020-12-31";

export const WAYBACK_CONFIG_URL = "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json";

export interface WaybackRelease {
  /** N° de release en la URL de teselas. */
  releaseNum: string;
  /** Fecha de la versión (ISO, "2020-10-14"). */
  fecha: string;
  /** "14 oct 2020" — para el selector. */
  label: string;
  /** Plantilla lista para Leaflet ({z}/{y}/{x}). */
  urlTemplate: string;
}

interface RawRelease {
  itemTitle?: string;
  itemURL?: string;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "World Imagery (Wayback 2020-10-14)" → "2020-10-14". */
function fechaDeTitulo(titulo: string): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(titulo ?? "");
  return m ? m[0] : null;
}

function etiqueta(fechaIso: string): string {
  const [y, m, d] = fechaIso.split("-");
  const mes = MESES[Number(m) - 1] ?? m;
  return `${Number(d)} ${mes} ${y}`;
}

/**
 * Catálogo crudo → releases normalizadas y ordenadas de la más NUEVA a la más
 * vieja. Tolera entradas rotas: una versión sin fecha o sin URL se descarta.
 */
export function parseWaybackConfig(raw: unknown): WaybackRelease[] {
  const obj = (raw ?? {}) as Record<string, RawRelease>;
  const out: WaybackRelease[] = [];
  for (const [releaseNum, item] of Object.entries(obj)) {
    const fecha = fechaDeTitulo(item?.itemTitle ?? "");
    const url = item?.itemURL ?? "";
    if (!fecha || !url) continue;
    // Esri usa {level}/{row}/{col}; Leaflet usa {z}/{y}/{x}.
    const urlTemplate = url.replace("{level}", "{z}").replace("{row}", "{y}").replace("{col}", "{x}");
    out.push({ releaseNum, fecha, label: etiqueta(fecha), urlTemplate });
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * La versión que representa "cómo estaba la parcela ANTES del corte": la última
 * publicada en o antes de la fecha. Si no hay ninguna (catálogo que arranca
 * después), devuelve la más vieja disponible — y quien mira ve la fecha real,
 * nunca una fecha inventada.
 */
export function releaseParaFecha(releases: WaybackRelease[], fechaIso: string): WaybackRelease | null {
  if (releases.length === 0) return null;
  const previa = releases.find((r) => r.fecha <= fechaIso);
  return previa ?? releases[releases.length - 1];
}

/** Una versión por año (la más reciente de cada uno) — el selector no necesita 195. */
export function releasesPorAnio(releases: WaybackRelease[], desdeAnio = 2015): WaybackRelease[] {
  const porAnio = new Map<string, WaybackRelease>();
  for (const r of releases) {
    const anio = r.fecha.slice(0, 4);
    if (Number(anio) < desdeAnio) continue;
    if (!porAnio.has(anio)) porAnio.set(anio, r); // ya vienen de nuevo a viejo
  }
  return [...porAnio.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** ¿La versión es anterior o igual al corte EUDR? (la que sirve de "antes"). */
export function esAnteriorAlCorte(r: WaybackRelease, corte = EUDR_CUTOFF): boolean {
  return r.fecha <= corte;
}

/**
 * Trae el catálogo desde NUESTRO endpoint, no desde S3: la CSP del sitio no
 * tiene `config.maptiles.arcgis.com` en `connect-src` y abrirlo para todo el
 * dominio por una herramienta de un tab no se paga. El server ya devuelve una
 * versión por año. Devuelve [] si el servicio no responde — la herramienta
 * simplemente no se ofrece y el mapa sigue vivo.
 */
export async function cargarWaybackReleases(signal?: AbortSignal): Promise<WaybackRelease[]> {
  try {
    const res = await fetch("/api/admin/forestal/loth/wayback", { credentials: "include", signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { releases?: WaybackRelease[] };
    return Array.isArray(data.releases) ? data.releases : [];
  } catch {
    return [];
  }
}
