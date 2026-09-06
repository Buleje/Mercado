import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { setBotPaused } from "@/lib/db/whatsapp-messages.db";

const BodySchema = z.object({
  phone: z.string().regex(/^\d{8,15}$/, "Teléfono inválido"),
  paused: z.boolean(),
});

/**
 * POST /api/admin/whatsapp/bot-pause — pausa/reanuda el bot IA en UN hilo.
 * Pausado = el webhook persiste y notifica el mensaje entrante pero NO
 * auto-responde; el operador contesta a mano desde el inbox.
 */
export async function POST(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "admin-whatsapp-bot-pause");
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
    const pausedPhones = await setBotPaused(
      auth.tenantId,
      parsed.data.phone,
      parsed.data.paused,
    );
    logger.info("[admin/whatsapp/bot-pause] actualizado", {
      tenantId: auth.tenantId,
      paused: parsed.data.paused,
    });
    return NextResponse.json({ ok: true, pausedPhones });
  } catch (e) {
    logger.error("[admin/whatsapp/bot-pause] error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 503 });
  }
}
