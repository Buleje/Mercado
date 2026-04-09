import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  getAllMedia,
  createMedia,
  searchMedia,
} from "@/lib/cms-db/media";
import { MediaSchema } from "@/lib/cms/types";

// ═══════════════════════════════════════════════════════
// GET /api/cms/media - List all media
// ═══════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const folder = searchParams.get("folder") || undefined;
    const query = searchParams.get("q");

    const media = query 
      ? await searchMedia(query)
      : await getAllMedia(folder);

    return NextResponse.json(media);
  } catch (error) {
    console.error("[cms/media] GET error:", error);
    return NextResponse.json(
      { error: "Error al obtener medios" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════
// POST /api/cms/media - Create media entry
// ═══════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = MediaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const validated = parsed.data;

    const media = await createMedia(validated);

    return NextResponse.json(media, { status: 201 });
  } catch (error) {
    console.error("[cms/media] POST error:", error);
    return NextResponse.json(
      { error: "Error al crear medio" },
      { status: 500 }
    );
  }
}
