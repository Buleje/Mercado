/**
 * Agenda → Google (ADR-501 §5b): el OAuth PROPIO de la agenda. No es el login de
 * clientes (`lib/auth/oauth-google.ts`, que crea un `Customer` y fija su redirect):
 * reusa sólo `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
 *
 *  · `state` = base64url(JSON {t: tenantId, u: usuario, n: nonce, e: vence}) + "." +
 *    HMAC-SHA256 con una clave derivada de `AUTH_SECRET` sólo para esto. Lo arma
 *    `conectar` con la sesión verificada; el callback no tiene sesión (la cookie del
 *    panel es SameSite=Strict y no viaja en la vuelta desde accounts.google.com), así
 *    que el negocio y el usuario salen SÓLO de un state firmado, vigente y cuyo nonce
 *    coincide con la cookie httpOnly que dejó `conectar` en este mismo navegador.
 *  · PKCE S256: el verificador = HMAC(nonce), no se guarda en ningún lado.
 *  · `calendar.app.created`: la app sólo ve el calendario que ella crea, no la agenda
 *    personal. `tasks` es opcional (consentimiento granular: puede destildarlo).
 */
import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cacheStore } from "@/lib/cache";
import { descifrarSecreto } from "@/lib/cripto-secretos";

export const URL_CONSENTIMIENTO_GOOGLE = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_REVOCAR = "https://oauth2.googleapis.com/revoke";

export const SCOPE_CALENDARIO = "https://www.googleapis.com/auth/calendar.app.created";
export const SCOPE_TAREAS = "https://www.googleapis.com/auth/tasks";
export const SCOPES_AGENDA_GOOGLE = [SCOPE_CALENDARIO, SCOPE_TAREAS, "openid", "email"] as const;

/**
 * La vuelta desde Google. Bajo `/api/public/`: en `/api/admin/*` el proxy responde 401
 * sin la cookie del panel, y esa cookie (Strict) no llega desde accounts.google.com.
 * Hay que darla de alta tal cual en Google Cloud Console por cada dominio del panel.
 */
export const RUTA_CALLBACK_GOOGLE = "/api/public/agenda-google/callback";
/** Cookie del nonce: Lax para que SÍ viaje en la vuelta (navegación GET de primer nivel). */
export const COOKIE_NONCE_GOOGLE = "agenda-google-nonce";
export const VIDA_STATE_MS = 10 * 60_000;
/** A dónde vuelve el navegador al terminar (la pestaña de la agenda, vista Conectar). */
export const RUTA_VUELTA_PANEL = "/admin?tab=administracion&vista=conectar";

const TIMEOUT_MS = 15_000;

// ── Credenciales ────────────────────────────────────────────────────────────

export interface CredencialesGoogle {
  clientId: string;
  clientSecret: string;
}

/** null = no configurado (las rutas responden «no configurado», nunca 500). */
export function credencialesGoogle(): CredencialesGoogle | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !process.env.AUTH_SECRET?.trim()) return null;
  return { clientId, clientSecret };
}

function claveState(): Buffer {
  return createHash("sha256").update(`agenda-google-state:v1:${process.env.AUTH_SECRET ?? ""}`).digest();
}

// ── State firmado ───────────────────────────────────────────────────────────

export interface StateGoogle {
  /** tenantId (CUID del JWT) */
  t: string;
  /** usuario del panel (`auth.username`: la sesión no trae id) */
  u: string;
  /** nonce, el mismo de la cookie */
  n: string;
  /** vence (ms epoch) */
  e: number;
}

