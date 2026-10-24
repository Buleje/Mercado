import "server-only";
import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-keys";

/**
 * lib/sync/auth-agente.ts — autenticación de los endpoints `/api/sync/*` (ADR-307).
 *
 * El agente de escritorio no tiene sesión de navegador, así que no puede pasar por
 * `requireAdmin` (cookie + CSRF). Se autentica con `Authorization: Bearer sk_…`.
 *
 * Vive aparte de `lib/require-admin.ts` A PROPÓSITO: esa función es zona de peligro
 * (la usan ~230 routes). Si algo acá está mal, el daño queda contenido en /api/sync.
 *
 * CSRF no se valida y no es un olvido: el double-submit cookie defiende a un navegador
 * con sesión abierta de que otro sitio le haga requests. Un agente sin cookies no tiene
 * esa superficie; su credencial es el Bearer, que ningún sitio de terceros puede leer.
 */

export type AgenteAuth = { tenantId: string };

/** Lee la API key del request, venga por Authorization o por el header que inyecta proxy.ts. */
function leerClave(req: Request): string | null {
  const bearer = req.headers.get("authorization") ?? "";
  if (bearer.startsWith("Bearer ")) return bearer.slice("Bearer ".length).trim();

  // proxy.ts §5 mueve el Bearer a x-api-key antes de llegar al handler.
  const directo = req.headers.get("x-api-key");
  return directo?.trim() || null;
}

/**
 * Autentica al agente. Devuelve `{ tenantId }` o una `NextResponse` 401 lista para
 * retornar — mismo contrato de uso que `requireAdmin`.
 *
 * @example
 *   const auth = await requireAgente(req);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.tenantId disponible
 */
export async function requireAgente(req: Request): Promise<AgenteAuth | NextResponse> {
  const clave = leerClave(req);
  if (!clave) {
    return NextResponse.json(
      { error: "no_api_key", message: "Falta el header Authorization: Bearer sk_…" },
      { status: 401 }
    );
  }

  const valida = await validateApiKey(clave);
  if (!valida) {
    return NextResponse.json(
      { error: "invalid_api_key", message: "La clave no existe o fue revocada." },
      { status: 401 }
    );
  }

  return { tenantId: valida.tenantId };
}

/** Quién figura como autor en el historial y la auditoría de lo que sube el agente. */
export const AUTOR_AGENTE = "sync-escritorio";
