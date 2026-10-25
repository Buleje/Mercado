import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";
import { etiquetaVedada } from "@/lib/documents/etiquetas-de-maquina";

/**
 * GET  /api/admin/documents/tags — taxonomía de etiquetas del tenant (con conteo).
 * POST /api/admin/documents/tags — renombrar/fusionar o borrar una etiqueta en todos los docs.
 */
export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:tags:list");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;
    const tags = await DocumentsDB.listTags(auth.tenantId, auth.role);
    return NextResponse.json({ tags });
  } catch (e) {
    logger.error("[documents.tags.get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), from: z.string().min(1).max(40), to: z.string().min(1).max(40) }),
  z.object({ action: z.literal("delete"), tag: z.string().min(1).max(40) }),
]);

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:tags:mutate");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    /* Renombrar «x» a `papel:resolucion` (o borrar una `gtf:`) cambia papeles
       de una guía o de un plan en todos los documentos a la vez. */
    const tocadas = parsed.data.action === "rename" ? [parsed.data.from, parsed.data.to] : [parsed.data.tag];
    const vedado = tocadas.map((t) => etiquetaVedada(auth.role, t)).find(Boolean);
    if (vedado) return NextResponse.json({ error: "forbidden", message: vedado }, { status: 403 });

    const affected =
      parsed.data.action === "rename"
        ? await DocumentsDB.renameTag(auth.tenantId, parsed.data.from, parsed.data.to, auth.role)
        : await DocumentsDB.deleteTag(auth.tenantId, parsed.data.tag, auth.role);

    return NextResponse.json({ affected });
  } catch (e) {
    logger.error("[documents.tags.post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
