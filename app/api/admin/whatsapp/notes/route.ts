import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { setConversationNote } from "@/lib/db/whatsapp-messages.db";

const BodySchema = z.object({
  phone: z.string().regex(/^\d{8,15}$/, "Teléfono inválido"),
  note: z.string().max(500),
});

/**
 * POST /api/admin/whatsapp/notes — nota interna de la conversación
 * (solo la ve el equipo; nota vacía = borrar).
 */
export async function POST(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-notes");
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

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const notesMap = await setConversationNote(
      auth.tenantId,
      parsed.data.phone,
      parsed.data.note,
    );
    return NextResponse.json({ ok: true, notesMap });
  } catch (e) {
    logger.error("[admin/whatsapp/notes] error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 503 });
  }
}
