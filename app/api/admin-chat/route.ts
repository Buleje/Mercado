import { NextResponse, type NextRequest } from "next/server";
import { AdminChatDB } from "@/lib/jsondb";

export async function GET() {
  const messages = await AdminChatDB.getAll();
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const { sender, message } = await req.json();
  if (!sender || !message?.trim()) return NextResponse.json({ error: "sender y message requeridos" }, { status: 400 });
  const msg = await AdminChatDB.add(sender, message.trim());
  return NextResponse.json(msg, { status: 201 });
}
