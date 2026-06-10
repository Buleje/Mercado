import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PageHeroesDB } from "@/lib/db/page-heroes.db";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const UpdateSchema = z.object({
  title: z.string().max(200).nullish(),
  subtitle: z.string().max(500).nullish(),
  imageUrl: z.string().url().nullish(),
  ctaText: z.string().max(100).nullish(),
  ctaLink: z.string().max(500).nullish(),
  gradientFrom: z.string().max(50).nullish(),
  gradientTo: z.string().max(50).nullish(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/** PUT — update a hero (platform-only: requiere sesion superadmin) */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  try {
    const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-page-heroes-X"); if (_rl) return _rl;
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json().catch((err) => { logger.error("[superadmin/page-heroes/[id]] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });

    const hero = await PageHeroesDB.update("__platform__", id, parsed.data);
    if (!hero) return NextResponse.json({ error: "Hero no encontrado" }, { status: 404 });

    return NextResponse.json({ data: hero });

  } catch (e) {
    logger.error("[put] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** DELETE — remove a hero (platform-only: requiere sesion superadmin) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  try {
    const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-page-heroes-X"); if (_rl) return _rl;
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const hero = await PageHeroesDB.remove("__platform__", id);
    if (!hero) return NextResponse.json({ error: "Hero no encontrado" }, { status: 404 });

    return NextResponse.json({ success: true });

  } catch (e) {
    logger.error("[delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
