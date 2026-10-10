import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { sectionViewStats } from "@/lib/store-page/ab-store";

/**
 * GET /api/store-page/section-stats?slug=<slug>&sections=about,faq — reporte de
 * engagement por sección para el editor (audit #12). Requiere admin. Devuelve
 * cuántas veces se vio cada sección, para que el dueño sepa qué mirar la gente.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  const sections = (req.nextUrl.searchParams.get("sections") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z-]+$/.test(s))
    .slice(0, 30);
  const stats = await sectionViewStats(slug, sections);
  return NextResponse.json({ stats });
}
