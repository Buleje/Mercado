/**
 * Clave de un enlace público (carpeta `/c/<token>` o documento `/d/<token>`)
 * fuera de la dirección web (23-10, Brandon: «hoy la clave viaja en la dirección
 * y queda en el historial»).
 *
 * La clave se manda UNA vez en el cuerpo de un POST. Si acierta, el servidor
 * deja una cookie de acceso por enlace: HttpOnly, SameSite=Strict, atada a la
 * ruta de la API de ESE enlace y firmada con HMAC sobre
 * tipo + token + hash guardado de la clave + vencimiento. Así:
 *  - el `<iframe>`, el `<img>` y el `<a download>` (que no pueden mandar
 *    cabeceras) abren el archivo sin que la clave aparezca en ninguna URL;
 *  - si la clave del enlace cambia, la firma deja de cerrar y la cookie no sirve;
 *  - si el enlace se revoca o vence, la ruta ya no lo encuentra.
 *
 * El hash guardado sigue siendo el sha256 hex de siempre (hay enlaces vivos).
 * Sin dependencias de Next: lo usan las rutas y los tests.
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";

export type TipoEnlace = "carpeta" | "documento";

/** Mismo nombre para todos: la ruta de cada cookie es la que separa un enlace de otro. */
export const COOKIE_ENLACE = "bsm_enlace_clave";

/** Media hora: lo que dura mirar unos papeles; después se vuelve a poner la clave. */
export const VIDA_COOKIE_ENLACE_SEG = 30 * 60;

/** Largo tope de la clave (el mismo con que se crea el enlace). */
export const MAX_LARGO_CLAVE = 120;

/** Ruta de la API pública del enlace: sólo esos pedidos llevan la cookie. */
export function rutaCookieEnlace(tipo: TipoEnlace, token: string): string {
  return tipo === "carpeta" ? `/api/public/folders/${token}` : `/api/public/documents/${token}`;
}

/** sha256 hex, el formato que guarda `DocumentsDB` al crear el enlace. */
function hashClave(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * ¿La clave escrita es la del enlace? En tiempo constante. Sin clave guardada,
 * el enlace no la pide (true), igual que `DocumentsDB.verifySharePassword`.
 */
export function claveCoincide(guardado: string | null, intento: string): boolean {
  if (!guardado) return true;
  const a = Buffer.from(hashClave(intento), "hex");
  const b = Buffer.from(guardado, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Llave del HMAC derivada de `AUTH_SECRET` (no la misma con que se firman las
 * sesiones). Sin secreto no hay cookie: falla cerrado y se vuelve a pedir la clave.
 */
function llave(): Buffer | null {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) return null;
  return createHmac("sha256", s).update("enlace-con-clave:v1").digest();
}

function firma(k: Buffer, tipo: TipoEnlace, token: string, guardado: string, vence: number): Buffer {
  return createHmac("sha256", k).update(`${tipo}\n${token}\n${guardado}\n${vence}`).digest();
}

/** Valor de la cookie: `<vence en segundos>.<firma base64url>`, o null sin secreto. */
export function firmarCookieEnlace(
  tipo: TipoEnlace,
  token: string,
  guardado: string,
  ahoraMs: number = Date.now(),
): string | null {
  const k = llave();
  if (!k) return null;
  const vence = Math.floor(ahoraMs / 1000) + VIDA_COOKIE_ENLACE_SEG;
  return `${vence}.${firma(k, tipo, token, guardado, vence).toString("base64url")}`;
}

const FORMATO_COOKIE = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

/** ¿La cookie abre ESTE enlace con ESTA clave guardada, y no venció? */
export function cookieEnlaceValida(
  valor: string | undefined | null,
  tipo: TipoEnlace,
  token: string,
  guardado: string,
  ahoraMs: number = Date.now(),
): boolean {
  if (!valor) return false;
  const m = FORMATO_COOKIE.exec(valor);
  if (!m) return false;
  const vence = Number(m[1]);
  const ahora = Math.floor(ahoraMs / 1000);
  // Vencida, o con un vencimiento más largo que el que firmamos nunca.
  if (vence <= ahora || vence > ahora + VIDA_COOKIE_ENLACE_SEG + 60) return false;
  const k = llave();
  if (!k) return false;
  const esperada = firma(k, tipo, token, guardado, vence);
  const recibida = Buffer.from(m[2], "base64url");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/**
 * Cabecera `Set-Cookie` de la cookie de un enlace. Va armada a mano y se agrega
 * con `headers.append`: `res.cookies.set` guarda UNA cookie por nombre, así que
 * con 10 carpetas sólo quedaba la última (todas se llaman igual y las separa la ruta).
 */
export function cabeceraCookieEnlace(tipo: TipoEnlace, token: string, valor: string): string {
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_ENLACE}=${valor}; Path=${rutaCookieEnlace(tipo, token)}; Max-Age=${VIDA_COOKIE_ENLACE_SEG}; HttpOnly; SameSite=Strict${seguro}`;
}
