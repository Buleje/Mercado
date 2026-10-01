import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { mergeDocuments } from "@/lib/documents/merge-documents";

const Body = z.object({
  ids: z.array(z.string().min(1).max(64)).min(2).max(30),
  name: z.string().max(120).optional(),
  folderId: z.string().max(64).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "documents:merge");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const result = await mergeDocuments(auth.tenantId, parsed.data.ids, {
    name: parsed.data.name,
    folderId: parsed.data.folderId ?? null,
    actorId: auth.username,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ document: result.document, pageCount: result.pageCount, skipped: result.skipped });
}
