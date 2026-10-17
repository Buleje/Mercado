import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { ESTADOS_DOC } from "@/lib/documents/estados-doc";
import { IDS_POR_LOTE } from "@/lib/documents/bulk-limits";

// El cliente parte la selección en lotes de IDS_POR_LOTE y los manda uno tras
// otro (hooks/use-documents.ts). Validar contra la MISMA constante evita que
// una selección grande muera en un 400 en vez de borrarse.
const Ids = z.array(z.string().min(1)).min(1).max(IDS_POR_LOTE);

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids: Ids,
  }),
  z.object({
    action: z.literal("move"),
    ids: Ids,
    folderId: z.string().nullable(),
  }),
  z.object({
    action: z.literal("tag"),
    ids: Ids,
    tag: z.string().min(1).max(40),
  }),
  z.object({
    action: z.literal("favorite"),
    ids: Ids,
    favorite: z.boolean(),
  }),
  // Marcar varios de una: seleccionar diez boletas y ponerlas todas en
  // "aprobado" era, hasta ahora, abrir el menú de estado diez veces.
  z.object({
    action: z.literal("status"),
    ids: Ids,
    status: z.enum(ESTADOS_DOC),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "DRIVE_BULK", "documents:bulk");
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
    const data = parsed.data;

    // Sólo los ids que este rol VE (revisión de seguridad 04-10: el lote movía,
    // borraba y etiquetaba papeles restringidos con sólo mandar su id). Para
    // MOVER, además, nada restringido: sacarlo de su carpeta lo dejaría a la
    // vista de roles que hoy no lo ven. Sin rol restringido no hay consulta.
    const ids = await DocumentsDB.idsVisibles(auth.tenantId, data.ids, auth.role, {
      soloSinRoles: data.action === "move",
    });
    // Mover adentro de una carpeta que el rol no ve = como una que no existe: 0.
    const destinoOculto =
      data.action === "move" &&
      !!data.folderId &&
      !(await DocumentsDB.accesoACarpeta(auth.tenantId, data.folderId, auth.role)).ve;

    let affected = 0;
    if (ids.length > 0 && !destinoOculto) {
      switch (data.action) {
        case "delete":
          affected = await DocumentsDB.bulkSoftDelete(auth.tenantId, ids);
          break;
        case "move":
          affected = await DocumentsDB.bulkMove(auth.tenantId, ids, data.folderId);
          break;
        case "tag":
          affected = await DocumentsDB.bulkAddTag(auth.tenantId, ids, data.tag);
          break;
        case "favorite":
          affected = await DocumentsDB.bulkSetFavorite(auth.tenantId, ids, data.favorite);
          break;
        case "status":
          affected = await DocumentsDB.bulkSetStatus(auth.tenantId, ids, data.status);
          break;
      }
    }

    // Audit: una entrada por documento, en un solo insert. El detalle de la
    // acción va una vez — antes cada fila se llevaba la lista entera de ids.
    const detalle: Record<string, unknown> =
      data.action === "move" ? { folderId: data.folderId }
      : data.action === "tag" ? { tag: data.tag }
      : data.action === "favorite" ? { favorite: data.favorite }
      : data.action === "status" ? { status: data.status }
      : {};
    DocumentsDB.logMany(auth.tenantId, destinoOculto ? [] : ids, {
      actorId: auth.username,
      action: data.action === "delete" ? "delete" : data.action === "move" ? "move" : "tag",
      metadata: { bulk: true, action: data.action, total: ids.length, ...detalle },
    }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

    return NextResponse.json({ ok: true, affected });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
