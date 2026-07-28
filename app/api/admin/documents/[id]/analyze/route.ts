import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { analyzeDocumentContent } from "@/lib/documents/analyze-document";
import { AVISO_SIN_VISION } from "@/lib/documents/modelo-vision";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/documents/[id]/analyze — lee el contenido del documento con IA
 * (ver `lib/documents/analyze-document.ts`) para que el asistente pueda responder
 * con la info. Manual; el auto-análisis al subir usa la misma función.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_IA", "documents:analyze");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const result = await analyzeDocumentContent(auth.tenantId, id, auth.username, auth.role);
    if (!result.ok) {
      const message =
        result.error === "no_text"
          ? "No pude extraer texto. Si es un PDF escaneado (una foto adentro de un PDF), usá el botón Escanear (OCR)."
          : result.error === "vision_fail"
          ? "No pude leer la imagen: el servicio que la mira no respondió. Probá de nuevo en un momento."
          : result.error === "vision_unavailable"
          ? AVISO_SIN_VISION
          : undefined;
      return NextResponse.json({ error: result.error, message }, { status: result.status });
    }
    return NextResponse.json({
      summary: result.summary,
      description: result.description,
      keyFacts: result.keyFacts,
      tags: result.tags,
      entities: result.entities,
      textLength: result.textLength,
      source: result.source,
      // 200 con aviso, no error: el texto SÍ se guardó (sirve para buscar);
      // lo que faltó es la descripción, y hay que decir por qué.
      ...(result.aviso ? { aviso: result.aviso } : {}),
    });
  } catch (e) {
    logger.error("[documents.analyze] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
