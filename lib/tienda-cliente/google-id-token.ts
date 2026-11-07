import "server-only";

/**
 * lib/tienda-cliente/google-id-token.ts — revisar el ID token que entrega el
 * globito de Google (One Tap / FedCM) ANTES de pasárselo a Supabase (17-10).
 *
 * Supabase vuelve a revisarlo en `signInWithIdToken`; esto es la primera
 * puerta, en casa y sin depender de su configuración:
 *   · firma RS256 con las claves públicas de Google (JWKS),
 *   · `iss` = accounts.google.com, `aud` = nuestro client id,
 *   · `exp`/`iat` con 60 s de holgura de reloj,
 *   · `nonce` = sha256 (hex) del nonce crudo que el servidor guardó en la
 *     cookie httpOnly de este navegador (lo mismo que compara Supabase),
 *   · `email_verified` = true (un correo sin verificar no rellena pedidos).
 *
 * Sin dependencias: `node:crypto` arma la clave desde el JWK y verifica.
 */
import { createHash, createPublicKey, timingSafeEqual, verify, type KeyObject, type webcrypto } from "node:crypto";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { fotoDeGoogle } from "./cuenta-recordada";

export const EMISORES_GOOGLE: readonly string[] = ["accounts.google.com", "https://accounts.google.com"];
/** Cookie httpOnly con el nonce CRUDO (un solo uso, 10 min, sólo viaja a la ruta del canje). */
export const COOKIE_NONCE_GOOGLE = "tienda-gis-nonce";
export const RUTA_COOKIE_NONCE_GOOGLE = "/api/tienda-cliente/google";
const URL_CLAVES_GOOGLE = "https://www.googleapis.com/oauth2/v3/certs";
const HOLGURA_RELOJ_S = 60;

export type MotivoRechazo = "formato" | "alg" | "clave" | "firma" | "iss" | "aud" | "exp" | "nonce" | "correo";

/** Lo único que se usa del token: quién es (sub) y lo que rellena el pedido. */
export interface ReclamosGoogle {
  sub: string;
  email: string | null;
  nombre: string | null;
  foto: string | null;
}

export type ResultadoIdToken = { ok: true; reclamos: ReclamosGoogle } | { ok: false; motivo: MotivoRechazo };

export type BuscarClave = (kid: string) => Promise<KeyObject | null>;

export interface OpcionesVerificacion {
  /** Client id web de Google (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`). */
  audiencia: string;
  /** sha256 hex del nonce crudo de la cookie. */
  nonceHash: string;
  /** Por defecto, las claves públicas de Google; los tests pasan la suya. */
  buscarClave?: BuscarClave;
  /** Segundos epoch; por defecto, ahora. */
  ahoraS?: number;
}

/** sha256 hex: lo que va a Google como `nonce` y lo que trae el token. */
export function hashNonce(crudo: string): string {
  return createHash("sha256").update(crudo, "utf8").digest("hex");
}

const cabeceraSchema = z.object({ alg: z.string(), kid: z.string().min(1).max(128) });
const reclamosSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string().min(1).max(255),
  exp: z.number(),
  iat: z.number().optional(),
  nonce: z.string().optional(),
  email: z.string().optional(),
  /* Google lo manda booleano; se acepta "true" por si algún emisor lo serializa como texto. */
  email_verified: z.union([z.boolean(), z.literal("true"), z.literal("false")]).optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

