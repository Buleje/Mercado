import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { AgendaTelegramDB } from "@/lib/db/agenda-telegram.db";
import { TelegramDB } from "@/lib/db/telegram.db";
import { botConfigurado } from "@/lib/telegram/bot";
import { ResumenTelegramSchema } from "@/lib/agenda/resumen-telegram";
import { mandarResumenDePrueba } from "@/lib/agenda/resumen-telegram.server";
import { primerMensaje } from "@/lib/agenda/schemas";
import { ROLES_ESCRIBIR_AGENDA, puedeEscribirAgenda } from "@/lib/admin/agenda-acceso";

/**
 * /api/admin/agenda/telegram — el resumen de la agenda por Telegram (Brandon 20-10).
 * Es del NEGOCIO (no de la persona): lo cambian quienes escriben la agenda
 * (dueño, admin, encargado: `ROLES_ESCRIBIR_AGENDA`).
 *
 * GET           → `{ config, chats, botConfigurado, enviados }`
 * PUT           → `{ config }` (body `{ manana: "HH:MM" | null, noche: "HH:MM" | null }`)
 * POST ?prueba=1 → manda el resumen de ahora, con «[prueba]», a los chats vinculados.
 */

const SIN_PERMISO = "Sólo el dueño o el encargado cambian el resumen por Telegram";

async function autorizar(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_ESCRIBIR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeEscribirAgenda(auth.role)) return NextResponse.json({ error: SIN_PERMISO }, { status: 403 });
  return auth;
}

export async function GET(req: NextRequest) {
  const auth = await autorizar(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [{ config, enviados }, chats] = await Promise.all([AgendaTelegramDB.leer(auth.tenantId), TelegramDB.listar(auth.tenantId)]);
    return NextResponse.json({ config, chats: chats.length, botConfigurado: botConfigurado(), enviados });
  } catch (err) {
    logger.error("[agenda-telegram] leer falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo leer. Reintenta." }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "agenda-telegram");
  if (rl) return rl;
  const auth = await autorizar(req);
  if (auth instanceof NextResponse) return auth;

  const body = await leerJson(req);
  if (body === null) return NextResponse.json({ error: "Manda la hora de la mañana y la de la noche" }, { status: 400 });
  const parsed = ResumenTelegramSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: primerMensaje(parsed.error) }, { status: 400 });

  try {
    await AgendaTelegramDB.guardarConfig(auth.tenantId, parsed.data);
    return NextResponse.json({ config: parsed.data });
  } catch (err) {
    logger.error("[agenda-telegram] guardar falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se guardó. Reintenta." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  // Prefijo propio: compartirlo con el PUT haría que guardar horas gaste las pruebas.
  const rl = applyRateLimit(req, "STRICT", "agenda-telegram-prueba");
  if (rl) return rl;
  const auth = await autorizar(req);
  if (auth instanceof NextResponse) return auth;
  if (req.nextUrl.searchParams.get("prueba") !== "1") {
    return NextResponse.json({ error: "Sólo se puede mandar uno de prueba (?prueba=1)" }, { status: 400 });
  }

  try {
    const r = await mandarResumenDePrueba(auth.tenantId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (err) {
    logger.error("[agenda-telegram] prueba falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo armar el resumen. Reintenta." }, { status: 503 });
  }
}
