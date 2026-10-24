import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { splitDocument } from "@/lib/documents/edit-pdf-document";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "STRICT", "documents:split");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const result = await splitDocument(auth.tenantId, id, { actorId: auth.username, viewerRole: auth.role });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ created: result.created, count: result.created.length });
}
