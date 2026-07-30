import { NextRequest, NextResponse } from "next/server";
import { requireAgente } from "@/lib/sync/auth-agente";
import { guardarEnRuta } from "@/lib/sync/drive-sync";
import { applyRateLimit } from "@/lib/rate-limit";
import { MAX_UPLOAD_SIZE } from "@/lib/documents/upload-limits";
import { logger } from "@/lib/logger";

/**
 * POST /api/sync/push — el agente manda un archivo que se creó o cambió en Windows.
 *
 * Body: multipart/form-data con
 *   - `file`       el contenido
 *   - `ruta`       ruta lógica relativa a la carpeta (`Boletas/2026/enero.pdf`)
 *   - `documentId` (opcional) id que el agente ya tenía mapeado para esa ruta
 *
 * Si la ruta ya existe en el Drive, entra como versión nueva — no pisa el original
 * (ADR-307 §4).
 */
export async function POST(req: NextRequest) {
  // Preset DRIVE: subir una carpeta entera es un request por archivo (ADR-306).
  const rl = await applyRateLimit(req, "DRIVE", "sync:push");
  if (rl) return rl;

  const auth = await requireAgente(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const rutaRaw = form.get("ruta");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "no_file" }, { status: 400 });
    }
    if (typeof rutaRaw !== "string" || !rutaRaw.trim()) {
      return NextResponse.json({ error: "no_ruta" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: "too_large", maxBytes: MAX_UPLOAD_SIZE },
        { status: 413 }
      );
    }

    const documentIdRaw = form.get("documentId");
    const documentId =
      typeof documentIdRaw === "string" && documentIdRaw.trim() ? documentIdRaw.trim() : null;

    const contenido = Buffer.from(await file.arrayBuffer());
    const res = await guardarEnRuta(auth.tenantId, {
      ruta: rutaRaw,
      contenido,
      documentId,
    });

    if (!res.ok) {
      const status =
        res.error === "ruta_invalida" ? 400 : res.error === "mime_not_allowed" ? 415 : 502;
      return NextResponse.json(res, { status });
    }

    return NextResponse.json(res);
  } catch (e) {
    logger.error("[sync/push] POST error", {
      error: (e as Error).message,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "push_fail" }, { status: 503 });
  }
}
