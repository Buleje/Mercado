import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PlatformChatDB } from "@/lib/db/platform-chat.db";
import { logger } from "@/lib/logger";

// Bandeja de la PLATAFORMA en el panel del negocio. El tenant lee/responde los
// mensajes que le manda Buleje (superadmin). Scope tenantId obligatorio.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const conversations = await PlatformChatDB.listForTenant(auth.tenantId);
    const unread = await PlatformChatDB.unreadTotalForTenant(auth.tenantId);
    return NextResponse.json({ conversations, unread });
  } catch (e) {
    logger.error("[admin/platform-chat] list error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
