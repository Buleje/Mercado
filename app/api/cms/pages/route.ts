export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getAllPages, createPage } from "@/lib/cms-db/pages";
import { PageSchema } from "@/lib/cms/types";

// ═══════════════════════════════════════════════════════
// GET /api/cms/pages - List all pages
// ═══════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const pages = await getAllPages();
    return NextResponse.json(pages);
  } catch (error) {
    console.error("[cms/pages] GET error:", error);
    return NextResponse.json(
      { error: "Error al obtener páginas" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════
// POST /api/cms/pages - Create new page
// ═══════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = PageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const validated = parsed.data;

    const page = await createPage(validated);

    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    console.error("[cms/pages] POST error:", error);
    return NextResponse.json(
      { error: "Error al crear página" },
      { status: 500 }
    );
  }
}
