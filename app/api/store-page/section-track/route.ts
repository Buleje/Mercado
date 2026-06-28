import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { sectionViewIncr } from "@/lib/store-page/ab-store";

/**
 * POST /api/store-page/section-track — beacon PÚBLICO de engagement por sección
 * (audit #12). El visitante lo dispara cuando una sección de /t entra en viewport
 * (una vez por carga). CSRF por cookie + rate-limit + enum estricto de tipos para
 * no inflar claves. Contadores en Redis (con fallback) — sin migración.
 */
const SECTION_TYPES = [
  "about", "hours", "payment", "how-to-order", "faq", "benefits", "gallery",
  "image-text", "cta", "video", "map", "logos", "countdown", "team", "social", "categories",
] as const;

const Body = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i),
  section: z.enum(SECTION_TYPES),
});

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "section-track");
  if (rl) return rl;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await sectionViewIncr(parsed.data.slug, parsed.data.section).catch((err) => { console.warn("[section-track] incr", err); });
  return new NextResponse(null, { status: 204 });
}
