import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { borrarCookieTv } from "@/lib/camaras/tv-auth.server";

/**
 * POST /api/tv/salir — el TV deja de ver (ADR-473): borra la cookie
 * `buleje-tv`. La pantalla sigue en la lista del panel hasta que el dueño la
 * desconecte o venza; sin la cookie, este TV ya no la puede usar.
 */
export const POST = withApiHandler("tv-salir", async (req: NextRequest) => {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  return borrarCookieTv(NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }));
});
