import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { DocumentsDB } from "@/lib/db/documents.db";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/documents/folders/[id]/share — genera un link público para toda
 * una carpeta (`/c/{token}`), con todos sus documentos directos.
 */
const Body = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional(),
  password: z.string().min(4).max(120).optional(),
});
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "documents:folder:share");
    if (rl) return rl;
    const csrfFail = assertCsrf(req);
    if (csrfFail) return csrfFail;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(body);

    const share = await DocumentsDB.createFolderShare(auth.tenantId, id, {
      createdById: auth.username,
      expiresInDays: parsed.success ? parsed.data.expiresInDays : undefined,
      password: parsed.success ? parsed.data.password : undefined,
    });
    if (!share) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ token: share.token, expiresAt: share.expiresAt, hasPassword: share.hasPassword });
  } catch (e) {
    logger.error("[folder.share] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
