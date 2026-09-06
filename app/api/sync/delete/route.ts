import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgente, AUTOR_AGENTE } from "@/lib/sync/auth-agente";
import { DocumentsDB } from "@/lib/db/documents.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const Body = z.object({
  documentIds: z.array(z.string().min(1)).min(1).max(500),
});

/**
 * POST /api/sync/delete — se borraron archivos en la carpeta de Windows.
 *
 * Manda a la **papelera** (`softDelete`), nunca borra de verdad: decisión explícita de
 * Brandon en ADR-307 §4. Si el agente se equivoca, los documentos se restauran desde el
 * Drive en vez de perderse.
 */
export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "DRIVE", "sync:delete");
  if (rl) return rl;

  const auth = await requireAgente(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "body_invalido" }, { status: 400 });
  }

  try {
    const aPapelera: string[] = [];
    const noEncontrados: string[] = [];

    for (const id of parsed.data.documentIds) {
      const ok = await DocumentsDB.softDelete(auth.tenantId, id);
      if (ok) {
        aPapelera.push(id);
        DocumentsDB.log(auth.tenantId, {
          documentId: id,
          actorId: AUTOR_AGENTE,
          action: "delete",
          metadata: { origen: "sync-escritorio", papelera: true },
        }).catch((err) => logger.warn("sync.audit.delete_fail", { err: String(err) }));
      } else {
        noEncontrados.push(id);
      }
    }

    return NextResponse.json({ ok: true, aPapelera: aPapelera.length, noEncontrados });
  } catch (e) {
    logger.error("[sync/delete] POST error", {
      error: (e as Error).message,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "delete_fail" }, { status: 503 });
  }
}
