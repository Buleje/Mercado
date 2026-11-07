import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { stampDocument } from "@/lib/documents/stamp-document";
import { STAMP_PRESETS, type StampPreset } from "@/lib/documents/pdf-stamp";

const Body = z.object({
  preset: z.enum(Object.keys(STAMP_PRESETS) as [StampPreset, ...StampPreset[]]),
  customText: z.string().max(24).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const rl = await applyRateLimit(req, "STRICT", "documents:stamp");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });

  const result = await stampDocument(auth.tenantId, id, {
    preset: parsed.data.preset,
    customText: parsed.data.customText,
    actorId: auth.username,
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    viewerRole: auth.role,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ version: result.version });
}
