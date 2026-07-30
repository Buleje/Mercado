import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgente, AUTOR_AGENTE } from "@/lib/sync/auth-agente";
import { asegurarCarpetas, separarCarpetaYNombre } from "@/lib/sync/drive-sync";
import { DocumentsDB } from "@/lib/db/documents.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const Body = z.object({
  documentId: z.string().min(1),
  /** Nueva ruta lógica completa, incluido el nombre del archivo. */
  ruta: z.string().min(1).max(1024),
});

/**
 * POST /api/sync/move — se movió o renombró un archivo en la carpeta de Windows.
 *
 * Mover y renombrar son lo mismo acá: cambia la ruta lógica. Se resuelve con un update
 * de `folderId` + `name`, sin tocar el contenido en storage.
 */
export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "DRIVE", "sync:move");
  if (rl) return rl;

  const auth = await requireAgente(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "body_invalido" }, { status: 400 });
  }

  const partido = separarCarpetaYNombre(parsed.data.ruta);
  if (!partido) return NextResponse.json({ error: "ruta_invalida" }, { status: 400 });

  try {
    const doc = await DocumentsDB.getById(auth.tenantId, parsed.data.documentId);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const folderId = await asegurarCarpetas(auth.tenantId, partido.carpetas);

    const actualizado = await DocumentsDB.update(auth.tenantId, doc.id, {
      folderId,
      name: partido.nombre,
    });

    DocumentsDB.log(auth.tenantId, {
      documentId: doc.id,
      actorId: AUTOR_AGENTE,
      action: "move",
      metadata: { origen: "sync-escritorio", de: doc.name, a: parsed.data.ruta },
    }).catch((err) => logger.warn("sync.audit.move_fail", { err: String(err) }));

    return NextResponse.json({ ok: true, documentId: actualizado?.id ?? doc.id });
  } catch (e) {
    logger.error("[sync/move] POST error", {
      error: (e as Error).message,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "move_fail" }, { status: 503 });
  }
}
