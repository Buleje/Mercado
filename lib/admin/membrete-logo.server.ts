import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { safeFetch } from "@/lib/safe-fetch";
import { logger } from "@/lib/logger";

/**
 * lib/admin/membrete-logo.server.ts — el logo del negocio en PNG para los
 * papeles (ADR-514).
 *
 * El logo se sube como venga: el de Blas es WebP (41.906 B, medido 23-10); ni
 * jsPDF ni pdf-lib leen WebP, y el canvas del navegador no puede leer uno de
 * otro dominio sin CORS. Acá se baja del lado del servidor, se pasa a PNG con
 * `sharp` y se achica.
 *
 * Sólo de lugares propios (sin SSRF): un data URL, el bucket de Supabase del
 * proyecto o un archivo de `public/`. Cualquier otro host, `/api/*`, una IP o
 * un camino con `..` = `null`.
 *
 * Revisión de seguridad 23-10 (CRÍTICO cerrado): `…/documents/tenants/<YO>/%252e%252e/<OTRO>/dni.jpg`
 * pasaba el chequeo (un `decodeURIComponent` deja `%2e%2e`), storage-js arma la
 * URL sin codificar y `fetch` lo leía como `..`: con la llave de servicio bajaba
 * el DNI de OTRO negocio. Ahora: la ruta decodificada no puede traer `%`, `\`,
 * `?`, `#` ni segmentos `.`/`..`/vacíos, tiene que ser canónica, se vuelve a
 * mirar tal como la verá `fetch`, y los buckets son una lista FIJA.
 */

export const LADO_MAXIMO_LOGO = 600;
export const BYTES_MAXIMOS_LOGO = 5 * 1024 * 1024;
/** Lo más largo que se guarda como `logoUrl` (un data URL no entra: se sube el archivo). */
export const LARGO_MAXIMO_LOGO_URL = 2048;
const MS_MAXIMOS = 6_000;
const PIXELES_MAXIMOS = 16_000_000;

/**
 * Lista FIJA de buckets de donde puede salir un logo. `media` es público (ahí
 * guarda `/api/upload` el logo de Ajustes, en `<id>/branding/`); `documents`
 * (el Drive) sólo bajo `tenants/<id>/` del propio negocio. Nunca
 * `adelantos-privado`, `forestal-privado` ni ningún otro.
 */
const BUCKETS_DEL_LOGO: Readonly<Record<string, { publico: boolean }>> = {
  media: { publico: true },
  documents: { publico: false },
};
const RUTA_STORAGE = /^\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/;
const DATA_URL = /^data:(image\/(?:png|jpeg|jpg|webp|gif|avif));base64,([a-z0-9+/=\s]+)$/i;

export interface LogoPng {
  bytes: Buffer;
  ancho: number;
  alto: number;
}

export type OrigenLogo =
  | { tipo: "data"; base64: string }
  | { tipo: "bucket"; bucket: string; ruta: string; publico: boolean }
  | { tipo: "archivo"; ruta: string }
  | { tipo: "bloqueado"; motivo: string };

interface Entorno {
  supabaseUrl?: string | null;
  baseUrl?: string | null;
}

const bloqueado = (motivo: string): OrigenLogo => ({ tipo: "bloqueado", motivo });

const hostDe = (url: string | null | undefined): string | null => {
  try {
    return url ? new URL(url).host.toLowerCase() : null;
  } catch {
    return null;
  }
};

/**
 * Decodifica UNA vez y exige que lo que queda ya sea el camino final: sin `%`
 * (doble codificación), sin `\`, `?`, `#` ni controles, sin segmentos vacíos,
 * `.` o `..`, y canónico (`normalize(x) === x`). `null` si no.
 */
