import "server-only";

import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import {
  ERROR_FORMA,
  ERROR_RED,
  ORDEN_REGIONES,
  REGIONES_HIK,
  RUTAS_HIK,
  leerCamaras,
  leerDireccion,
  leerStreamToken,
  leerToken,
  pedidoCamaras,
  pedidoDireccion,
  pedidoToken,
  type CamaraHik,
  type ErrorHik,
  type Leido,
  type PaginaCamaras,
  type PedidoVideo,
  type RegionHik,
  type StreamTokenHik,
  type TokenHik,
} from "@/lib/camaras/hik-connect-api";

/**
 * Hik-Connect for Teams OpenAPI — la red (ADR-471). Lo puro (pedidos,
 * respuestas, errores) está en `hik-connect-api.ts`.
 *
 * ## Lo que este archivo NUNCA hace
 *
 * Loguear la AppKey, la SecretKey, el token, el appToken ni la URL EZOPEN: con
 * cualquiera de ellos se ve el video de la cuenta. Los logs dicen la ruta, el
 * código de Hikvision y el tenant.
 *
 * ## Caché del token
 *
 * El token dura días (Syscom: 7) y Hikvision limita a 5 pedidos por segundo.
 * Se guarda en memoria por instancia, indexado por tenant + huella de la AppKey
 * (re-vincular con otra cuenta no reusa el token viejo), y se renueva 5 min
 * antes de vencer. Si Hikvision lo da por vencido antes (otra instancia pidió
 * uno nuevo, rotaron la clave), el pedido se repite UNA vez con un token fresco.
 */

const TIMEOUT_MS = 8_000;
const MARGEN_MS = 5 * 60_000;
/** El appToken de EZUIKit no trae vencimiento en la respuesta: se pide de nuevo cada tanto. */
const VIDA_STREAM_TOKEN_MS = 10 * 60_000;
const MAX_PAGINAS = 20;

export interface CredencialesHik {
  appKey: string;
  secretKey: string;
  region: RegionHik;
}

const tokens = new Map<string, TokenHik>();
const streamTokens = new Map<string, StreamTokenHik & { vence: number }>();

const huella = (tenantId: string, c: CredencialesHik) =>
  `${tenantId}:${c.region}:${createHash("sha256").update(c.appKey).digest("hex").slice(0, 16)}`;

/** Al desvincular o re-vincular: lo que había en memoria no se usa más. */
export function olvidarTokens(tenantId: string): void {
  for (const k of [...tokens.keys()]) if (k.startsWith(`${tenantId}:`)) tokens.delete(k);
  for (const k of [...streamTokens.keys()])
    if (k.startsWith(`${tenantId}:`)) streamTokens.delete(k);
}

/** Un pedido a Hikvision: JSON o `null` si no hubo respuesta legible. */
async function llamar(
  url: string,
  metodo: "GET" | "POST",
  cuerpo?: unknown,
  token?: string,
): Promise<unknown> {
  const ruta = new URL(url).pathname;
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Token: token }),
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!r.ok) {
      logger.warn("[hik-connect] HTTP no-2xx", { ruta, status: r.status });
      return null;
    }
    return await r.json().catch((err: unknown) => {
      logger.warn("[hik-connect] respuesta que no es JSON", {
        ruta,
        error: String(err).slice(0, 80),
      });
      return null;
    });
  } catch (err) {
    logger.warn("[hik-connect] sin respuesta", {
      ruta,
      error: err instanceof Error ? err.name : "desconocido",
    });
    return null;
  }
}

const sinRespuesta = <T>(raw: unknown): Leido<T> | null =>
  raw === null ? { ok: false, error: ERROR_RED } : null;

async function pedirToken(c: CredencialesHik, ahora = Date.now()): Promise<Leido<TokenHik>> {
  const raw = await llamar(
    `${REGIONES_HIK[c.region].api}${RUTAS_HIK.token}`,
    "POST",
    pedidoToken(c.appKey, c.secretKey),
  );
  return sinRespuesta<TokenHik>(raw) ?? leerToken(raw, c.region, ahora);
}

async function tokenDe(
  tenantId: string,
  c: CredencialesHik,
  fresco = false,
): Promise<Leido<TokenHik>> {
  const k = huella(tenantId, c);
  const guardado = tokens.get(k);
  if (!fresco && guardado && guardado.vence - MARGEN_MS > Date.now())
    return { ok: true, valor: guardado };
  tokens.delete(k);
  const r = await pedirToken(c);
  if (r.ok) tokens.set(k, r.valor);
  return r;
}

