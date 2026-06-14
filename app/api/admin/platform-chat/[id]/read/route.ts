import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PlatformChatDB } from "@/lib/db/platform-chat.db";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const conv = await PlatformChatDB.getConversation(id);
    if (!conv || conv.tenantId !== auth.tenantId) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    await PlatformChatDB.markRead(id, "tenant");
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[admin/platform-chat] read error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
