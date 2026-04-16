import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PageHeroesDB } from "@/lib/db/page-heroes.db";
import { z } from "zod";
import { logger } from "@/lib/logger";

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

/** GET — list all heroes for the admin's tenant */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const data = await PageHeroesDB.listAll(auth.tenantId);
  return NextResponse.json({ data });
}

/** POST — create a hero */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch((err) => { logger.error("[superadmin/page-heroes] parse JSON body failed", { error: String(err) }); return null; });
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos invalidos", issues: parsed.error.issues }, { status: 400 });

  const hero = await PageHeroesDB.create(auth.tenantId, parsed.data);
  return NextResponse.json({ data: hero }, { status: 201 });
}
