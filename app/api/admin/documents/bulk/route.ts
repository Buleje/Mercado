import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";
import { ESTADOS_DOC } from "@/lib/documents/estados-doc";


const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string()).min(1).max(200),
  }),
  z.object({
    action: z.literal("move"),
    ids: z.array(z.string()).min(1).max(200),
    folderId: z.string().nullable(),
  }),
  z.object({
    action: z.literal("tag"),
    ids: z.array(z.string()).min(1).max(200),
    tag: z.string().min(1).max(40),
  }),
  z.object({
    action: z.literal("favorite"),
    ids: z.array(z.string()).min(1).max(200),
    favorite: z.boolean(),
  }),
  // Marcar varios de una: seleccionar diez boletas y ponerlas todas en
  // "aprobado" era, hasta ahora, abrir el menú de estado diez veces.
  z.object({
    action: z.literal("status"),
    ids: z.array(z.string()).min(1).max(200),
    status: z.enum(ESTADOS_DOC),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "documents:bulk");
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

    let affected = 0;
    switch (data.action) {
      case "delete":
        affected = await DocumentsDB.bulkSoftDelete(auth.tenantId, data.ids);
        break;
      case "move":
        affected = await DocumentsDB.bulkMove(auth.tenantId, data.ids, data.folderId);
        break;
      case "tag":
        affected = await DocumentsDB.bulkAddTag(auth.tenantId, data.ids, data.tag);
        break;
      case "favorite": {
        // sin método dedicado — iteramos
        for (const id of data.ids) {
          const r = await DocumentsDB.update(auth.tenantId, id, { favorite: data.favorite });
          if (r) affected++;
        }
        break;
      }
      case "status": {
        for (const id of data.ids) {
          const r = await DocumentsDB.update(auth.tenantId, id, { status: data.status });
          if (r) affected++;
        }
        break;
      }
    }

    // Audit: una entrada por id afectado (siempre que tengamos un id válido)
    for (const id of data.ids) {
      DocumentsDB.log(auth.tenantId, {
        documentId: id,
        actorId: auth.username,
        action: data.action === "delete" ? "delete" : data.action === "move" ? "move" : "tag",
        metadata: { bulk: true, ...data },
      }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));
    }

    return NextResponse.json({ ok: true, affected });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
