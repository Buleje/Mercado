import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { WhatsAppMessagesDB } from "@/lib/db/whatsapp-messages.db";

// Teléfono E.164 sin + (mismo formato que guarda el webhook), 8-15 dígitos.
const PhoneSchema = z.string().regex(/^\d{8,15}$/, "Teléfono inválido");

/**
 * GET /api/admin/whatsapp/messages?phone=519xxxxxxxx — hilo con un cliente.
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "admin-whatsapp-inbox");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = PhoneSchema.safeParse(req.nextUrl.searchParams.get("phone") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: "phone requerido (solo dígitos)" }, { status: 400 });
  }

  try {
    const messages = await WhatsAppMessagesDB.listMessages(auth.tenantId, parsed.data);
    return NextResponse.json({ messages });
  } catch (e) {
    logger.error("[admin/whatsapp/messages] GET error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error de base de datos" }, { status: 503 });
  }
}

/**
 * PATCH /api/admin/whatsapp/messages — marcar conversación como leída.
 * Body: { phone }
 */
export async function PATCH(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "admin-whatsapp-inbox");
  if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = z.object({ phone: PhoneSchema }).safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "phone requerido (solo dígitos)" }, { status: 400 });
  }

  try {
    const count = await WhatsAppMessagesDB.markRead(auth.tenantId, parsed.data.phone);
    return NextResponse.json({ ok: true, marked: count });
  } catch (e) {
    logger.error("[admin/whatsapp/messages] PATCH error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error de base de datos" }, { status: 503 });
  }
}
