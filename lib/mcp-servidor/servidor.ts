import "server-only";

/**
 * lib/mcp-servidor/servidor.ts — Buleje IA (ADR-528), carril 4.
 *
 * El servidor MCP del negocio sobre Streamable HTTP, sin estado: cada POST es
 * un mensaje JSON-RPC y vuelve un JSON (nunca SSE, nunca `Mcp-Session-Id`).
 * Lo montan `app/api/mcp/route.ts` (token en `Authorization: Bearer`) y
 * `app/api/mcp/t/[token]/route.ts` (token en la URL, para ChatGPT y las apps
 * que solo aceptan una dirección).
 *
 * Orden (cada paso corta): método → Origin → cupo por IP → token → usuario del
 * panel re-leído → cupo por conexión → cuerpo → JSON-RPC.
 *
 * Sin sesión ni CSRF: el proxy exime SOLO estas dos rutas (`esRutaMcp`). El
 * negocio sale del token, nunca del host ni de `x-tenant-id`.
 */

import { AsistenteConexionesDB, type ConexionAutenticada } from "@/lib/db/asistente-conexiones.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import type { Role } from "@/lib/auth/role-permissions";
import { createDistributedRateLimiter, getClientIp, type DistributedRateLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  CODIGO,
  errorJsonRpc,
  leerMensaje,
  negociarVersionLegada,
  respuestaJsonRpc,
  validarLegado,
  validarModerno,
  versionDelCuerpo,
  VERSIONES_LEGADAS,
  VERSIONES_MODERNAS,
  type ErrorJsonRpc,
  type MensajeJsonRpc,
} from "./protocolo";
import { listarHerramientas, llamarHerramienta, type ActorMcp } from "./herramientas";
import { PREFIJO_TOKEN_MCP } from "./token";

export const SERVIDOR_INFO = { name: "buleje", title: "Buleje (tu negocio)", version: "1.0.0" } as const;

const INSTRUCCIONES =
  "Eres el ayudante del sistema Buleje de este negocio (bodega, aserradero, maquinaria) en Perú. " +
  "Las herramientas consultan y anotan en el sistema real con el usuario del panel de esta conexión. " +
  "Las que anotan plata, stock o mandan papeles NO anotan de una vez: devuelven `pendiente: true`, un `resumen` y un `aprobacionId`. " +
  "Muéstrale el resumen a la persona y llama a `confirmar_operacion` SOLO si ella dice que sí. Montos en soles (S/).";

/** Cuerpo máximo de un mensaje: un tools/call con texto dictado no pasa de unos KB. */
const MAX_BYTES_CUERPO = 256 * 1024;

/** Llamadas por minuto: por IP antes del token (frena el barrido) y por conexión después. */
const CUPO_IP_POR_MINUTO = 120;
const CUPO_CONEXION_POR_MINUTO = 60;

/** Orígenes de navegador aceptados además del propio panel (spec: Origin inválido = 403). */
const ORIGENES_POR_DEFECTO = [
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://claude.ai",
  "https://gemini.google.com",
  "https://aistudio.google.com",
];

let cupoIp: DistributedRateLimiter | null = null;
let cupoConexion: DistributedRateLimiter | null = null;

function limitadores(): { ip: DistributedRateLimiter; conexion: DistributedRateLimiter } {
  cupoIp ??= createDistributedRateLimiter({ key: "mcp:ip", maxRequests: CUPO_IP_POR_MINUTO, windowMs: 60_000 });
  cupoConexion ??= createDistributedRateLimiter({
    key: "mcp:conexion",
    maxRequests: CUPO_CONEXION_POR_MINUTO,
    windowMs: 60_000,
  });
  return { ip: cupoIp, conexion: cupoConexion };
}

/** Solo tests: limitadores nuevos (el respaldo en memoria se resetea aparte). */
export function _reiniciarCupos(): void {
  cupoIp = null;
  cupoConexion = null;
}

