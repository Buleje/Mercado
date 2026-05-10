import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { getSignedUrl } from "@/lib/documents/storage";


type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:download");
  if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const doc = await DocumentsDB.getById(auth.tenantId, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = await getSignedUrl(doc.storagePath, 60 * 60);
  if (!url) return NextResponse.json({ error: "signed_url_fail" }, { status: 502 });

  DocumentsDB.log(auth.tenantId, {
    documentId: id,
    actorId: auth.username,
    action: "download",
  }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

  return NextResponse.json({ url, filename: doc.originalName });
}
