import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { publishPage } from "@/lib/cms-db/pages";
import { logger } from "@/lib/logger";

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
    logger.error("[cms/pages/publish] error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al publicar página" },
      { status: 500 }
    );
  }
}
