import { NextResponse, type NextRequest } from "next/server";
import { ChatDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

// POST /api/chat/admin — admin envía mensaje a un cliente
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { phone, customerName, message } = raw as Record<string, unknown>;

  if (typeof phone !== "string" || !/^9\d{8}$/.test(phone)) {
    return NextResponse.json({ error: "phone inválido (9 dígitos)" }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim() || message.trim().length > 500) {
    return NextResponse.json({ error: "Mensaje requerido (máx 500 chars)" }, { status: 400 });
  }

  try {
    const msg = await ChatDB.add(
      phone,
      typeof customerName === "string" ? customerName : "Cliente",
      "admin",
      message.trim(),
    );
    logger.info("[chat/admin] mensaje enviado", { phone });
    return NextResponse.json(msg, { status: 201 });
  } catch (e) {
    logger.error("[chat/admin] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// PATCH /api/chat/admin — marcar conversación como leída
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { phone } = raw as Record<string, unknown>;
  if (typeof phone !== "string" || !/^9\d{8}$/.test(phone)) {
    return NextResponse.json({ error: "phone inválido" }, { status: 400 });
  }

  try {
    await ChatDB.markRead(phone);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[chat/admin] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
