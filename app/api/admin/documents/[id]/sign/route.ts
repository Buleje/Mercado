import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { applySignature } from "@/lib/documents/sign-document";
import { assertCsrf } from "@/lib/auth/csrf";


const SignBody = z.object({
  signerName: z.string().min(2).max(120),
  signerRole: z.string().max(120).optional(),
  signatureImagePngBase64: z.string().max(2_500_000).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "STRICT", "documents:sign");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = SignBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await applySignature(auth.tenantId, id, {
    signerName: parsed.data.signerName,
    signerRole: parsed.data.signerRole,
    signatureImagePngBase64: parsed.data.signatureImagePngBase64,
    actorId: auth.username,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    version: result.version,
    originalSha256: result.originalSha256,
    signedAt: result.signedAt,
  });
}
