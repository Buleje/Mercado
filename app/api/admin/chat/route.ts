import { NextResponse, type NextRequest } from "next/server";
import { ChatDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

// GET: list all conversations or messages for one customer
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const phone = req.nextUrl.searchParams.get("phone");
  if (phone) {
    await ChatDB.markRead(auth.tenantId, phone);
    const messages = await ChatDB.getByPhone(auth.tenantId, phone);
    return NextResponse.json(messages);
  }
  const conversations = await ChatDB.getConversations(auth.tenantId);
  return NextResponse.json(conversations);
}

// POST: admin replies to a customer chat
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { phone, message } = await req.json();
  if (!phone || !message?.trim()) {
    return NextResponse.json({ error: "phone y message requeridos" }, { status: 400 });
  }
  if (message.trim().length > 500) {
    return NextResponse.json({ error: "Mensaje máx 500 chars" }, { status: 400 });
  }
  const msg = await ChatDB.add(auth.tenantId, phone, "Admin", "admin", message.trim());
  return NextResponse.json(msg, { status: 201 });
}
