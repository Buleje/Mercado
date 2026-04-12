import { NextResponse, type NextRequest } from "next/server";
import { ChatDB } from "@/lib/jsondb";
import { applyRateLimit } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";

// GET: fetch messages for a customer conversation
export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "chat");
  if (rl) return rl;
  const tenantId = getTenantIdFromRequest(req);
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone || !/^9\d{8}$/.test(phone)) {
    return NextResponse.json({ error: "phone requerido (9 dígitos)" }, { status: 400 });
  }
  const messages = await ChatDB.getByPhone(tenantId, phone);
  return NextResponse.json(messages);
}

// POST: customer sends a message
export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "STRICT", "chat");
  if (rl) return rl;
  const tenantId = getTenantIdFromRequest(req);
  const { phone, name, message } = await req.json();
  // Allow special system phones for bot/internal messages
  const isSystemPhone = phone === "sistema" || phone === "bot";
  if (!phone || (!isSystemPhone && !/^9\d{8}$/.test(phone))) {
    return NextResponse.json({ error: "phone inválido" }, { status: 400 });
  }
  if (!message?.trim() || message.trim().length > 500) {
    return NextResponse.json({ error: "Mensaje requerido (máx 500 chars)" }, { status: 400 });
  }
  const msg = await ChatDB.add(tenantId, phone, name || "Cliente", "customer", message.trim());
  return NextResponse.json(msg, { status: 201 });
}
