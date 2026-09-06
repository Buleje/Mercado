import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { deleteFromStorage } from "@/lib/documents/storage";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { IDS_POR_LOTE } from "@/lib/documents/bulk-limits";

/**
 * POST /api/admin/documents/trash — la papelera en lote.
 *
 * Antes sólo se podía restaurar o eliminar de a UNO desde la vista Papelera: si
 * un borrado masivo se hizo por error, recuperarlo eran cientos de clics, y
 * "vaciar la papelera" no existía — el espacio quedaba ocupado para siempre.
 *
 * - `restore` devuelve los seleccionados al drive.
 * - `purge` borra de verdad: primero los objetos del storage (documento +
 *   versiones históricas) y después las filas. Con `todos: true` se lleva la
 *   papelera entera del tenant, de a IDS_POR_LOTE por llamada — el cliente
 *   repite mientras `restantes > 0`.
 *
 * `purge` pide rol admin/owner: es la única acción del drive sin vuelta atrás.
 */

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("restore"),
    ids: z.array(z.string().min(1)).min(1).max(IDS_POR_LOTE),
  }),
  z.object({
    action: z.literal("purge"),
    ids: z.array(z.string().min(1)).max(IDS_POR_LOTE).optional(),
    todos: z.boolean().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_BULK", "documents:trash");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;

    const body = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }
    const data = parsed.data;

    const auth = await requireAdmin(req, data.action === "purge" ? ["admin", "owner"] : undefined);
    if (auth instanceof NextResponse) return auth;

    if (data.action === "restore") {
      const restored = await DocumentsDB.bulkRestore(auth.tenantId, data.ids);
      DocumentsDB.logMany(auth.tenantId, data.ids, {
        actorId: auth.username,
        action: "restore",
        metadata: { bulk: true, total: data.ids.length },
      }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));
      return NextResponse.json({ ok: true, restored });
    }

    // ── purge ──
    const objetivo = data.todos
      ? await DocumentsDB.idsEnPapelera(auth.tenantId, IDS_POR_LOTE)
      : (data.ids ?? []);
    if (objetivo.length === 0) {
      return NextResponse.json({ ok: true, purged: 0, restantes: 0 });
    }

    // Los paths se piden ANTES de borrar las filas: después ya no hay de dónde
    // sacarlos y los archivos quedarían ocupando el bucket para siempre.
    const { ids, paths } = await DocumentsDB.storagePathsOfDeleted(auth.tenantId, objetivo);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, purged: 0, restantes: await DocumentsDB.contarPapelera(auth.tenantId) });
    }
    await deleteFromStorage(paths).catch((e) =>
      logger.warn("documents.trash.storage_cleanup_fail", { e: String(e), n: paths.length }),
    );
    const purged = await DocumentsDB.bulkHardDelete(auth.tenantId, ids);
    const restantes = await DocumentsDB.contarPapelera(auth.tenantId);

    // La auditoría por documento se va con el documento (FK en cascada), así que
    // el rastro de un vaciado queda en el ActivityLog del tenant.
    logActivity(
      "purge",
      "Documento",
      `Vació ${purged} documento(s) de la papelera (${paths.length} archivo(s) del storage)`,
      undefined,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.warn("documents.trash.activity_fail", { err: String(err) }));

    return NextResponse.json({ ok: true, purged, restantes });
  } catch (e) {
    logger.error("[documents.trash] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
