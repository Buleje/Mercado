import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PageHeroesDB } from "@/lib/db/page-heroes.db";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const VALID_PAGES = ["home", "marketplace", "recetas", "negocios", "tienda"] as const;

const CreateSchema = z.object({
  pageSlug: z.enum(VALID_PAGES),
  title: z.string().max(200).nullish(),
  subtitle: z.string().max(500).nullish(),
  imageUrl: z.string().url().nullish(),
  ctaText: z.string().max(100).nullish(),
  ctaLink: z.string().max(500).nullish(),
  gradientFrom: z.string().max(50).nullish(),
  gradientTo: z.string().max(50).nullish(),
});

/** GET — list all heroes (platform-only: requiere sesion superadmin) */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const data = await PageHeroesDB.listAll("__platform__");
  return NextResponse.json({ data });
}

/** POST — create a hero (platform-only: requiere sesion superadmin) */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-page-heroes"); if (_rl) return _rl;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => { logger.error("[superadmin/page-heroes] parse JSON body failed", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.issues }, { status: 400 });

  const hero = await PageHeroesDB.create("__platform__", parsed.data);
  return NextResponse.json({ data: hero }, { status: 201 });
}
