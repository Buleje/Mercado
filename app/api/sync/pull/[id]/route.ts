import { NextRequest, NextResponse } from "next/server";
import { requireAgente } from "@/lib/sync/auth-agente";
import { DocumentsDB } from "@/lib/db/documents.db";
import { downloadFromStorage } from "@/lib/documents/storage";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * GET /api/sync/pull/[id] — el agente baja el contenido de un documento.
 *
 * Se usa cuando algo se subió desde el panel o el celular y tiene que aterrizar en la
 * carpeta de Windows.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // DRIVE_READ: bajar la carpeta entera la primera vez son cientos de requests (ADR-306).
  const rl = await applyRateLimit(req, "DRIVE_READ", "sync:pull");
  if (rl) return rl;

  const auth = await requireAgente(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const doc = await DocumentsDB.getById(auth.tenantId, id);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const buffer = await downloadFromStorage(doc.storagePath);
    if (!buffer) return NextResponse.json({ error: "storage_miss" }, { status: 404 });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(buffer.length),
        // El agente lo escribe en disco; nunca se renderiza en un navegador.
        "Content-Disposition": "attachment",
        "X-Document-Updated-At": new Date(doc.updatedAt).toISOString(),
      },
    });
  } catch (e) {
    logger.error("[sync/pull] GET error", {
      error: (e as Error).message,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "pull_fail" }, { status: 503 });
  }
}
