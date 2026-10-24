import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { COOKIE_ENLACE, cookieEnlaceValida } from "@/lib/documentos/clave-enlace";

/**
 * GET /api/public/folders/[token] — vista pública de una carpeta compartida:
 * nombre de la carpeta + sus documentos directos. Validado por token.
 * Con clave, sólo con la cookie que deja `POST /api/public/folders/varias` al
 * acertarla: la clave ya no viaja en la URL (23-10).
 */
type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "public:folder");
    if (rl) return rl;
    const { token } = await ctx.params;
    const found = await DocumentsDB.findByFolderShareToken(token);
    if (!found) return NextResponse.json({ error: "not_found_or_expired" }, { status: 404 });

    if (found.hasPassword) {
      const stored = await DocumentsDB.getFolderShareRawPassword(token);
      if (!stored || !cookieEnlaceValida(req.cookies.get(COOKIE_ENLACE)?.value, "carpeta", token, stored)) {
        return NextResponse.json({ error: "password_required", requirePassword: true }, { status: 401 });
      }
    }

    DocumentsDB.incrementFolderShareAccess(token).catch((err) => logger.warn("folder.share.increment_fail", { err: String(err) }));
    const res = NextResponse.json({ folder: found.folder, docs: found.docs, expiresAt: found.expiresAt, hasPassword: found.hasPassword });
    if (found.hasPassword) res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (e) {
    logger.error("[public.folder] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
