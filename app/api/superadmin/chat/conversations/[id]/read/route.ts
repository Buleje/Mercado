import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { PlatformChatDB } from "@/lib/db/platform-chat.db";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    await PlatformChatDB.markRead(id, "platform");
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[superadmin/chat] read error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