function origenesPermitidos(): Set<string> {
  const s = new Set(ORIGENES_POR_DEFECTO);
  const propio = process.env.NEXT_PUBLIC_BASE_URL;
  if (propio) {
    try {
      s.add(new URL(propio).origin);
    } catch {
      logger.warn("[mcp] NEXT_PUBLIC_BASE_URL no es una URL");
    }
  }
  for (const o of (process.env.MCP_ORIGENES_PERMITIDOS ?? "").split(",")) {
    if (o.trim()) s.add(o.trim().replace(/\/$/, ""));
  }
  return s;
}

const CABECERAS_BASE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const;

function json(status: number, cuerpo: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CABECERAS_BASE, "Content-Type": "application/json", ...extra },
  });
}

function noAutorizado(motivo: string): Response {
  return json(401, errorJsonRpc(null, CODIGO.INVALID_REQUEST, `Unauthorized: ${motivo}`), {
    "WWW-Authenticate": 'Bearer realm="buleje-mcp", error="invalid_token"',
  });
}

/** GET (el stream de la era legada) y DELETE (cerrar sesión) no existen sin estado. */
export function metodoNoPermitido(): Response {
  return new Response(null, { status: 405, headers: { ...CABECERAS_BASE, Allow: "POST" } });
}

function tokenDe(req: Request, tokenDeRuta?: string): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  if (m && m[1].startsWith(PREFIJO_TOKEN_MCP)) return m[1];
  return tokenDeRuta ?? null;
}

/**
 * El rol se vuelve a leer del usuario del panel en CADA llamada: si lo
 * borraron o lo desactivaron, la conexión deja de servir; si le bajaron el
 * rol, la conexión puede lo que puede él ahora (no lo que podía al crearla).
 */
/**
 * El cuerpo con tope EN STREAMING: sin `content-length` (chunked) o con uno
 * mentiroso, `req.text()` juntaba todo en memoria antes de mirar el largo.
 * Corta y cancela apenas pasa `max` bytes. `null` = demasiado grande.
 */
export async function leerCuerpoConTope(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const lector = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel().catch((err) => logger.warn("[mcp] no se pudo cortar el cuerpo", { error: String(err) }));
      return null;
    }
    partes.push(value);
  }
  const junto = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    junto.set(p, i);
    i += p.byteLength;
  }
  return new TextDecoder().decode(junto);
}

async function actorDe(conexion: ConexionAutenticada): Promise<ActorMcp | null> {
  const usuario = await AdminUsersDB.getByUsername(conexion.tenantId, conexion.usuario);
  if (!usuario || !usuario.active) return null;
  if (usuario.role === "superadmin") return null;
  return { conexion, rol: usuario.role as Role };
}

