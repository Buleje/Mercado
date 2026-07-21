import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DocumentsDB } from "@/lib/db/documents.db";
import { applySignature } from "@/lib/documents/sign-document";

/**
 * POST /api/public/documents/[token]/sign — firma pública por link.
 * Un tercero (sin sesión admin) firma un PDF usando el token de share como
 * credencial. La firma queda como nueva versión + audit "sign" en el drive.
 */
const Body = z.object({
  signerName: z.string().min(2).max(120),
  signerRole: z.string().max(120).optional(),
  signatureImagePngBase64: z.string().max(2_500_000).optional(),
  password: z.string().max(120).optional(),
});

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const rl = await applyRateLimit(req, "STRICT", "documents:public:sign");
    if (rl) return rl;

    const { token } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

    const found = await DocumentsDB.findByShareToken(token);
    if (!found) return NextResponse.json({ error: "not_found_or_expired" }, { status: 404 });

    // Si el share tiene contraseña, exigirla también para firmar.
    if (found.share.hasPassword) {
      const stored = await DocumentsDB.getShareRawPassword(token);
      if (!DocumentsDB.verifySharePassword(stored, parsed.data.password ?? "")) {
        return NextResponse.json({ error: "password_required", requirePassword: true }, { status: 401 });
      }
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    const result = await applySignature(found.doc.tenantId, found.doc.id, {
      signerName: parsed.data.signerName,
      signerRole: parsed.data.signerRole,
      signatureImagePngBase64: parsed.data.signatureImagePngBase64,
      actorId: `firma-externa:${parsed.data.signerName}`,
      ipAddress: ip,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ ok: true, signedAt: result.signedAt });
  } catch (e) {
    logger.error("[public.documents.sign] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
