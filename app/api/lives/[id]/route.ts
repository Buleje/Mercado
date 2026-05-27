import { NextRequest, NextResponse } from "next/server";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/lives/[id] — detalle público de una transmisión
 * Retorna session + products + messages approved.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await LiveSessionsDB.getById(null, id);
    if (!result) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    // F3: Strip tenantId del session — no exponer IDs internos en respuesta pública
    const { session, ...restResult } = result as unknown as {
      session: Record<string, unknown>;
      [key: string]: unknown;
    };
     
    const { tenantId: _tid, ...safeSession } = session;
    const safeResult = { ...restResult, session: safeSession };

    return NextResponse.json(
      { data: safeResult },
      {
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30",
        },
      },
    );
  } catch (err) {
    logger.error("[api/lives/[id]] failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