function jsonDeBase64Url(parte: string): unknown {
  try {
    return JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function mismoTexto(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

const rechazo = (motivo: MotivoRechazo): ResultadoIdToken => ({ ok: false, motivo });

/** Revisa firma, emisor, audiencia, vencimiento y nonce. Nunca tira. */
export async function verificarIdTokenGoogle(token: string, op: OpcionesVerificacion): Promise<ResultadoIdToken> {
  const partes = token.split(".");
  if (partes.length !== 3 || partes.some((p) => p.length === 0)) return rechazo("formato");
  const [crudoCabecera, crudoCuerpo, crudoFirma] = partes;

  const cabecera = cabeceraSchema.safeParse(jsonDeBase64Url(crudoCabecera));
  if (!cabecera.success) return rechazo("formato");
  // Sólo RS256: nada de `none` ni de HS256 con la clave pública como secreto.
  if (cabecera.data.alg !== "RS256") return rechazo("alg");
  const cuerpo = reclamosSchema.safeParse(jsonDeBase64Url(crudoCuerpo));
  if (!cuerpo.success) return rechazo("formato");

  const clave = await (op.buscarClave ?? clavePublicaGoogle)(cabecera.data.kid).catch(() => null);
  if (!clave) return rechazo("clave");
  let firmaOk = false;
  try {
    firmaOk = verify("RSA-SHA256", Buffer.from(`${crudoCabecera}.${crudoCuerpo}`), clave, Buffer.from(crudoFirma, "base64url"));
  } catch {
    firmaOk = false;
  }
  if (!firmaOk) return rechazo("firma");

  const r = cuerpo.data;
  if (!EMISORES_GOOGLE.includes(r.iss)) return rechazo("iss");
  const audiencias = Array.isArray(r.aud) ? r.aud : [r.aud];
  if (!audiencias.includes(op.audiencia)) return rechazo("aud");
  const ahora = op.ahoraS ?? Math.floor(Date.now() / 1000);
  if (r.exp + HOLGURA_RELOJ_S < ahora) return rechazo("exp");
  if (r.iat !== undefined && r.iat - HOLGURA_RELOJ_S > ahora) return rechazo("exp");
  if (!r.nonce || !mismoTexto(r.nonce, op.nonceHash)) return rechazo("nonce");
  if (!r.email?.trim() || (r.email_verified !== true && r.email_verified !== "true")) return rechazo("correo");

  return {
    ok: true,
    reclamos: {
      sub: r.sub,
      email: r.email?.trim() || null,
      nombre: r.name?.trim() || null,
      foto: fotoDeGoogle(r.picture),
    },
  };
}

/* ── Claves públicas de Google (JWKS) con caché en memoria ─────────────────
   Google las rota cada pocos días y avisa la vigencia en `Cache-Control`.
   Un `kid` desconocido vuelve a bajar la lista, como mucho una vez por minuto
   (un token inventado con `kid` al azar no puede hacernos golpear a Google). */
const jwkSchema = z.object({ kid: z.string(), kty: z.literal("RSA"), n: z.string(), e: z.string() }).passthrough();
const jwksSchema = z.object({ keys: z.array(z.unknown()) });

let cache: { claves: Map<string, KeyObject>; venceEn: number; bajadaEn: number } | null = null;

async function bajarClaves(): Promise<void> {
  const res = await fetch(URL_CLAVES_GOOGLE, { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`JWKS de Google respondió ${res.status}`);
  const lista = jwksSchema.safeParse(await res.json());
  if (!lista.success) throw new Error("JWKS de Google con forma desconocida");
  const claves = new Map<string, KeyObject>();
  for (const k of lista.data.keys) {
    const jwk = jwkSchema.safeParse(k);
    if (!jwk.success) continue;
    try {
      claves.set(jwk.data.kid, createPublicKey({ key: jwk.data as webcrypto.JsonWebKey, format: "jwk" }));
    } catch {
      /* una clave rota no tumba las demás */
    }
  }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1]);
  const vigenciaMs = Number.isFinite(maxAge) && maxAge > 0 ? Math.min(maxAge, 86_400) * 1000 : 3_600_000;
  const ahora = Date.now();
  cache = { claves, venceEn: ahora + vigenciaMs, bajadaEn: ahora };
}

/* Una sola bajada a la vez (los pedidos que llegan juntos esperan la misma) y,
   si Google no responde, 30 s de pausa: mientras tanto se usa lo que haya en
   caché y el resto se rechaza con «clave» (security 17-10). */
const PAUSA_TRAS_FALLO_MS = 30_000;
let bajando: Promise<void> | null = null;
let pausaHasta = 0;

function bajarUnaVez(): Promise<void> {
  bajando ??= bajarClaves()
    .catch((err: unknown) => {
      pausaHasta = Date.now() + PAUSA_TRAS_FALLO_MS;
      logger.warn("[tienda-cliente/google] no se pudieron bajar las claves de Google", { error: String(err) });
    })
    .finally(() => {
      bajando = null;
    });
  return bajando;
}

export async function clavePublicaGoogle(kid: string): Promise<KeyObject | null> {
  const ahora = Date.now();
  const vencida = !cache || ahora > cache.venceEn;
  const desconocida = cache !== null && !cache.claves.has(kid) && ahora - cache.bajadaEn > 60_000;
  if ((vencida || desconocida) && ahora >= pausaHasta) await bajarUnaVez();
  return cache?.claves.get(kid) ?? null;
}

/** Sólo tests. */
export function __reiniciarClavesGoogle(): void {
  cache = null;
  bajando = null;
  pausaHasta = 0;
}