export async function atenderMcp(req: Request, tokenDeRuta?: string): Promise<Response> {
  // ── Origin (anti DNS-rebinding, spec «Security & Endpoint») ──────────────
  const origin = req.headers.get("origin");
  if (origin && !origenesPermitidos().has(origin)) {
    return json(403, errorJsonRpc(null, CODIGO.INVALID_REQUEST, "Forbidden: Origin no permitido"));
  }

  const cupos = limitadores();
  const ip = getClientIp(req);
  if (!(await cupos.ip.check(ip))) {
    return json(429, errorJsonRpc(null, CODIGO.INVALID_REQUEST, "Too many requests"), { "Retry-After": "60" });
  }

  // ── Token → conexión → usuario del panel ─────────────────────────────────
  const token = tokenDe(req, tokenDeRuta);
  if (!token) return noAutorizado("falta la clave de la conexión");
  const conexion = await AsistenteConexionesDB.autenticar(token);
  if (!conexion) return noAutorizado("clave inválida, pausada o revocada");
  const actor = await actorDe(conexion);
  if (!actor) {
    logger.warn("[mcp] conexión de un usuario borrado o desactivado", { conexionId: conexion.id, tenantId: conexion.tenantId });
    return noAutorizado("el usuario del panel de esta conexión ya no está activo");
  }

  if (!(await cupos.conexion.check(conexion.id))) {
    return json(429, errorJsonRpc(null, CODIGO.INVALID_REQUEST, "Too many requests: máximo 60 por minuto por conexión"), {
      "Retry-After": "60",
    });
  }

  // ── Cuerpo ───────────────────────────────────────────────────────────────
  const largo = Number(req.headers.get("content-length") ?? "0");
  if (largo > MAX_BYTES_CUERPO) return json(413, errorJsonRpc(null, CODIGO.INVALID_REQUEST, "Payload too large"));
  const textoCuerpo = await leerCuerpoConTope(req, MAX_BYTES_CUERPO);
  if (textoCuerpo === null) {
    return json(413, errorJsonRpc(null, CODIGO.INVALID_REQUEST, "Payload too large"));
  }
  const lectura = leerMensaje(textoCuerpo);
  if (!lectura.ok) return json(lectura.status, lectura.cuerpo);
  const mensaje = lectura.mensaje;

  // Notificaciones (`notifications/initialized`, `…/cancelled`): 202 sin cuerpo.
  if (mensaje.id === undefined) return new Response(null, { status: 202, headers: CABECERAS_BASE });

  const version = versionDelCuerpo(mensaje);
  const moderno = version !== null;
  const errCabecera = moderno ? validarModerno(req.headers, mensaje, version) : validarLegado(req.headers, mensaje);
  if (errCabecera) return json(400, errCabecera);

  try {
    return await despachar(actor, mensaje, moderno);
  } catch (err) {
    logger.error("[mcp] el pedido falló", { method: mensaje.method, conexionId: conexion.id, error: String(err) });
    return json(200, errorJsonRpc(mensaje.id, CODIGO.INTERNAL_ERROR, "Internal error"));
  }
}

async function despachar(actor: ActorMcp, m: MensajeJsonRpc, moderno: boolean): Promise<Response> {
  const id = m.id as string | number;
  /** La era moderna marca cada resultado; la legada no conoce el campo. */
  const ok = (result: Record<string, unknown>) =>
    json(200, respuestaJsonRpc(id, moderno ? { resultType: "complete", ...result } : result));
  const desconocido = (): Response =>
    // Moderna: 404 + -32601 (spec «Protocol Version Header»). Legada: 200 con el error.
    json(moderno ? 404 : 200, errorJsonRpc(id, CODIGO.METHOD_NOT_FOUND, `Method not found: ${m.method}`));
  const invalido = (message: string): Response => json(200, errorJsonRpc(id, CODIGO.INVALID_PARAMS, message));

  switch (m.method) {
    case "initialize": {
      if (moderno) return desconocido();
      return ok({
        protocolVersion: negociarVersionLegada(m.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVIDOR_INFO,
        instructions: INSTRUCCIONES,
      });
    }
    case "server/discover":
      return ok({
        supportedVersions: [...VERSIONES_MODERNAS, ...VERSIONES_LEGADAS],
        capabilities: { tools: { listChanged: false } },
        _meta: { "io.modelcontextprotocol/serverInfo": SERVIDOR_INFO },
        instructions: INSTRUCCIONES,
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: listarHerramientas(actor) });
    case "tools/call": {
      const nombre = m.params?.name;
      const args = m.params?.arguments ?? {};
      if (typeof nombre !== "string" || !nombre) return invalido("Invalid params: falta name");
      if (typeof args !== "object" || args === null || Array.isArray(args)) {
        return invalido("Invalid params: arguments debe ser un objeto");
      }
      AsistenteConexionesDB.marcarUso(actor.conexion.tenantId, actor.conexion.id).catch((err) =>
        logger.error("[mcp] marcar el uso falló", { error: String(err) }),
      );
      const r = await llamarHerramienta(actor, nombre, args as Record<string, unknown>);
      if (r.desconocida) return invalido(`Unknown tool: ${nombre}`);
      return ok({ ...r.resultado });
    }
    default:
      return desconocido();
  }
}

export type { ErrorJsonRpc };
