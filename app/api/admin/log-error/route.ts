/**
 * POST /api/admin/log-error — endpoint público de logging para error boundaries.
 *
 * Usado por `app/admin/error.tsx` para reportar errores runtime del panel admin.
 * Público (sin auth) porque los error boundaries pueden dispararse antes del login.
 * El payload solo contiene info no sensible (error.message + digest + source).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";

const LogErrorSchema = z.object({
  error: z.string().max(2000),
  digest: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = LogErrorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    logger.warn("[admin-error-boundary]", {
      error: parsed.data.error,
      digest: parsed.data.digest,
      source: parsed.data.source,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
