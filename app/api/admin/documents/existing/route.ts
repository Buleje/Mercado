import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/documents/existing — qué archivos ya hay en estas carpetas.
 *
 * Es una LECTURA, pero va por POST porque la lista de carpetas de un import no
 * entra en una query string. Devuelve sólo nombre y peso: lo justo para que el
 * importador sepa qué no volver a subir (ADR-306).
 *
 * La clave "" del resultado es la raíz del drive.
 */
const Body = z.object({
  /** null = la raíz del drive. Máx 400, el mismo tope que el árbol. */
  folderIds: z.array(z.string().nullable()).min(1).max(400),
});

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:existing");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const porCarpeta = await DocumentsDB.listNamesInFolders(auth.tenantId, parsed.data.folderIds);
    return NextResponse.json({ porCarpeta });

  } catch (e) {
    logger.error("[documents.existing] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
