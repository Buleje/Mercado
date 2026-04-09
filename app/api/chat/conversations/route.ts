import { NextResponse, type NextRequest } from "next/server";
import { ChatDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

// GET /api/chat/conversations — lista de conversaciones para el inbox admin
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const conversations = await ChatDB.getConversations();
    // Ordenar por último mensaje más reciente
    conversations.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    return NextResponse.json(conversations);
  } catch (e) {
    logger.error("[chat/conversations] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
