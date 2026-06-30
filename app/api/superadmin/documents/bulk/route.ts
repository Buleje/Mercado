import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { SUPERADMIN_DOCS_TENANT } from "@/lib/documents/superadmin-vault";

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
]);

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "sa-documents:bulk");
    if (rl) return rl;
    if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
    const auth = await requirePlatformAPI(req);
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
        affected = await DocumentsDB.bulkSoftDelete(SUPERADMIN_DOCS_TENANT, data.ids);
        break;
      case "move":
        affected = await DocumentsDB.bulkMove(SUPERADMIN_DOCS_TENANT, data.ids, data.folderId);
        break;
      case "tag":
        affected = await DocumentsDB.bulkAddTag(SUPERADMIN_DOCS_TENANT, data.ids, data.tag);
        break;
      case "favorite": {
        // sin método dedicado — iteramos
        for (const id of data.ids) {
          const r = await DocumentsDB.update(SUPERADMIN_DOCS_TENANT, id, { favorite: data.favorite });
          if (r) affected++;
        }
        break;
      }
    }

    // Audit: una entrada por id afectado
    for (const id of data.ids) {
      DocumentsDB.log(SUPERADMIN_DOCS_TENANT, {
        documentId: id,
        actorId: auth.username,
        action: data.action === "delete" ? "delete" : data.action === "move" ? "move" : data.action === "tag" ? "tag" : "tag",
        metadata: { bulk: true, ...data },
      }).catch((err) => logger.warn("sa-documents.audit.fail", { err: String(err) }));
    }

    return NextResponse.json({ ok: true, affected });

  } catch (e) {
    logger.error("[sa-documents/bulk/post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