export function nuevoNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function firmarState(datos: StateGoogle): string {
  const cuerpo = Buffer.from(JSON.stringify(datos), "utf8").toString("base64url");
  const firma = createHmac("sha256", claveState()).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

/** null = mal formado, firma que no cierra, vencido o sin los campos. Nunca tira. */
export function leerState(state: string, ahora = Date.now()): StateGoogle | null {
  try {
    const [cuerpo, firma, sobra] = state.split(".");
    if (!cuerpo || !firma || sobra !== undefined) return null;
    const esperada = createHmac("sha256", claveState()).update(cuerpo).digest();
    const recibida = Buffer.from(firma, "base64url");
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as Partial<StateGoogle>;
    if (typeof datos.t !== "string" || typeof datos.u !== "string" || typeof datos.n !== "string" || typeof datos.e !== "number") {
      return null;
    }
    if (!datos.t || !datos.u || !datos.n || datos.e < ahora) return null;
    return { t: datos.t, u: datos.u, n: datos.n, e: datos.e };
  } catch {
    return null;
  }
}

/** Comparación en tiempo constante del nonce del state contra el de la cookie. */
export function mismoNonce(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ── PKCE ────────────────────────────────────────────────────────────────────

export function verificadorPkce(nonce: string): string {
  return createHmac("sha256", claveState()).update(`pkce:${nonce}`).digest("base64url");
}

function desafioPkce(verificador: string): string {
  return createHash("sha256").update(verificador).digest("base64url");
}

// ── URL de consentimiento ───────────────────────────────────────────────────

export function urlDeConsentimiento(opts: { clientId: string; redirectUri: string; state: string; nonce: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: SCOPES_AGENDA_GOOGLE.join(" "),
    access_type: "offline",
    // consent: sin esto, una segunda conexión no trae refresh_token.
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: desafioPkce(verificadorPkce(opts.nonce)),
    code_challenge_method: "S256",
  });
  return `${URL_CONSENTIMIENTO_GOOGLE}?${params.toString()}`;
}

// ── Errores ─────────────────────────────────────────────────────────────────

/** `razon` = el `error` de Google (p. ej. `invalid_grant` = token revocado o vencido). */
export class ErrorGoogle extends Error {
  constructor(
    readonly status: number,
    readonly razon: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorGoogle";
  }
  /** true = el permiso ya no sirve: hay que reconectar (no es un corte pasajero). */
  get esPermisoPerdido(): boolean {
    return this.razon === "invalid_grant" || this.razon === "sin_token" || this.status === 401;
  }
}

async function cuerpoJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const j: unknown = await res.json();
    return j && typeof j === "object" ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

// ── Canje del código ────────────────────────────────────────────────────────

export interface TokensCanjeados {
  refreshToken: string;
  accessToken: string;
  expiraEnSeg: number;
  scopes: string[];
  email: string;
}

/** Lee el email del id_token. Llegó directo del endpoint de tokens por TLS (OIDC §3.1.3.7): se validan aud/iss, no la firma. */
function emailDelIdToken(idToken: string | null, clientId: string): string | null {
  if (!idToken) return null;
  try {
    const partes = idToken.split(".");
    if (partes.length !== 3) return null;
    const p = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const iss = texto(p.iss);
    if (p.aud !== clientId || (iss !== "https://accounts.google.com" && iss !== "accounts.google.com")) return null;
    if (p.email_verified === false) return null;
    return texto(p.email);
  } catch {
    return null;
  }
}

export async function canjearCodigo(
  cred: CredencialesGoogle,
  code: string,
  redirectUri: string,
  verificador: string,
): Promise<TokensCanjeados> {
  const res = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verificador,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await cuerpoJson(res);
  if (!res.ok) throw new ErrorGoogle(res.status, texto(j.error) ?? "canje", texto(j.error_description) ?? "Google no aceptó el código");
  const refreshToken = texto(j.refresh_token);
  const accessToken = texto(j.access_token);
  if (!refreshToken || !accessToken) throw new ErrorGoogle(400, "sin_refresh", "Google no devolvió permiso permanente");
  const email = emailDelIdToken(texto(j.id_token), cred.clientId);
  if (!email) throw new ErrorGoogle(400, "sin_email", "Google no devolvió el correo de la cuenta");
  const scopes = (texto(j.scope) ?? "").split(/\s+/).filter(Boolean);
  const expira = typeof j.expires_in === "number" ? j.expires_in : 3600;
  return { refreshToken, accessToken, expiraEnSeg: expira, scopes, email };
}

// ── Token de acceso (desde el refresh guardado) ─────────────────────────────

const claveAcceso = (conexionId: string) => `agenda-google-at:${conexionId}`;

export function recordarTokenDeAcceso(conexionId: string, accessToken: string, expiraEnSeg: number): void {
  const vida = Math.max(60, expiraEnSeg - 60);
  cacheStore.set(claveAcceso(conexionId), accessToken, vida);
}

export function olvidarTokenDeAcceso(conexionId: string): void {
  cacheStore.del(claveAcceso(conexionId));
}

/**
 * Token de acceso vigente (caché por conexión, 1 min antes de que venza).
 * Tira `ErrorGoogle`: `esPermisoPerdido` = marcar la conexión en «error».
 */
export async function tokenDeAcceso(conexion: { id: string; refreshTokenCifrado: string }): Promise<string> {
  const enCache = cacheStore.get<string>(claveAcceso(conexion.id));
  if (enCache) return enCache;
  const cred = credencialesGoogle();
  if (!cred) throw new ErrorGoogle(503, "no_configurado", "Google no está configurado en este servidor");
  const refresh = descifrarSecreto(conexion.refreshTokenCifrado);
  if (!refresh) throw new ErrorGoogle(401, "sin_token", "El permiso guardado no se puede leer: hay que volver a conectar");
  const res = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await cuerpoJson(res);
  const token = texto(j.access_token);
  if (!res.ok || !token) {
    throw new ErrorGoogle(res.status, texto(j.error) ?? "refresh", texto(j.error_description) ?? "Google no renovó el permiso");
  }
  recordarTokenDeAcceso(conexion.id, token, typeof j.expires_in === "number" ? j.expires_in : 3600);
  return token;
}

/** Revoca el permiso en Google (best effort: si Google no contesta, el token igual se borra de Buleje). */
export async function revocarEnGoogle(refreshTokenCifrado: string): Promise<boolean> {
  const refresh = descifrarSecreto(refreshTokenCifrado);
  if (!refresh) return false;
  const res = await fetch(URL_REVOCAR, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refresh }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok;
}

// ── Llamadas a las APIs ─────────────────────────────────────────────────────

export interface RespuestaGoogle {
  status: number;
  json: Record<string, unknown>;
}

/** fetch con el token y timeout. No tira por status: decide el llamador. */
export async function llamarGoogle(
  accessToken: string,
  url: string,
  init: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<RespuestaGoogle> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, json: res.status === 204 ? {} : await cuerpoJson(res) };
}

