import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";
import { TV_ALFABETO, TV_CODIGO_LARGO } from "@/lib/camaras/pantallas-tv";

/**
 * La credencial del televisor (ADR-473): un JWT HS256 con `typ: "tv"` y los
 * claims `{ tid, pid }` (negocio y pantalla). Se firma a mano con `node:crypto`
 * —el repo no trae `jose`— y con una clave DERIVADA de `AUTH_SECRET`
 * (HMAC(AUTH_SECRET, "buleje-tv/v1")), no con `AUTH_SECRET` crudo:
 *
 *  · la sesión del panel (`lib/session.ts`) firma HMAC-SHA256 con el secreto
 *    crudo sobre `<payload>`; un JWT firmado con la MISMA clave sobre
 *    `<header>.<payload>` es la misma primitiva con la misma clave. Con la clave
 *    derivada ninguna firma de un formato sirve para el otro: el token del TV
 *    no abre `/api/admin/**` ni aunque alguien lo pegue en la cookie del panel.
 *  · rotar `AUTH_SECRET` (con `AUTH_SECRET_PREVIOUS`) rota también esta clave.
 */

const ETIQUETA_CLAVE = "buleje-tv/v1";
const HEADER = { alg: "HS256", typ: "JWT" } as const;

export interface ClaimsTv {
  typ: "tv";
  /** tenantId: el ÚNICO lugar de donde el TV saca su negocio. */
  tid: string;
  /** id de la `PantallaTv`. */
  pid: string;
  iat: number;
  /** Segundos epoch = `expiraEn` de la pantalla. */
  exp: number;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function clavesActivas(): Buffer[] {
  const actual = requireEnv("AUTH_SECRET");
  const previa = process.env.AUTH_SECRET_PREVIOUS;
  const secretos = previa && previa !== actual ? [actual, previa] : [actual];
  return secretos.map((s) => createHmac("sha256", s).update(ETIQUETA_CLAVE).digest());
}

const firmar = (clave: Buffer, datos: string) => createHmac("sha256", clave).update(datos).digest();

export function firmarTokenTv(datos: { tid: string; pid: string; expiraEn: string }, ahora = Date.now()): string {
  const claims: ClaimsTv = {
    typ: "tv",
    tid: datos.tid,
    pid: datos.pid,
    iat: Math.floor(ahora / 1000),
    exp: Math.floor(new Date(datos.expiraEn).getTime() / 1000),
  };
  const cuerpo = `${b64u(JSON.stringify(HEADER))}.${b64u(JSON.stringify(claims))}`;
  return `${cuerpo}.${b64u(firmar(clavesActivas()[0]!, cuerpo))}`;
}

/** Los claims si la firma, el tipo y el vencimiento están bien; si no, `null`. Nunca tira. */
export function verificarTokenTv(token: string | undefined | null, ahora = Date.now()): ClaimsTv | null {
  if (!token || token.length > 2048) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [h, p, s] = partes as [string, string, string];
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as Record<string, unknown>;
    /* `alg` fijo: ni `none` ni otro algoritmo que alguien escriba en el header. */
    if (header.alg !== "HS256") return null;
    const firma = Buffer.from(s, "base64url");
    const valida = clavesActivas().some((k) => {
      const esperada = firmar(k, `${h}.${p}`);
      return esperada.length === firma.length && timingSafeEqual(esperada, firma);
    });
    if (!valida) return null;
    const c = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>;
    if (c.typ !== "tv") return null;
    if (typeof c.tid !== "string" || !c.tid || typeof c.pid !== "string" || !c.pid) return null;
    if (typeof c.exp !== "number" || c.exp * 1000 <= ahora) return null;
    return { typ: "tv", tid: c.tid, pid: c.pid, iat: typeof c.iat === "number" ? c.iat : 0, exp: c.exp };
  } catch {
    return null;
  }
}

// ── Código y secreto del emparejamiento ────────────────────────────────────

/** 6 caracteres del alfabeto del contrato, con `crypto.randomInt` (CSPRNG). */
export function nuevoCodigoTv(): string {
  let c = "";
  for (let i = 0; i < TV_CODIGO_LARGO; i++) c += TV_ALFABETO[randomInt(TV_ALFABETO.length)];
  return c;
}

/** 32 bytes al azar: sólo lo conoce el TV que pidió el código. */
export const nuevoSecretoTv = () => randomBytes(32).toString("base64url");

/** Se guarda el hash, nunca el secreto: quien lea Redis no puede hacerse pasar por el TV. */
export const hashSecretoTv = (secreto: string) => createHash("sha256").update(secreto).digest("hex");

/** Compara en tiempo constante el secreto que trae el TV con el hash guardado. */
export function secretoTvCoincide(secreto: string, hashGuardado: string): boolean {
  const a = Buffer.from(hashSecretoTv(secreto), "hex");
  const b = Buffer.from(hashGuardado, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
