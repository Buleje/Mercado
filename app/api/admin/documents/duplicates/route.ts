import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { downloadFromStorage } from "@/lib/documents/storage";

/**
 * Documentos repetidos del drive.
 *
 * Después de importar una carpeta dos veces —o de que dos personas suban el
 * mismo adjunto— el drive queda con copias que ocupan lugar y, peor, hacen
 * dudar de cuál es la buena. Acá se listan agrupadas, con cuánto espacio se
 * recuperaría.
 */
export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_READ", "documents:duplicates");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const grupos = await DocumentsDB.gruposDuplicados(auth.tenantId);
    const recuperable = grupos.reduce((t, g) => t + g.size * (g.docs.length - 1), 0);

    return NextResponse.json({ grupos, recuperable });
  } catch (e) {
    logger.error("[documents.duplicates] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const Body = z.object({ ids: z.array(z.string()).min(2).max(20) });

/**
 * ¿Son REALMENTE el mismo archivo? Compara el SHA-256 del contenido.
 *
 * El listado agrupa por peso y nombre, que es barato pero no prueba nada. Antes
 * de borrar algo hay que estar seguro: esto baja los candidatos y los compara
 * byte a byte. Se pide sólo para el grupo que el usuario va a limpiar.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:duplicates:verify");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const rutas = await DocumentsDB.rutasDe(auth.tenantId, parsed.data.ids);
    const hashes: Record<string, string | null> = {};
    for (const { id, storagePath } of rutas) {
      const buf = await downloadFromStorage(storagePath);
      hashes[id] = buf ? createHash("sha256").update(buf).digest("hex") : null;
    }

    // Agrupa por hash: cada grupo es un conjunto de archivos idénticos.
    const porHash = new Map<string, string[]>();
    for (const [id, h] of Object.entries(hashes)) {
      if (!h) continue;
      porHash.set(h, [...(porHash.get(h) ?? []), id]);
    }
    const identicos = [...porHash.values()].filter((ids) => ids.length > 1);

    return NextResponse.json({
      hashes,
      identicos,
      todosIguales: identicos.length === 1 && identicos[0].length === rutas.length,
    });
  } catch (e) {
    logger.error("[documents.duplicates.verify] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
