import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/documents/[id]/text — el texto del PDF, página por página.
 *
 * Para buscar DENTRO del documento abierto. El visor muestra las páginas como
 * imágenes, así que el Ctrl+F del navegador no encuentra nada: con esto el
 * buscador propio sabe en qué página está cada coincidencia y puede saltar.
 *
 * Un escaneo (imagen sin capa de texto) devuelve páginas vacías: eso no es un
 * error, es que no hay texto que buscar — lo dice `conTexto`.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:text");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const doc = await DocumentsDB.getById(auth.tenantId, id, auth.role);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (doc.mimeType !== "application/pdf") {
      return NextResponse.json({ error: "only_pdf" }, { status: 415 });
    }

    const buf = await downloadFromStorage(doc.storagePath);
    if (!buf) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 });

    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    // Sin `mergePages` devuelve un texto por página, que es lo que hace falta
    // para poder decir "está en la página 4".
    const { text } = await extractText(pdf);
    const paginas = Array.isArray(text) ? text : [String(text ?? "")];

    return NextResponse.json({
      paginas,
      conTexto: paginas.some((p) => p.trim().length > 0),
    }, {
      headers: {
        "Cache-Control": doc.allowedRoles.length > 0 ? "private, no-store" : "private, max-age=600",
      },
    });
  } catch (e) {
    logger.warn("[documents.text] no se pudo leer", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "read_failed" }, { status: 422 });
  }
}
