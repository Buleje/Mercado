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
 * `AUTH_SECRET` (con `AUTH_SECRET_PREVIOUS`) rota también esta clave. Sin
 * vencimiento: el token vale lo que vive el hilo (cerrado → 409 al escribir).
 */

const ETIQUETA_CLAVE = "buleje-chat-hilo/v1";
const LARGO_MAXIMO = 128;

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

function firma(clave: Buffer, tenantId: string, threadId: string, telefono: string): Buffer {
  return createHmac("sha256", clave)
    .update(`${tenantId}:${threadId}:${normalizarTelefonoChat(telefono)}`)
    .digest();
}

/** Token para el hilo recién abierto. Tira si falta `AUTH_SECRET` (lo valida `lib/env.ts`). */
export function firmarTokenHilo(tenantId: string, threadId: string, telefono: string): string {
  return firma(clavesActivas()[0]!, tenantId, threadId, telefono).toString("base64url");
}

/** `true` sólo si el token es de ESTE hilo, negocio y celular. Nunca tira. */
export function verificarTokenHilo(
  tenantId: string,
  threadId: string,
  telefono: string,
  token: unknown,
): boolean {
  if (typeof token !== "string" || !token || token.length > LARGO_MAXIMO) return false;
  try {
    const recibida = Buffer.from(token, "base64url");
    return clavesActivas().some((k) => {
      const esperada = firma(k, tenantId, threadId, telefono);
      return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
    });
  } catch {
    return false;
  }
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
 * abrir el hilo en su equipo. Sin ninguno → "sin-prueba" (401); token de otro
 * hilo, negocio o celular → "ajeno" (403).
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
  return verificarTokenHilo(tenantId, threadId, telefonoDelHilo, token) ? "ok" : "ajeno";
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
