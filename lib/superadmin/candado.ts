import "server-only";
import { createHash, createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { PlatformSettingsDB, PREFIJO_INTERNO } from "@/lib/db/platform-settings.db";
import { hashUA } from "@/lib/superadmin-session";
import { SuperadminTotpDB } from "@/lib/db/admin-totp.db";
import { requireTotpStepUp } from "@/lib/auth/totp-step-up";
import { TipoCandadoSchema, secretoValido, type TipoCandado } from "@/lib/superadmin/candado-reglas";

/**
 * lib/superadmin/candado.ts — el candado personal del superadmin para ver las
 * credenciales de una tienda (pestaña «Credenciales» de la ficha).
 *
 * Qué guarda: `{ tipo, hash bcrypt 12, fallos, bloqueadoHasta }` en
 * `PlatformSetting`, una clave por superadmin. La clave lleva el prefijo
 * `interno:` a propósito: así NUNCA viaja en `PlatformSettingsDB.getAll()`, que
 * `GET /api/superadmin/settings` devuelve entero (el hash quedaría a la vista) y
 * que cada escritura de configuración invalida para toda la plataforma.
 *
 * Intentos: 5 fallos seguidos bloquean el candado; cada bloqueo seguido dobla el
 * anterior (15 min, 30, 1 h… tope 24 h) y sólo un acierto vuelve el contador a
 * cero. Configurarlo por primera vez, recuperarlo o borrarlo exige reautenticar
 * (contraseña del superadmin + 2FA si lo tiene). La comparación corre
 * DENTRO de `PlatformSettingsDB.actualizar` (candado por clave en la base): dos
 * intentos simultáneos hacen fila, así que nunca entran más de 5 antes del bloqueo
 * aunque el atacante dispare en paralelo desde varias instancias.
 *
 * Desbloqueo: una cookie httpOnly de 5 min firmada con HMAC-SHA256 (clave
 * derivada de AUTH_SECRET por HKDF, distinta de la de las sesiones), atada al
 * usuario, al navegador (hash del User-Agent) y a la versión del candado: cambiar
 * o borrar el candado anula los desbloqueos vigentes.
 *
 * (El pedido decía jose; `jose` no está instalado en el repo y el resto de las
 * firmas de sesión usan HMAC propio — mismo nivel, sin dependencia nueva.)
 */

export const CANDADO_COOKIE = "sa-candado-cred";
/** La cookie sólo viaja a las rutas de la API del superadmin. */
export const CANDADO_COOKIE_PATH = "/api/superadmin";
export const DESBLOQUEO_MS = 5 * 60 * 1000;
export const MAX_FALLOS = 5;
/** El primer bloqueo; cada bloqueo seguido (sin un acierto en medio) dobla el anterior. */
export const BLOQUEO_MS = 15 * 60 * 1000;
export const BLOQUEO_MAX_MS = 24 * 60 * 60 * 1000;
const BCRYPT_COSTO = 12;
const PROPOSITO = "candado-credenciales";

export function claveCandado(username: string): string {
  return `${PREFIJO_INTERNO}candado-credenciales:${username}`;
}

/** Duración del bloqueo número `n` (1 = el primero): 15 min, 30 min, 1 h, 2 h… con tope de 24 h. */
export function duracionBloqueo(n: number): number {
  const k = Math.max(1, Math.trunc(n));
  return k > 12 ? BLOQUEO_MAX_MS : Math.min(BLOQUEO_MAX_MS, BLOQUEO_MS * 2 ** (k - 1));
}

const GuardadoSchema = z.object({
  tipo: TipoCandadoSchema,
  hash: z.string().min(20),
  creadoEn: z.string(),
  actualizadoEn: z.string(),
  /** Cambia en cada configuración: los desbloqueos emitidos con otra versión dejan de valer. */
  version: z.string().min(1),
  fallos: z.number().int().min(0).default(0),
  bloqueadoHasta: z.number().nullable().default(null),
  /** Bloqueos seguidos; sólo un acierto lo vuelve a 0 (no el paso del tiempo). */
  bloqueos: z.number().int().min(0).default(0),
});
type Guardado = z.infer<typeof GuardadoSchema>;

function leerGuardado(v: unknown): Guardado | null {
  const r = GuardadoSchema.safeParse(v);
  return r.success ? r.data : null;
}

const bloqueoVigente = (g: Guardado, ahora: number): number | null =>
  g.bloqueadoHasta != null && g.bloqueadoHasta > ahora ? g.bloqueadoHasta : null;

export interface EstadoCandado {
  configurado: boolean;
  tipo: TipoCandado | null;
  bloqueadoHasta: number | null;
  /** Marca de la versión del candado (cambia al reconfigurarlo). */
  version: string | null;
}

/** Estado del candado, leído de la base (sin caché: el bloqueo tiene que verse ya). */
export async function estadoCandado(username: string, ahora = Date.now()): Promise<EstadoCandado> {
  const g = leerGuardado(await PlatformSettingsDB.getFresco<unknown>(claveCandado(username)));
  if (!g) return { configurado: false, tipo: null, bloqueadoHasta: null, version: null };
  return { configurado: true, tipo: g.tipo, bloqueadoHasta: bloqueoVigente(g, ahora), version: g.version };
}

export type ResultadoIntento =
  /** `version` = la del candado con que se abrió (leída en la misma transacción). */
  | { ok: true; version: string }
  | { ok: false; motivo: "sin_candado" }
  | { ok: false; motivo: "requiere_actual" }
  | { ok: false; motivo: "requiere_reauth" }
  | { ok: false; motivo: "invalido"; mensaje: string }
  /** `nuevo` = este intento abrió el bloqueo (se audita); `numero` = bloqueo seguido nº. */
  | { ok: false; motivo: "bloqueado"; hasta: number; nuevo: boolean; numero: number }
  | { ok: false; motivo: "incorrecto"; restantes: number };

/**
 * Compara `intento` con el candado guardado y devuelve el valor a grabar
 * (contadores al día) junto con el resultado. Un secreto con la forma de otro
 * tipo (un PIN cuando el candado es patrón) cuenta como fallo.
 */
async function intentar(
  g: Guardado,
  intento: string,
  ahora: number,
): Promise<{ valor?: Guardado; resultado: ResultadoIntento }> {
  const hasta = bloqueoVigente(g, ahora);
  if (hasta) return { resultado: { ok: false, motivo: "bloqueado", hasta, nuevo: false, numero: g.bloqueos } };
  const acierta = secretoValido(g.tipo, intento) && (await compare(intento, g.hash));
  if (acierta) {
    const limpio = g.fallos > 0 || g.bloqueadoHasta != null || g.bloqueos > 0;
    return {
      valor: limpio ? { ...g, fallos: 0, bloqueadoHasta: null, bloqueos: 0 } : undefined,
      resultado: { ok: true, version: g.version },
    };
  }
  const fallos = g.fallos + 1;
  if (fallos >= MAX_FALLOS) {
    const numero = g.bloqueos + 1;
    const bloqueo = ahora + duracionBloqueo(numero);
    return {
      valor: { ...g, fallos: 0, bloqueadoHasta: bloqueo, bloqueos: numero },
      resultado: { ok: false, motivo: "bloqueado", hasta: bloqueo, nuevo: true, numero },
    };
  }
  return {
    valor: { ...g, fallos, bloqueadoHasta: null },
    resultado: { ok: false, motivo: "incorrecto", restantes: MAX_FALLOS - fallos },
  };
}

/** Opciones de la transacción: bcrypt 12 tarda ~0,3-1 s en JS puro. */
const TX = { timeout: 15_000, maxWait: 10_000 };

/** Verifica el secreto del candado (desbloquear). */
export async function verificarCandado(username: string, secreto: string, ahora = Date.now()): Promise<ResultadoIntento> {
  return PlatformSettingsDB.actualizar<unknown, ResultadoIntento>(
    claveCandado(username),
    async (actual) => {
      const g = leerGuardado(actual);
      if (!g) return { resultado: { ok: false, motivo: "sin_candado" } };
      return intentar(g, secreto, ahora);
    },
    username,
    TX,
  );
}

/**
 * Configura el candado.
 *  - Primera vez: exige `reautenticado` (la ruta ya verificó contraseña + 2FA).
 *  - Cambio: exige el actual (`actual`); un fallo cuenta para el bloqueo.
 *  - Recuperación («Olvidé mi candado»): sin `actual` pero `reautenticado`, pisa
 *    el candado aunque esté bloqueado y deja los contadores en cero.
 */
export async function configurarCandado(
  username: string,
  tipo: TipoCandado,
  secreto: string,
  opciones: { actual?: string; reautenticado?: boolean },
  ahora = Date.now(),
): Promise<ResultadoIntento> {
  if (!secretoValido(tipo, secreto)) {
    return { ok: false, motivo: "invalido", mensaje: "El candado nuevo no cumple las reglas de su tipo." };
  }
  const nuevoHash = await hash(secreto, BCRYPT_COSTO);
  return PlatformSettingsDB.actualizar<unknown, ResultadoIntento>(
    claveCandado(username),
    async (valorActual) => {
      const g = leerGuardado(valorActual);
      const instante = new Date(ahora).toISOString();
      if (!g) {
        if (!opciones.reautenticado) return { resultado: { ok: false, motivo: "requiere_reauth" } };
      } else if (opciones.actual) {
        const r = await intentar(g, opciones.actual, ahora);
        if (!r.resultado.ok) return r;
      } else if (!opciones.reautenticado) {
        const hasta = bloqueoVigente(g, ahora);
        return {
          resultado: hasta
            ? { ok: false, motivo: "bloqueado", hasta, nuevo: false, numero: g.bloqueos }
            : { ok: false, motivo: "requiere_actual" },
        };
      }
      const nuevo: Guardado = {
        tipo,
        hash: nuevoHash,
        creadoEn: g?.creadoEn ?? instante,
        actualizadoEn: instante,
        version: randomUUID(),
        fallos: 0,
        bloqueadoHasta: null,
        bloqueos: 0,
      };
      return { valor: nuevo, resultado: { ok: true, version: nuevo.version } };
    },
    username,
    TX,
  );
}

/** Borra el candado (la ruta exige reautenticar antes). Devuelve si había uno. */
export async function borrarCandado(username: string): Promise<boolean> {
  const habia = (await PlatformSettingsDB.getFresco<unknown>(claveCandado(username))) != null;
  await PlatformSettingsDB.delete(claveCandado(username));
  return habia;
}

/* ─────────────────────────── reautenticación ─────────────────────────── */

export interface Reautenticacion {
  contrasena?: string;
  totpCode?: string;
}

export type ResultadoReauth =
  | { ok: true; conTotp: boolean }
  | { ok: false; status: 400 | 422; error: string; message: string };

/** ¿El superadmin tiene el 2FA activo? */
export async function totpActivo(username: string): Promise<boolean> {
  const fila = await SuperadminTotpDB.getByUsername(username);
  return !!(fila?.totpSecret && fila.totpEnabledAt);
}

/** La contraseña del superadmin (la del login: env), comparada en tiempo constante. */
function contrasenaCorrecta(username: string, contrasena: string): boolean {
  const usuario = process.env.SUPERADMIN_USERNAME ?? "platform";
  const esperada = process.env.SUPERADMIN_PASSWORD ?? "";
  if (!esperada || !contrasena || username !== usuario) return false;
  const a = createHash("sha256").update(contrasena).digest();
  const b = createHash("sha256").update(esperada).digest();
  return timingSafeEqual(a, b);
}

/**
 * Reautenticación para configurar el candado por primera vez, recuperarlo o
 * borrarlo: SIEMPRE la contraseña del superadmin y, si tiene 2FA, también el
 * código (`requireTotpStepUp`). Una sesión robada sola no alcanza. Errores en
 * 400/422, nunca 401 (`fetchSuperadmin` mandaría al login).
 */
export async function reautenticar(username: string, r: Reautenticacion | undefined): Promise<ResultadoReauth> {
  const inicio = Date.now();
  if (!r?.contrasena) {
    return { ok: false, status: 400, error: "reauth_requerida", message: "Confirma con tu contraseña de superadmin." };
  }
  // El 2FA se pide ANTES de mirar la contraseña: si se pidiera después, un
  // «falta el código» delataría que la contraseña era buena (oráculo, 2.ª
  // pasada de security 11-10). Con 2FA, contraseña o código errados dan el
  // MISMO error; siempre ≥350 ms, como el login.
  const conTotp = await totpActivo(username);
  if (conTotp && !r.totpCode) {
    return { ok: false, status: 400, error: "totp_requerido", message: "Pon también el código de tu 2FA." };
  }
  const invalida: ResultadoReauth = {
    ok: false,
    status: 422,
    error: "reauth_invalida",
    message: conTotp ? "La contraseña o el código no coinciden." : "La contraseña no coincide.",
  };
  if (!contrasenaCorrecta(username, r.contrasena)) return pisoDeTiempo(inicio, invalida);
  if (conTotp && (await requireTotpStepUp(username, { totpCode: r.totpCode ?? "" }))) {
    return pisoDeTiempo(inicio, invalida);
  }
  return { ok: true, conTotp };
}

/** Responde recién a los 350 ms del inicio: un fallo no se distingue por el tiempo. */
async function pisoDeTiempo<T>(inicio: number, valor: T, minimoMs = 350): Promise<T> {
  const falta = minimoMs - (Date.now() - inicio);
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  return valor;
}

/* ─────────────────────────── desbloqueo (cookie firmada) ─────────────────────────── */

function claveFirma(): Buffer {
  const base = process.env.AUTH_SECRET;
  if (!base) throw new Error("AUTH_SECRET requerido para el candado de credenciales");
  return Buffer.from(hkdfSync("sha256", base, "buleje-candado-credenciales", "desbloqueo-v1", 32));
}

const firmar = (payload: string) => createHmac("sha256", claveFirma()).update(payload).digest("base64url");

interface Desbloqueo {
  p: typeof PROPOSITO;
  /** username del superadmin */
  sub: string;
  /** hash del User-Agent del navegador que desbloqueó */
  ua: string;
  /** versión del candado con que se desbloqueó */
  v: string;
  exp: number;
}

/** Emite el token del desbloqueo (5 min). */
export async function firmarDesbloqueo(
  username: string,
  userAgent: string | null,
  version: string,
  ahora = Date.now(),
): Promise<{ token: string; vence: number }> {
  const vence = ahora + DESBLOQUEO_MS;
  const datos: Desbloqueo = { p: PROPOSITO, sub: username, ua: await hashUA(userAgent), v: version, exp: vence };
  const payload = Buffer.from(JSON.stringify(datos)).toString("base64url");
  return { token: `${payload}.${firmar(payload)}`, vence };
}

/**
 * Lee el token del desbloqueo. Devuelve cuándo vence, o `null` si la firma no
 * cierra, venció, es de otro superadmin, de otro navegador o de otra versión
 * del candado.
 */
export async function leerDesbloqueo(
  token: string | undefined,
  esperado: { username: string; userAgent: string | null; version: string | null },
  ahora = Date.now(),
): Promise<{ vence: number } | null> {
  if (!token || !esperado.version) return null;
  const punto = token.lastIndexOf(".");
  if (punto <= 0) return null;
  const payload = token.slice(0, punto);
  const firma = Buffer.from(token.slice(punto + 1));
  const correcta = Buffer.from(firmar(payload));
  if (firma.length !== correcta.length || !timingSafeEqual(firma, correcta)) return null;
  let d: Partial<Desbloqueo>;
  try {
    d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Desbloqueo>;
  } catch {
    return null;
  }
  if (d.p !== PROPOSITO || d.sub !== esperado.username || d.v !== esperado.version) return null;
  if (typeof d.exp !== "number" || d.exp <= ahora) return null;
  if (d.ua !== (await hashUA(esperado.userAgent))) return null;
  return { vence: d.exp };
}

/** ¿Este pedido trae un desbloqueo vigente del candado de `username`? */
export async function desbloqueoVigente(
  req: { cookies: { get(nombre: string): { value: string } | undefined }; headers: { get(nombre: string): string | null } },
  username: string,
  ahora = Date.now(),
): Promise<{ vence: number; estado: EstadoCandado } | null> {
  const token = req.cookies.get(CANDADO_COOKIE)?.value;
  if (!token) return null;
  const estado = await estadoCandado(username, ahora);
  if (!estado.configurado) return null;
  const d = await leerDesbloqueo(token, { username, userAgent: req.headers.get("user-agent"), version: estado.version }, ahora);
  return d ? { vence: d.vence, estado } : null;
}

export const OPCIONES_COOKIE_DESBLOQUEO = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: CANDADO_COOKIE_PATH,
  maxAge: Math.floor(DESBLOQUEO_MS / 1000),
};

/**
 * Para toda acción que entra a una tienda o toca su acceso (suplantar, resetear
 * 2FA, forzar cambio de clave): si el superadmin TIENE candado configurado, exige
 * el desbloqueo vigente; sin candado configurado no cambia nada. Devuelve el 423
 * listo para responder, o `null` si puede seguir.
 */
export async function respuestaSiCandadoCerrado(
  req: { cookies: { get(nombre: string): { value: string } | undefined }; headers: { get(nombre: string): string | null } },
  username: string,
  ahora = Date.now(),
): Promise<NextResponse | null> {
  const estado = await estadoCandado(username, ahora);
  if (!estado.configurado) return null;
  const d = await leerDesbloqueo(
    req.cookies.get(CANDADO_COOKIE)?.value,
    { username, userAgent: req.headers.get("user-agent"), version: estado.version },
    ahora,
  );
  if (d) return null;
  return NextResponse.json(
    {
      error: "candado_cerrado",
      message: "Abre tu candado de credenciales (ficha de la tienda › Credenciales) para hacer esto.",
      bloqueadoHasta: estado.bloqueadoHasta,
    },
    { status: 423, headers: { "Cache-Control": "no-store" } },
  );
}
