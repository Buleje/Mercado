/**
 * Fotos de la CARGA de una guía (Libro CTP, ADR-434) — la forma de cada foto y
 * cómo se muestra. PURO: lo importan el cliente (miniaturas, sello) y el
 * servidor (Zod del PATCH, lectores que devuelven `photos`).
 *
 * Dos formas conviven en `WoodEntry.photos` (Json):
 *  - LEGADO: un string `https://…/storage/v1/object/public/media/<tenant>/…`
 *    (bucket público, URL adivinable). Se sigue mostrando tal cual.
 *  - NUEVA: un objeto `FotoCarga` con `url = "priv:<tenant>/forestal-carga/<uuid>.webp"`
 *    — vive en el bucket PRIVADO `forestal-privado` y sólo se ve pasando por
 *    `/api/admin/forestal/fotos/ver`, que exige sesión del MISMO tenant y
 *    redirige a una URL firmada de 10 min.
 *
 * `normalizarFotos` es la única puerta de lectura: acepta el array viejo de
 * strings, objetos, o una mezcla, y descarta lo que no sea una foto.
 */

export interface FotoCarga {
  /** `"priv:<tenantId>/forestal-carga/<uuid>.webp"` (privada) o https legado. */
  url: string;
  /** ISO que manda el cliente (hora de la cámara / del teléfono). */
  tomadaEn?: string | null;
  /** ISO que pone el SERVIDOR al recibir el archivo. */
  subidaEn?: string | null;
  /** Nombre de quien subió — lo pone el servidor desde la sesión. */
  por?: string | null;
  lat?: number | null;
  lng?: number | null;
  precisionM?: number | null;
  /** El cliente quemó el sello (fecha, hora, lugar) en la imagen. */
  sellada?: boolean;
  /**
   * HMAC-SHA256 (hex) que pone `/api/admin/forestal/fotos` al subirla, sobre
   * `url·tomadaEn·subidaEn·por·lat·lng·precisionM·sellada` (ver
   * `fotos-carga-firma.ts`). El cliente la devuelve TAL CUAL: si cambia un
   * dato, la guía rechaza la foto al guardarla. Las fotos guardadas antes del
   * 2026-09-26 no la tienen y se conservan como estaban.
   */
  firma?: string;
}

export const PREFIJO_PRIVADO = "priv:";
export const CARPETA_CARGA = "forestal-carga";
export const RUTA_VER_FOTO = "/api/admin/forestal/fotos/ver";

function texto(v: unknown, max = 200): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null;
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Una URL con forma de foto: privada `priv:<algo>` o `https://`. Nada más. */
function urlValida(u: string): boolean {
  if (u.startsWith(PREFIJO_PRIVADO)) return u.length > PREFIJO_PRIVADO.length && !u.includes("..");
  return /^https:\/\//i.test(u);
}

/** Una foto (string legado u objeto) → `FotoCarga`, o `null` si es basura. */
export function normalizarFoto(raw: unknown): FotoCarga | null {
  if (typeof raw === "string") {
    const url = raw.trim();
    return url && urlValida(url) ? { url } : null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const url = texto(o.url, 500);
  if (!url || !urlValida(url)) return null;
  const foto: FotoCarga = { url };
  const tomadaEn = texto(o.tomadaEn, 40);
  const subidaEn = texto(o.subidaEn, 40);
  const por = texto(o.por, 120);
  const lat = numero(o.lat);
  const lng = numero(o.lng);
  const precisionM = numero(o.precisionM);
  if (tomadaEn) foto.tomadaEn = tomadaEn;
  if (subidaEn) foto.subidaEn = subidaEn;
  if (por) foto.por = por;
  if (lat != null && Math.abs(lat) <= 90) foto.lat = lat;
  if (lng != null && Math.abs(lng) <= 180) foto.lng = lng;
  if (precisionM != null && precisionM >= 0) foto.precisionM = precisionM;
  if (o.sellada === true) foto.sellada = true;
  /* La firma viaja intacta (se valida en el servidor, no acá): sólo se
     descarta lo que no tiene la forma de un HMAC-SHA256 en hex. */
  if (typeof o.firma === "string" && /^[0-9a-f]{64}$/.test(o.firma)) foto.firma = o.firma;
  return foto;
}

/** `photos` crudo (Json de la base, body del cliente) → lista limpia, sin repetidas. */
export function normalizarFotos(raw: unknown): FotoCarga[] {
  if (!Array.isArray(raw)) return [];
  const vistas = new Set<string>();
  const out: FotoCarga[] = [];
  for (const r of raw) {
    const f = normalizarFoto(r);
    if (!f || vistas.has(f.url)) continue;
    vistas.add(f.url);
    out.push(f);
  }
  return out;
}

function urlDe(f: FotoCarga | string): string {
  return typeof f === "string" ? f : f.url;
}

export function esFotoPrivada(f: FotoCarga | string): boolean {
  return urlDe(f).startsWith(PREFIJO_PRIVADO);
}

/** El path dentro del bucket privado (`<tenant>/forestal-carga/<uuid>.webp`), o `null` si es legado. */
export function pathDeFoto(f: FotoCarga | string): string | null {
  const u = urlDe(f);
  return u.startsWith(PREFIJO_PRIVADO) ? u.slice(PREFIJO_PRIVADO.length) : null;
}

/** Lo que va en `<img src>`: privada → la ruta que firma; legado → la misma URL. */
export function srcDeFoto(f: FotoCarga | string): string {
  const path = pathDeFoto(f);
  return path == null ? urlDe(f) : `${RUTA_VER_FOTO}?p=${encodeURIComponent(path)}`;
}

/** `"priv:<path>"` para guardar en el libro. */
export function urlPrivada(path: string): string {
  return `${PREFIJO_PRIVADO}${path}`;
}

/**
 * ¿`path` es una foto de carga de ESTE tenant? Exige el prefijo exacto
 * `<tenantId>/forestal-carga/`, un solo tramo después (sin `/`), sin `..`,
 * sin `\`, sin caracteres de control. Es el candado del endpoint `ver` y del
 * Zod del PATCH: otro tenant, o un intento de escaparse de la carpeta, da `false`.
 */
export function esPathDeCargaDelTenant(path: string, tenantId: string): boolean {
  if (!tenantId || typeof path !== "string" || path.length > 300) return false;
  const prefijo = `${tenantId}/${CARPETA_CARGA}/`;
  if (!path.startsWith(prefijo)) return false;
  const archivo = path.slice(prefijo.length);
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(archivo) && !archivo.includes("..");
}

/** Clave para comparar listas (diff de auditoría): la URL. */
export function urlsDeFotos(fotos: readonly (FotoCarga | string)[]): string[] {
  return fotos.map(urlDe);
}

/* Lo que se GUARDA en el libro lo decide el servidor con la firma de cada foto
   (`resolverFotosEntrantes` en `fotos-carga-firma.ts`, 2026-09-26). Antes lo
   hacía `sellarFotosNuevas` acá, confiando en una ventana de 24 h para
   `subidaEn`: quien editaba la guía podía atrasarla, y cambiar `tomadaEn`,
   `lat/lng` o `sellada` a mano. */

/** ¿La guía tiene al menos una foto? (sobre `photos` crudo de cualquier asiento). */
export function tieneFotos(raw: unknown): boolean {
  return normalizarFotos(raw).length > 0;
}
