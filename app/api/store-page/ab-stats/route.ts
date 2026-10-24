import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { abStats } from "@/lib/store-page/ab-store";

/**
 * GET /api/store-page/ab-stats?slug=<slug> — reporte del A/B test para el editor
 * (audit #13). Requiere admin. Devuelve vistas/clicks por variante para que el
 * dueño vea cuál gana. Datos de bajo impacto (contadores de hero), keyed por slug.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const slug = req.nextUrl.searchParams.get("slug")?.trim();
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  const stats = await abStats(slug);
  return NextResponse.json({ stats });
}
