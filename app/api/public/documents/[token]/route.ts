import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { getSignedUrl } from "@/lib/documents/storage";


const Query = z.object({ password: z.string().max(120).optional() });
type Ctx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:public");
  if (rl) return rl;

  const { token } = await ctx.params;
  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const password = parsed.success ? parsed.data.password : undefined;

  const found = await DocumentsDB.findByShareToken(token);
  if (!found) return NextResponse.json({ error: "not_found_or_expired" }, { status: 404 });

  // Validar password si la hay
  if (found.share.hasPassword) {
    const storedHash = await DocumentsDB.getShareRawPassword(token);
    if (!DocumentsDB.verifySharePassword(storedHash, password ?? "")) {
      return NextResponse.json({ error: "password_required", requirePassword: true }, { status: 401 });
    }
  }

  const signedUrl = await getSignedUrl(found.doc.storagePath, 60 * 60);
  if (!signedUrl) return NextResponse.json({ error: "storage_fail" }, { status: 502 });

  // Increment access fire-and-forget
  DocumentsDB.incrementShareAccess(found.share.id).catch((err) =>
    logger.warn("documents.share.increment_fail", { err: String(err) })
  );

  return NextResponse.json({
    document: {
      id: found.doc.id,
      name: found.doc.name,
      mimeType: found.doc.mimeType,
      size: found.doc.size,
      uploadedAt: found.doc.uploadedAt,
    },
    signedUrl,
    share: {
      expiresAt: found.share.expiresAt,
      accessCount: found.share.accessCount + 1,
    },
  });
}
