export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { AdminChatDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { ALLOWED_ROLES } from "@/lib/auth/role-permissions";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ALLOWED_ROLES.CHAT_READ);
  if (auth instanceof NextResponse) return auth;

  const messages = await AdminChatDB.getAll(auth.tenantId);
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ALLOWED_ROLES.CHAT_WRITE);
  if (auth instanceof NextResponse) return auth;

  const { sender, message } = await req.json();
  if (!sender || !message?.trim()) {
    return NextResponse.json({ error: "sender y message requeridos" }, { status: 400 });
  }
  
  const msg = await AdminChatDB.add(sender, message.trim());
  return NextResponse.json(msg, { status: 201 });
}
