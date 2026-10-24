/**
 * /api/tienda-cliente/google — entrar con el globito de Google (One Tap /
 * FedCM) en las tiendas (17-10).
 *
 * GET  → `{ nonce }`: sha256 de un nonce crudo nuevo; el crudo queda en una
 *        cookie httpOnly de un solo uso (10 min, SameSite=Strict, sólo viaja a
 *        esta ruta). El navegador le pasa el hash a Google.
 * POST `{ credential }` → revisa el ID token en casa (firma, iss, aud, exp y
 *        nonce contra la cookie: `lib/tienda-cliente/google-id-token.ts`) y lo
 *        canjea con `supabase.auth.signInWithIdToken` (nonce crudo), que deja
 *        la MISMA cookie httpOnly `sb-…-auth-token` que el botón de siempre.
 *        Responde `{ cliente, pista }` como `/api/tienda-cliente/yo`.
 *
 * Por qué Supabase y no `/api/auth/google`: la identidad de Google de las
 * tiendas ES la sesión de Supabase (`useClienteTienda`, `/yo`); sólo rellena el
 * nombre del pedido. La cookie de cliente de la casa (puntos, descuentos,
 * historial) se abre sólo con el celular verificado y aquí no se toca.
 *
 * El negocio (`x-tenant-id` que pone el proxy, sin caer a "main") se lee en el
 * GET y en el POST: si apagó «Entrar con Google» (`pedidosCliente.loginGoogle`),
 * no hay nonce ni canje (404). No se escribe nada de ningún negocio.
 */
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf } from "@/lib/auth/csrf";
import { SettingsDB } from "@/lib/jsondb";
import { applyRateLimit, createDistributedRateLimiter, getClientIp } from "@/lib/rate-limit";
import { getSupabaseServer, isSupabaseAuthConfiguredServer } from "@/lib/supabase/server";
import { clienteDesdeUsuario } from "@/lib/tienda-cliente/cliente";
import { leerConfigPedidos } from "@/lib/tienda-cliente/config";
import {
  COOKIE_NONCE_GOOGLE,
  RUTA_COOKIE_NONCE_GOOGLE,
  hashNonce,
  verificarIdTokenGoogle,
} from "@/lib/tienda-cliente/google-id-token";
import { logger } from "@/lib/logger";

const SIN_CACHE = { "Cache-Control": "private, no-store" };

/* El canje cuenta en Redis (todas las instancias), por IP + negocio: un CGNAT
   (media Pucallpa detrás de la misma IP del operador) no gasta los intentos de
   las demás tiendas. El nonce NO va en la clave: se gasta en cada POST y cada
   GET da uno nuevo, así que cada intento traería su propio balde (sin tope). */
const limiteCanje = createDistributedRateLimiter({ key: "tienda:google-un-toque", maxRequests: 30, windowMs: 10 * 60_000 });

const cuerpoSchema = z.object({
  credential: z
    .string()
    .min(20)
    .max(4096)
    .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/),
});

function idCliente(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || null;
}

function configurado(): boolean {
  return Boolean(idCliente()) && isSupabaseAuthConfiguredServer();
}

function noConfigurado(): NextResponse {
  return NextResponse.json({ error: "no_configurado" }, { status: 503, headers: SIN_CACHE });
}

/** ¿El negocio tiene «Entrar con Google» prendido? Sin ajustes legibles = no. */
async function googleEncendido(tenantId: string): Promise<boolean> {
  const ajustes = await SettingsDB.get(tenantId).catch((err: unknown) => {
    logger.warn("[tienda-cliente/google] no se leyeron los ajustes del negocio", { tenantId, error: String(err) });
    return null;
  });
  return Boolean(ajustes && leerConfigPedidos(ajustes.storeTheme).loginGoogle);
}

function sinTienda(): NextResponse {
  return NextResponse.json({ error: "sin_tienda" }, { status: 400, headers: SIN_CACHE });
}

/** Respuesta que además vence el nonce: se usa una sola vez, salga bien o mal. */
function gastandoNonce(cuerpo: Record<string, unknown>, status: number): NextResponse {
  const res = NextResponse.json(cuerpo, { status, headers: SIN_CACHE });
  res.cookies.set(COOKIE_NONCE_GOOGLE, "", { maxAge: 0, path: RUTA_COOKIE_NONCE_GOOGLE });
  return res;
}

export async function GET(req: NextRequest) {
  // Cada visita sin sesión pide uno: tope amplio (muchas casas comparten IP).
  const limitado = applyRateLimit(req, "GENEROUS", "tienda-gis-nonce");
  if (limitado) return limitado;
  if (!configurado()) return noConfigurado();
  const tenantId = req.headers.get("x-tenant-id")?.trim();
  if (!tenantId) return sinTienda();
  // Apagado o sin ajustes legibles: el globito no abre (el botón de siempre sigue).
  if (!(await googleEncendido(tenantId))) {
    return NextResponse.json({ error: "apagado" }, { status: 404, headers: SIN_CACHE });
  }

  const crudo = randomBytes(32).toString("base64url");
  const res = NextResponse.json({ nonce: hashNonce(crudo) }, { headers: SIN_CACHE });
  res.cookies.set(COOKIE_NONCE_GOOGLE, crudo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: RUTA_COOKIE_NONCE_GOOGLE,
    maxAge: 600,
  });
  return res;
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const tenantId = req.headers.get("x-tenant-id")?.trim();
  if (!tenantId) return sinTienda();
  if (!(await limiteCanje.check(`${getClientIp(req)}:${tenantId}`))) {
    return NextResponse.json(
      { error: "rate_limited", message: "Demasiados intentos. Espera unos minutos." },
      { status: 429, headers: { ...SIN_CACHE, "Retry-After": String(Math.ceil(limiteCanje.windowMs / 1000)) } },
    );
  }
  const audiencia = idCliente();
  if (!audiencia || !isSupabaseAuthConfiguredServer()) return noConfigurado();
  if (!(await googleEncendido(tenantId))) return gastandoNonce({ error: "apagado" }, 404);

  const cuerpo = cuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return gastandoNonce({ error: "datos_invalidos" }, 400);
  const nonceCrudo = req.cookies.get(COOKIE_NONCE_GOOGLE)?.value;
  if (!nonceCrudo) return gastandoNonce({ error: "nonce_vencido" }, 400);

  const token = cuerpo.data.credential;
  const revisado = await verificarIdTokenGoogle(token, { audiencia, nonceHash: hashNonce(nonceCrudo) });
  if (!revisado.ok) {
    logger.warn("[tienda-cliente/google] token rechazado", { motivo: revisado.motivo });
    return gastandoNonce({ error: "token_invalido" }, 401);
  }

  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce: nonceCrudo });
    if (error || !data.user) {
      logger.warn("[tienda-cliente/google] Supabase no aceptó el token", { error: error?.message ?? "sin usuario" });
      return gastandoNonce({ error: "token_invalido" }, 401);
    }
    return gastandoNonce({ cliente: clienteDesdeUsuario(data.user), pista: revisado.reclamos.sub }, 200);
  } catch (err) {
    logger.error("[tienda-cliente/google] signInWithIdToken falló", { error: String(err) });
    return gastandoNonce({ error: "google_no_responde" }, 502);
  }
}