/**
 * Pide algo con token; si Hikvision dice «token vencido/inexistente», pide uno
 * nuevo y repite una sola vez.
 */
async function conToken<T>(
  tenantId: string,
  c: CredencialesHik,
  hacer: (t: TokenHik) => Promise<Leido<T>>,
): Promise<Leido<T>> {
  for (let intento = 0; intento < 2; intento++) {
    const t = await tokenDe(tenantId, c, intento > 0);
    if (!t.ok) return t;
    const r = await hacer(t.valor);
    if (r.ok || r.error.tipo !== "token" || intento > 0) return r;
  }
  return { ok: false, error: ERROR_FORMA };
}

export interface Prueba {
  region: RegionHik;
}

/**
 * Prueba la AppKey/SecretKey. Con `"auto"`, empieza por América del Sur y sigue
 * con las demás SÓLO mientras Hikvision diga «no conozco esa AppKey»: cualquier
 * otra respuesta (clave incorrecta, sin red) corta, porque probar más regiones
 * no la arregla.
 */
export async function probarCredenciales(
  appKey: string,
  secretKey: string,
  region: RegionHik | "auto",
): Promise<Leido<Prueba>> {
  const orden = region === "auto" ? ORDEN_REGIONES : [region];
  let ultimo: ErrorHik = ERROR_RED;
  for (const r of orden) {
    const t = await pedirToken({ appKey, secretKey, region: r });
    if (t.ok) return { ok: true, valor: { region: r } };
    ultimo = t.error;
    if (t.error.codigo !== "OPEN000001") break;
  }
  return { ok: false, error: ultimo };
}

/** Todas las cámaras de la cuenta del equipo (de a 500, hasta 20 páginas). */
export async function listarCamarasHik(
  tenantId: string,
  c: CredencialesHik,
): Promise<Leido<CamaraHik[]>> {
  return conToken(tenantId, c, async (t) => {
    const todas: CamaraHik[] = [];
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const raw = await llamar(
        `${t.dominioApi}${RUTAS_HIK.camaras}`,
        "POST",
        pedidoCamaras(pagina),
        t.token,
      );
      const r = sinRespuesta<PaginaCamaras>(raw) ?? leerCamaras(raw);
      if (!r.ok) return r;
      todas.push(...r.valor.camaras);
      if (!r.valor.hayMas) break;
    }
    return { ok: true, valor: todas };
  });
}

async function streamTokenDe(
  tenantId: string,
  c: CredencialesHik,
  t: TokenHik,
): Promise<Leido<StreamTokenHik>> {
  const k = huella(tenantId, c);
  const guardado = streamTokens.get(k);
  if (guardado && guardado.vence > Date.now()) return { ok: true, valor: guardado };
  const raw = await llamar(`${t.dominioApi}${RUTAS_HIK.streamToken}`, "GET", undefined, t.token);
  const r = sinRespuesta<StreamTokenHik>(raw) ?? leerStreamToken(raw, c.region);
  if (r.ok) streamTokens.set(k, { ...r.valor, vence: Date.now() + VIDA_STREAM_TOKEN_MS });
  return r;
}

export interface VideoNube extends StreamTokenHik {
  /** URL EZOPEN (sin el código de verificación: lo agrega quien la entrega). */
  url: string;
}

/** Lo que EZUIKit necesita para reproducir: URL EZOPEN, appToken y dominio de video. */
export async function direccionDeVideo(
  tenantId: string,
  c: CredencialesHik,
  pedido: PedidoVideo,
): Promise<Leido<VideoNube>> {
  const cuerpo = pedidoDireccion(pedido);
  if (!cuerpo.ok) return cuerpo;
  return conToken(tenantId, c, async (t) => {
    const [stream, raw] = await Promise.all([
      streamTokenDe(tenantId, c, t),
      llamar(`${t.dominioApi}${RUTAS_HIK.direccion}`, "POST", cuerpo.valor, t.token),
    ]);
    const dir = sinRespuesta<string>(raw) ?? leerDireccion(raw);
    if (!dir.ok) return dir;
    if (!stream.ok) {
      /* Un appToken vencido se pide de nuevo la próxima vez. */
      streamTokens.delete(huella(tenantId, c));
      return stream;
    }
    return { ok: true, valor: { ...stream.valor, url: dir.valor } };
  });
}
