import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { publishPage } from "@/lib/cms-db/pages";

// ═══════════════════════════════════════════════════════
// POST /api/cms/pages/:id/publish - Publish page
// ═══════════════════════════════════════════════════════
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const page = await publishPage(id);
    return NextResponse.json(page);
  } catch (error) {
    console.error("[cms/pages/publish] error:", error);
    return NextResponse.json(
      { error: "Error al publicar página" },
      { status: 500 }
    );
  }
}
