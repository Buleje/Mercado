import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { MembreteDB } from "@/lib/db/membrete.db";
import { ROLES_MEMBRETE } from "@/lib/admin/membrete";

/**
 * GET /api/admin/membrete/logo — el logo del negocio de la sesión en PNG (lado
 * mayor ≤ 600 px), para que jsPDF, un canvas o html-to-image lo carguen del
 * mismo sitio: sin CORS y aunque se haya subido en WebP o SVG (ADR-514).
 *
 * El negocio sale SÓLO del JWT: no hay parámetro que elija otro. `?v=` es la
 * huella del logo que pone `logoPngUrl` para que el navegador no sirva el viejo.
 * Sin logo (o si no carga) = 404 y el papel sale sin logo.
 */
const PRIVADO = "private, max-age=300";

export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "membrete-logo");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES_MEMBRETE);
  if (auth instanceof NextResponse) return auth;

  try {
    const logo = await MembreteDB.logoPng(auth.tenantId);
    if (!logo) {
      return NextResponse.json({ error: "El negocio no tiene un logo que se pueda usar" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    if (req.headers.get("if-none-match") === logo.etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: logo.etag, "Cache-Control": PRIVADO } });
    }
    return new NextResponse(new Uint8Array(logo.bytes), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(logo.bytes.length),
        "Cache-Control": PRIVADO,
        ETag: logo.etag,
        "X-Content-Type-Options": "nosniff",
        "X-Logo-Ancho": String(logo.ancho),
        "X-Logo-Alto": String(logo.alto),
      },
    });
  } catch (e) {
    logger.error("[admin/membrete/logo] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer el logo del negocio" }, { status: 503 });
  }
}
