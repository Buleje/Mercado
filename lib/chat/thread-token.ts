import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireEnv } from "@/lib/env";
import { CUSTOMER_SESSION, getCustomerPayload, telefonoDeLaSesion } from "@/lib/auth/customer-session";

/**
 * Token de conversación del chat de invitado (`/api/chat/public`, 2026-10-17).
 *
 * Antes, el celular bastaba para LEER una conversación: `action=open` devolvía
 * el hilo abierto de cualquier número y el GET entregaba sus mensajes (nombre,
 * texto, fotos, ubicación, pedido) a quien lo pidiera — Ley 29733. Ahora el
 * servidor firma un token al ABRIR el hilo y sólo quien lo tiene (el equipo que
 * lo abrió) o un cliente con sesión verificada de ese celular puede leerlo o
 * seguir escribiendo en él.
 *
 * Firma = HMAC-SHA256 sobre `<tenantId>:<threadId>:<celular normalizado>` con
 * una clave DERIVADA de `AUTH_SECRET` (como `lib/camaras/tv-token.server.ts`):
 * ninguna otra firma del proyecto sirve como token de chat ni al revés. Rotar
 * `AUTH_SECRET` (con `AUTH_SECRET_PREVIOUS`) rota también esta clave.
 *
 * Vence a los 30 días (security 17-10, T4): `<exp en segundos>.<firma>` y la
 * firma cubre también `exp`. Vencido → 401 «abre el chat de nuevo o inicia
 * sesión» (como sin token). Los tokens de antes, sin `exp` (vivieron unas horas
 * del 17-10 y nunca llegaron a producción), se tratan como vencidos: lo más
 * simple, y quien abrió el chat con su celular verificado sigue entrando.
 */

const ETIQUETA_CLAVE = "buleje-chat-hilo/v1";
const LARGO_MAXIMO = 128;
/** Vida del token del hilo: 30 días desde que se abrió el chat en ese equipo. */
export const VIDA_TOKEN_HILO_SEG = 30 * 24 * 60 * 60;

/** "51987654321" · "+51 987 654 321" · "987654321" → "987654321". */
export function normalizarTelefonoChat(telefono: string): string {
  const d = String(telefono ?? "").replace(/\D/g, "");
  return d.startsWith("51") && d.length === 11 ? d.slice(2) : d;
}

function clavesActivas(): Buffer[] {
  const actual = requireEnv("AUTH_SECRET");
  const previa = process.env.AUTH_SECRET_PREVIOUS;
  const secretos = previa && previa !== actual ? [actual, previa] : [actual];
  return secretos.map((s) => createHmac("sha256", s).update(ETIQUETA_CLAVE).digest());
}

/** `exp` null = formato viejo sin vencimiento (sólo para reconocerlo y responder 401, no para aceptarlo). */
function firma(clave: Buffer, tenantId: string, threadId: string, telefono: string, exp: number | null): Buffer {
  const base = `${tenantId}:${threadId}:${normalizarTelefonoChat(telefono)}`;
  return createHmac("sha256", clave)
    .update(exp === null ? base : `${base}:${exp}`)
    .digest();
}

function firmaCoincide(recibidaB64: string, calcular: (clave: Buffer) => Buffer): boolean {
  const recibida = Buffer.from(recibidaB64, "base64url");
  return clavesActivas().some((k) => {
    const esperada = calcular(k);
    return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
  });
}

const ahoraSeg = (): number => Math.floor(Date.now() / 1000);

/** Token para el hilo recién abierto (vence en 30 días). Tira si falta `AUTH_SECRET` (lo valida `lib/env.ts`). */
export function firmarTokenHilo(tenantId: string, threadId: string, telefono: string): string {
  const exp = ahoraSeg() + VIDA_TOKEN_HILO_SEG;
  return `${exp}.${firma(clavesActivas()[0]!, tenantId, threadId, telefono, exp).toString("base64url")}`;
}

export type EstadoTokenHilo = "ok" | "vencido" | "invalido";

/**
 * "ok" sólo si el token es de ESTE hilo, negocio y celular y no venció.
 * "vencido": pasó su `exp` o es un genuino del formato viejo sin `exp`. Nunca tira.
 */
export function estadoTokenHilo(
  tenantId: string,
  threadId: string,
  telefono: string,
  token: unknown,
): EstadoTokenHilo {
  if (typeof token !== "string" || !token || token.length > LARGO_MAXIMO) return "invalido";
  try {
    const punto = token.indexOf(".");
    if (punto < 0) {
      // Formato sin `exp` (vivió unas horas del 17-10): el genuino cuenta como vencido.
      return firmaCoincide(token, (k) => firma(k, tenantId, threadId, telefono, null)) ? "vencido" : "invalido";
    }
    const expTexto = token.slice(0, punto);
    if (!/^\d{1,12}$/.test(expTexto)) return "invalido";
    const exp = Number(expTexto);
    if (!firmaCoincide(token.slice(punto + 1), (k) => firma(k, tenantId, threadId, telefono, exp))) return "invalido";
    return exp > ahoraSeg() ? "ok" : "vencido";
  } catch {
    return "invalido";
  }
}

/** `true` sólo si el token es de ESTE hilo, negocio y celular y no venció. Nunca tira. */
export function verificarTokenHilo(
  tenantId: string,
  threadId: string,
  telefono: string,
  token: unknown,
): boolean {
  return estadoTokenHilo(tenantId, threadId, telefono, token) === "ok";
}

/** ¿El request trae la sesión verificada de cliente de ESTE celular? */
export async function esSesionDelTelefono(req: NextRequest, telefono: string): Promise<boolean> {
  const cookie = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!cookie) return false;
  const propio = telefonoDeLaSesion(await getCustomerPayload(cookie));
  return !!propio && propio === normalizarTelefonoChat(telefono);
}

export type AccesoHilo = "ok" | "sin-prueba" | "ajeno";

/**
 * El celular ya NO alcanza para leer o seguir una conversación. Pasa quien
 * tiene la sesión verificada de ese celular o el token que el servidor firmó al
 * abrir el hilo en su equipo. Sin ninguno o con el token vencido → "sin-prueba"
 * (401); token de otro hilo, negocio o celular → "ajeno" (403).
 */
export async function accesoAlHilo(
  req: NextRequest,
  tenantId: string,
  threadId: string,
  telefonoDelHilo: string,
  token: unknown,
): Promise<AccesoHilo> {
  if (await esSesionDelTelefono(req, telefonoDelHilo)) return "ok";
  if (typeof token !== "string" || !token) return "sin-prueba";
  const estado = estadoTokenHilo(tenantId, threadId, telefonoDelHilo, token);
  return estado === "ok" ? "ok" : estado === "vencido" ? "sin-prueba" : "ajeno";
}

export function respuestaSinAcceso(acceso: Exclude<AccesoHilo, "ok">): NextResponse {
  return acceso === "sin-prueba"
    ? NextResponse.json(
        {
          error: "Por tu privacidad, abre el chat de nuevo o inicia sesión para ver esta conversación",
          code: "CHAT_TOKEN_REQUERIDO",
        },
        { status: 401 },
      )
    : NextResponse.json(
        { error: "Esta conversación no es tuya", code: "CHAT_TOKEN_INVALIDO" },
        { status: 403 },
      );
}
