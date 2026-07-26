import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/documents/folders/tree — crea el árbol de un import entero.
 *
 * Existe porque importar una carpeta con subcarpetas hacía un POST por carpeta:
 * 30 subcarpetas = 30 requests, y el rate limit del panel cortaba el import a
 * la mitad dejando el árbol incompleto. Acá el árbol viaja en UNA llamada.
 *
 * Reusa lo que ya existe (mismo nombre bajo el mismo padre), así que reimportar
 * la misma carpeta fusiona en vez de duplicar. Ver ADR-306.
 */
const Body = z.object({
  parentId: z.string().nullable().optional(),
  /** Rutas relativas al destino: "Contratos/2026". Máx 400 por request. */
  rutas: z.array(z.string().min(1).max(600)).min(1).max(400),
});

/** Tope de profundidad, igual al del planificador del cliente. */
const PROFUNDIDAD_MAX = 6;

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "MODERATE", "documents:folders:tree");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    // Normalizar acá y no en la DB: la capa de datos no debería adivinar qué
    // es una ruta válida, y así el tope de profundidad es uno solo.
    const rutas = parsed.data.rutas
      .map((r) => r.replace(/\\/g, "/").split("/").map((p) => p.trim()).filter(Boolean).join("/"))
      .filter(Boolean);
    if (rutas.some((r) => r.split("/").length > PROFUNDIDAD_MAX)) {
      return NextResponse.json({ error: "too_deep", max: PROFUNDIDAD_MAX }, { status: 400 });
    }
    if (rutas.length === 0) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

    const { idPorRuta, creadas } = await DocumentsDB.createFolderTree(auth.tenantId, {
      parentId: parsed.data.parentId ?? null,
      rutas,
    });
    return NextResponse.json({ idPorRuta, creadas });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "parent_not_found") {
      return NextResponse.json({ error: "parent_not_found" }, { status: 404 });
    }
    logger.error("[documents.folders.tree] error", { err: msg });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
