import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { DocumentsDB } from "@/lib/db/documents.db";
import { assertCsrf } from "@/lib/auth/csrf";


const ShareBody = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional(),
  password: z.string().min(4).max(120).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "MODERATE", "documents:share:list");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const shares = await DocumentsDB.listShares(auth.tenantId, id);
  return NextResponse.json({ shares });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "STRICT", "documents:share:create");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = ShareBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const share = await DocumentsDB.createShare(auth.tenantId, id, {
    createdById: auth.username,
    expiresInDays: parsed.data.expiresInDays,
    password: parsed.data.password,
  });
  if (!share) return NextResponse.json({ error: "not_found" }, { status: 404 });

  DocumentsDB.log(auth.tenantId, {
    documentId: id,
    actorId: auth.username,
    action: "share",
    metadata: { token: share.token.slice(0, 8) + "…", expiresAt: share.expiresAt, hasPassword: share.hasPassword },
  }).catch((err) => logger.warn("documents.audit.fail", { err: String(err) }));

  return NextResponse.json({ share });
}