/** Convierte una respuesta no-2xx en ErrorGoogle con el motivo que da Google. */
export function errorDe(r: RespuestaGoogle, que: string): ErrorGoogle {
  const err = r.json.error;
  const razon =
    err && typeof err === "object"
      ? (texto((err as Record<string, unknown>).status) ?? "api")
      : (texto(err) ?? "api");
  const msg =
    err && typeof err === "object" ? (texto((err as Record<string, unknown>).message) ?? que) : (texto(r.json.error_description) ?? que);
  return new ErrorGoogle(r.status, razon, `${que}: ${msg}`);
}

// ── Origen de la petición ───────────────────────────────────────────────────

const HOST_VALIDO = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * «https://host» con el que entró la petición, o null si no hay petición (un job)
 * o el host no tiene forma de host. Sin respaldo a NEXT_PUBLIC_BASE_URL: hoy apunta
 * a un dominio que no existe y un redirect_uri roto sería peor que ninguno.
 */
export async function origenActual(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]?.trim() ?? "";
    if (!HOST_VALIDO.test(host)) return null;
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) || /\.localhost(:\d+)?$/i.test(host);
    const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0]?.trim();
    const esquema = proto === "http" || proto === "https" ? proto : local ? "http" : "https";
    return `${esquema}://${host}`;
  } catch {
    return null;
  }
}
