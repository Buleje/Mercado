import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const BANNERS_PATH = join(process.cwd(), "lib", "data", "promo-banners.json");

const SLOTS = [
  "explorar",
  "explorar-mid",
  "explorar-bottom",
  "bodegas",
  "recetas",
  "ofertas",
] as const;

const BannerSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  imageUrl: z.string().url().nullable(),
  ctaHref: z.string().min(1),
  ctaLabel: z.string().min(1).max(40),
  bgFrom: z.string().regex(/^#[0-9a-f]{6}$/i),
  bgTo: z.string().regex(/^#[0-9a-f]{6}$/i),
  active: z.boolean(),
  order: z.number().int().min(1).max(99),
});

const PutSchema = z.object({
  slot: z.enum(SLOTS),
  banners: z.array(BannerSchema).min(1).max(10),
});

/**
 * GET /api/superadmin/banners — lee todos los slots.
 * PUT /api/superadmin/banners — reemplaza un slot completo con array nuevo.
 *
 * Storage: lib/data/promo-banners.json (file system, MVP).
 * Cuando haya tabla Prisma, reemplazar el read/write file por DB.
 */
export async function GET() {
  try {
    const raw = await readFile(BANNERS_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch (e) {
    console.error("[banners GET] error", e);
    return NextResponse.json({ error: "No se pudieron leer los banners" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  try {
    const raw = await readFile(BANNERS_PATH, "utf8");
    const store = JSON.parse(raw) as Record<string, unknown>;
    store[parsed.data.slot] = parsed.data.banners;
    await writeFile(BANNERS_PATH, JSON.stringify(store, null, 2), "utf8");
    return NextResponse.json({ ok: true, slot: parsed.data.slot, count: parsed.data.banners.length });
  } catch (e) {
    console.error("[banners PUT] error", e);
    return NextResponse.json({ error: "No se pudieron guardar los banners" }, { status: 500 });
  }
}
