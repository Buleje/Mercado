import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ChatDB } from "@/lib/jsondb";
import { applyRateLimit } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import {
  CUSTOMER_SESSION,
  getCustomerPayload,
  telefonoDeLaSesion,
} from "@/lib/auth/customer-session";

/**
 * Chat de la tienda (`LiveChatWidget`).
 *
 * SECURITY (Ley 29733, 17-10): `GET ?phone=` devolvía la conversación entera
 * (nombre completo + mensajes) a cualquiera que supiera el celular, sin sesión.
 * Ahora leer exige la cookie de cliente VERIFICADA (código por WhatsApp/SMS) y
 * que su celular sea el pedido: el mismo candado que puntos, notificaciones y
 * juntas (`telefonoDeLaSesion`). El token de seguimiento de un pedido de
 * invitado y el login de Google no prueban un celular: no abren el chat.
 *
 * Escribir (security 17-10, T4): también exige la sesión verificada y el
 * celular del cuerpo tiene que ser el suyo. Antes un invitado escribía con el
 * celular de cualquier cliente (el mensaje aparecía en la bandeja como suyo) y
 * cualquier cliente logueado escribía como "sistema"/"bot". Ningún cuerpo de un
 * cliente puede hablar como el sistema: el aviso «el bot no pudo responder» lo
 * arma el servidor en `/api/chat/auto-reply` con los datos de la sesión.
 * El panel contesta por `/api/admin/chat` (requireAdmin con roles).
 */

const CELULAR = /^9\d{8}$/;
const TELEFONOS_DEL_SISTEMA: ReadonlySet<string> = new Set(["sistema", "bot"]);

/** El celular que la cookie de cliente PRUEBA, o null (sin sesión, seguimiento, Google…). */
async function celularDeLaSesion(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return telefonoDeLaSesion(await getCustomerPayload(token));
}

const MensajeSchema = z.object({
  phone: z.string().trim().min(1),
  name: z.string().trim().max(100).optional(),
  message: z.string().trim().min(1).max(500),
});

// GET: la conversación del cliente que inició sesión
export async function GET(req: NextRequest) {
  try {
    // 17-10: GET y POST compartían el balde "chat" (misma clave por IP) y el
    // widget sondea cada 15 s abierto / 30 s cerrado: a los 10 sondeos el POST
    // (STRICT, corta en 10) daba 429 y el cliente no podía escribir. Ahora cada
    // método tiene su balde y el sondeo usa POLL (×3 del intervalo abierto).
    const rl = applyRateLimit(req, "POLL", "chat-get");
    if (rl) return rl;
    const propio = await celularDeLaSesion(req);
    if (!propio) {
      return NextResponse.json(
        { error: "Ingresa con tu celular para ver tus mensajes" },
        { status: 401 },
      );
    }
    const phone = req.nextUrl.searchParams.get("phone");
    if (!phone || !CELULAR.test(phone)) {
      return NextResponse.json({ error: "phone requerido (9 dígitos)" }, { status: 400 });
    }
    if (phone !== propio) {
      return NextResponse.json({ error: "Esa conversación no es tuya" }, { status: 403 });
    }
    const tenantId = getTenantIdFromRequest(req);
    const messages = await ChatDB.getByPhone(tenantId, propio);
    return NextResponse.json(messages);

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST: el cliente con sesión verificada escribe en SU conversación
export async function POST(req: NextRequest) {
  try {
    const rl = applyRateLimit(req, "STRICT", "chat-post");
    if (rl) return rl;
    const propio = await celularDeLaSesion(req);
    if (!propio) {
      return NextResponse.json(
        { error: "Ingresa con tu celular para escribir al negocio", code: "CHAT_SESION_REQUERIDA" },
        { status: 401 },
      );
    }
    const tenantId = getTenantIdFromRequest(req);
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const parsed = MensajeSchema.safeParse(raw);
    if (!parsed.success) {
      const campo = parsed.error.issues[0]?.path[0];
      const error = campo === "message" ? "Mensaje requerido (máx 500 chars)" : "phone inválido";
      return NextResponse.json({ error }, { status: 400 });
    }
    const { phone, name, message } = parsed.data;
    if (TELEFONOS_DEL_SISTEMA.has(phone)) {
      return NextResponse.json(
        { error: "Los avisos del sistema los escribe el servidor" },
        { status: 403 },
      );
    }
    if (!CELULAR.test(phone)) {
      return NextResponse.json({ error: "phone inválido" }, { status: 400 });
    }
    if (phone !== propio) {
      return NextResponse.json(
        { error: "El celular no coincide con tu sesión" },
        { status: 403 },
      );
    }
    const msg = await ChatDB.add(tenantId, phone, name || "Cliente", "customer", message);
    return NextResponse.json(msg, { status: 201 });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