function rutaCanonica(codificada: string): string | null {
  let ruta: string;
  try {
    ruta = decodeURIComponent(codificada);
  } catch {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (/[%\\?#\u0000-\u001f\u007f]/.test(ruta)) return null;
  const segmentos = ruta.split("/");
  if (segmentos.some((s) => s === "" || s === "." || s === "..")) return null;
  return path.posix.normalize(ruta) === ruta ? ruta : null;
}

const TRUCOS_DE_CAMINO = /%2e|%5c|\\|\/\.{1,2}(?:[/?#]|$)/i;
const IMAGEN_DE_PUBLIC = /\.(?:png|jpe?g|webp|gif|avif)$/i;

/** Un camino de `public/` canónico, que no sea `/api/` ni `/_next/`. */
function caminoDePublic(pathname: string): OrigenLogo {
  const ruta = rutaCanonica(pathname.replace(/^\/+/, ""));
  if (!ruta) return bloqueado("camino de public/ no canónico");
  if (/^(?:api|_next)\//i.test(ruta)) return bloqueado("no es un archivo de public/");
  if (ruta.split("/").some((s) => s.startsWith("."))) return bloqueado("archivo oculto de public/");
  if (!IMAGEN_DE_PUBLIC.test(ruta)) return bloqueado("no es una imagen de public/");
  return { tipo: "archivo", ruta: `/${ruta}` };
}

/**
 * Lo que verá `fetch`: storage-js arma `<supabase>/storage/v1/object/<bucket>/<ruta>`
 * sin codificar. Si el parser de URL lo cambia (normaliza, corta en `?`, …) no
 * es la ruta que se chequeó.
 */
function seVeIgual(supabaseUrl: string, bucket: string, ruta: string): boolean {
  const esperado = `/storage/v1/object/${bucket}/${ruta}`;
  try {
    const visto = new URL(esperado, supabaseUrl).pathname;
    return decodeURIComponent(visto) === esperado;
  } catch {
    return false;
  }
}

/**
 * De dónde se puede bajar este logo, o por qué no. Puro (el entorno entra por
 * parámetro para probarlo); `tenantId` decide qué parte de un bucket privado es suya.
 */
export function origenDelLogo(
  tenantId: string,
  url: string,
  entorno: Entorno = { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, baseUrl: process.env.NEXT_PUBLIC_BASE_URL },
): OrigenLogo {
  const u = url.trim();
  if (!tenantId) return bloqueado("sin negocio");
  const data = DATA_URL.exec(u);
  if (data) {
    if ((data[2].length * 3) / 4 > BYTES_MAXIMOS_LOGO) return bloqueado("data URL muy pesado");
    return { tipo: "data", base64: data[2] };
  }
  // Lo que el parser de URL «arregla» en silencio (`%2e%2e` → `..` → sube de carpeta) se
  // rechaza antes de parsear: un nombre subido nunca trae un punto o una barra codificados.
  if (TRUCOS_DE_CAMINO.test(u)) return bloqueado("camino con puntos o barras escondidos");
  if (u.startsWith("/") && !u.startsWith("//")) return caminoDePublic(u.split(/[?#]/)[0]);

  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return bloqueado("URL mal escrita");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return bloqueado(`protocolo ${parsed.protocol}`);
  if (parsed.username || parsed.password) return bloqueado("URL con usuario");
  const host = parsed.host.toLowerCase();

  if (entorno.supabaseUrl && host === hostDe(entorno.supabaseUrl)) {
    const m = RUTA_STORAGE.exec(parsed.pathname);
    if (!m) return bloqueado("no es un archivo del storage");
    const bucket = m[1];
    const config = Object.hasOwn(BUCKETS_DEL_LOGO, bucket) ? BUCKETS_DEL_LOGO[bucket] : undefined;
    if (!config) return bloqueado(`bucket no permitido: ${bucket}`);
    const ruta = rutaCanonica(m[2]);
    if (!ruta) return bloqueado("camino del storage no canónico");
    const carpeta = `tenants/${tenantId}/`;
    if (!config.publico && !ruta.startsWith(carpeta)) return bloqueado("archivo privado de otro negocio");
    if (!seVeIgual(entorno.supabaseUrl, bucket, ruta)) return bloqueado("la URL se normaliza distinto");
    return { tipo: "bucket", bucket, ruta, publico: config.publico };
  }
  if (host === hostDe(entorno.baseUrl)) return caminoDePublic(parsed.pathname);
  return bloqueado(`host ajeno: ${host}`);
}

/**
 * Lo que entra al guardar Ajustes: vacío/null (sin logo) o una URL de hasta
 * 2048 letras cuyo origen sea propio. Mensaje claro para el 400.
 */
const LogoUrlSchema = z.union([z.null(), z.string().trim().max(LARGO_MAXIMO_LOGO_URL)]);
export function validarLogoUrl(
  tenantId: string,
  valor: unknown,
  entorno?: Entorno,
): { ok: true; valor: string | null } | { ok: false; error: string } {
  const r = LogoUrlSchema.safeParse(valor);
  if (!r.success) return { ok: false, error: `El logo tiene que ser el enlace de una imagen subida (hasta ${LARGO_MAXIMO_LOGO_URL} letras).` };
  if (r.data === null || r.data === "") return { ok: true, valor: r.data };
  const origen = origenDelLogo(tenantId, r.data, entorno);
  if (origen.tipo === "bloqueado") {
    return { ok: false, error: "Ese logo no viene de una imagen subida a tu negocio. Subilo con el botón «Subir logo»." };
  }
  return { ok: true, valor: r.data };
}

async function conTope<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`tardó más de ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Lee el cuerpo cortando al pasar el tope: un «logo» de 500 MB no entra a la memoria. */
async function leerConTope(res: Response): Promise<Buffer | null> {
  if (Number(res.headers.get("content-length") ?? 0) > BYTES_MAXIMOS_LOGO) return null;
  if (!res.body) return null;
  const reader = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BYTES_MAXIMOS_LOGO) {
      await reader.cancel().catch((err: unknown) => logger.warn("[membrete-logo] cortar la descarga falló", { error: String(err) }));
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes);
}

async function bajarBytes(origen: Exclude<OrigenLogo, { tipo: "bloqueado" }>, supabaseUrl: string | undefined): Promise<Buffer | null> {
  if (origen.tipo === "data") return Buffer.from(origen.base64.replace(/\s+/g, ""), "base64");
  if (origen.tipo === "archivo") {
    const raiz = path.join(process.cwd(), "public");
    const archivo = path.join(raiz, origen.ruta);
    if (!archivo.startsWith(raiz + path.sep)) return null;
    const buf = await readFile(archivo);
    return buf.length > BYTES_MAXIMOS_LOGO ? null : buf;
  }
  if (!supabaseUrl) return null;
  if (origen.publico) {
    const url = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${origen.bucket}/${origen.ruta.split("/").map(encodeURIComponent).join("/")}`;
    const host = hostDe(supabaseUrl);
    const res = await safeFetch(url, { allowedHosts: host ? [host.split(":")[0]] : [], timeoutMs: MS_MAXIMOS });
    return res.ok ? leerConTope(res) : null;
  }
  const { data, error } = await conTope(getSupabaseAdmin().storage.from(origen.bucket).download(origen.ruta), MS_MAXIMOS);
  if (error || !data || data.size > BYTES_MAXIMOS_LOGO) return null;
  return Buffer.from(await data.arrayBuffer());
}

type FormatoLogo = "png" | "jpeg" | "webp" | "gif" | "avif";
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * El formato por los primeros bytes, ANTES de dárselo a `sharp`: sólo PNG,
 * JPEG, WebP, GIF y AVIF. SVG (scripts, recursos externos), TIFF y HEIF quedan
 * afuera aunque `sharp` los lea.
 */
export function formatoPorFirma(buf: Buffer): FormatoLogo | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(FIRMA_PNG)) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString("latin1", 0, 6))) return "gif";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp" && ["avif", "avis"].includes(buf.toString("latin1", 8, 12))) return "avif";
  return null;
}

/**
 * Una imagen PNG/JPEG/WebP/GIF/AVIF → PNG con el lado mayor ≤ 600 px, sin
 * agrandar. `null` si no es uno de esos formatos o `sharp` no la lee.
 */
export async function imagenAPng(buf: Buffer): Promise<LogoPng | null> {
  const firma = formatoPorFirma(buf);
  if (!firma) return null;
  const meta = await sharp(buf, { limitInputPixels: PIXELES_MAXIMOS }).metadata();
  // sharp llama «heif» al AVIF; cualquier otro desacuerdo con la firma = no.
  if (meta.format !== (firma === "avif" ? "heif" : firma)) return null;
  const { data, info } = await sharp(buf, { limitInputPixels: PIXELES_MAXIMOS })
    .rotate()
    .resize({ width: LADO_MAXIMO_LOGO, height: LADO_MAXIMO_LOGO, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, ancho: info.width, alto: info.height };
}

/** El logo de este negocio en PNG, o `null` (no hay, no es propio, no carga o no es imagen). Nunca tira. */
export async function bajarLogoPng(tenantId: string, url: string): Promise<LogoPng | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origen = origenDelLogo(tenantId, url, { supabaseUrl, baseUrl: process.env.NEXT_PUBLIC_BASE_URL });
  if (origen.tipo === "bloqueado") {
    logger.warn("[membrete-logo] logo no permitido", { tenantId, motivo: origen.motivo });
    return null;
  }
  try {
    const buf = await bajarBytes(origen, supabaseUrl);
    if (!buf?.length) return null;
    return await imagenAPng(buf);
  } catch (err) {
    logger.warn("[membrete-logo] el logo no se pudo pasar a PNG", { tenantId, origen: origen.tipo, error: String(err) });
    return null;
  }
}
