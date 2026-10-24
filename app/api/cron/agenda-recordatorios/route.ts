import "server-only";

/**
 * app/api/cron/agenda-recordatorios/route.ts
 *
 * El reloj de los recordatorios de la agenda (Brandon 20-10), cada 5 minutos:
 *   1. el resumen por Telegram de la mañana y de la noche (`resumen-telegram.server`);
 *   2. el aviso al celular a la hora de cada actividad (`push-agenda.server`).
 * Cada uno decide si le llegó su hora y no repite (una vez por día y momento).
 * Uno que falla no frena al otro.
 *
 * Quién lo llama: el timer local `agenda-recordatorios.timer` de la PC
 * (`scripts/agenda-recordatorios.sh`), porque el panel corre en la PC y el cron
 * de Vercel del plan actual sólo puede una vez al día.
 *
 * Autorización: Bearer <CRON_SECRET>.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";
import { enviarResumenesTelegram } from "@/lib/agenda/resumen-telegram.server";
import { enviarPushAgenda } from "@/lib/agenda/push-agenda.server";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ahora = new Date();
  const [telegram, celular] = await Promise.allSettled([enviarResumenesTelegram(ahora), enviarPushAgenda(ahora)]);
  const resultado = (r: PromiseSettledResult<{ enviados: number }>, cual: string) => {
    if (r.status === "fulfilled") return r.value.enviados;
    logger.error(`[agenda-recordatorios] ${cual} falló`, { error: String(r.reason) });
    return null;
  };
  return NextResponse.json({ ok: true, telegram: resultado(telegram, "telegram"), celular: resultado(celular, "celular") });
}
