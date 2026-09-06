import "server-only";

/**
 * app/api/admin/telegram/route.ts
 *
 * La consola del bot de Telegram, desde el panel.
 *
 *   GET    → si el bot está configurado, su usuario, los chats vinculados,
 *            el estado del webhook y el código de vinculación vivo (si hay)
 *   POST   → `{ accion: "codigo" }`        emite un código de 15 minutos
 *            `{ accion: "webhook", url? }` registra o borra el webhook
 *   DELETE → `{ chatId }` corta el vínculo de un chat
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { enqueueActivityLog } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { TelegramDB } from "@/lib/db/telegram.db";
import { crearCodigo, codigoVivoDe } from "@/lib/telegram/vinculacion";
import { botConfigurado, datosDelBot, estadoWebhook, registrarWebhook } from "@/lib/telegram/bot";

const AccionSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("codigo") }),
  z.object({ accion: z.literal("webhook"), url: z.string().url().max(500).optional().nullable() }),
]);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const configurado = botConfigurado();
  // Las llamadas a Telegram sólo se hacen si hay token: sin él tiran excepción
  // y la pantalla tiene que poder explicar que falta configurarlo.
  const [bot, webhook, chats] = await Promise.all([
    configurado ? datosDelBot() : Promise.resolve(null),
    configurado ? estadoWebhook() : Promise.resolve(null),
    TelegramDB.listar(auth.tenantId),
  ]);

  return NextResponse.json({
    configurado,
    bot,
    webhook,
    chats,
    codigo: codigoVivoDe(auth.tenantId),
    /**
     * La URL que hay que registrar. Se deriva del origen real del request para
     * que en desarrollo muestre el túnel y en producción el dominio, sin que
     * nadie tenga que armarla a mano (y equivocarse en el path).
     */
    urlWebhookSugerida: `${req.nextUrl.origin}/api/integrations/telegram/webhook`,
  });
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "MODERATE", "telegram-admin");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = AccionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  if (!botConfigurado()) {
    return NextResponse.json(
      { error: "Falta TELEGRAM_BOT_TOKEN en el servidor. Creá el bot con @BotFather y pegá el token en el .env." },
      { status: 400 },
    );
  }

  if (parsed.data.accion === "codigo") {
    const { codigo, expiraEn } = crearCodigo(auth.tenantId, auth.username);
    enqueueActivityLog({
      action: "Crear", resource: "telegram-codigo", resourceId: auth.tenantId,
      userId: auth.username, tenantId: auth.tenantId,
      details: { description: "Código de vinculación de Telegram emitido" },
      timestamp: new Date().toISOString(),
    }).catch((err) => logger.warn("[telegram] activity log falló", { err: String(err) }));
    return NextResponse.json({ codigo, quedanSegundos: Math.round(expiraEn / 1000) });
  }

  // Registrar el webhook es lo único que le habla a Telegram con consecuencias
  // globales: es POR BOT, no por negocio. Con un solo bot para todos los
  // negocios está bien; el día que haya uno por negocio, esto va con su token.
  const res = await registrarWebhook(parsed.data.url ?? null);
  return NextResponse.json({ resultado: res, webhook: await estadoWebhook() });
}

export async function DELETE(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const chatId = Number((body as { chatId?: unknown } | null)?.chatId);
  if (!Number.isFinite(chatId)) {
    return NextResponse.json({ error: "Falta el chat" }, { status: 400 });
  }

  const chats = await TelegramDB.desvincular(auth.tenantId, chatId);
  enqueueActivityLog({
    action: "Eliminar", resource: "telegram-chat", resourceId: String(chatId),
    userId: auth.username, tenantId: auth.tenantId,
    details: { description: `Chat de Telegram desvinculado: ${chatId}` },
    timestamp: new Date().toISOString(),
  }).catch((err) => logger.warn("[telegram] activity log falló", { err: String(err) }));

  return NextResponse.json({ chats });
}
