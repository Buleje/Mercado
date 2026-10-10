import "server-only";

/**
 * app/api/cron/asistente-avisos/route.ts
 *
 * El asistente te habla sin que le preguntes.
 *
 * Corre una vez al día, calcula lo que vale la pena contar (`lib/asistente/avisos`)
 * y lo reparte por donde el dueño esté:
 *
 *   1. La campana del panel  — siempre, con dedupe de 20 h para que el mismo
 *      aviso no aparezca dos veces si el cron se dispara de nuevo.
 *   2. El bot de Telegram    — a los chats vinculados, si el bot está configurado.
 *   3. Un flujo de n8n       — el que el dueño haya llamado con la palabra
 *      «aviso», por si quiere que termine en un correo o en una planilla.
 *
 * Autorización: Bearer <CRON_SECRET>.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";
import { TenantsDB } from "@/lib/db/tenants.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { TelegramDB } from "@/lib/db/telegram.db";
import { calcularAvisos, comoTexto, type Aviso } from "@/lib/asistente/avisos";
import { botConfigurado, mandarMensaje } from "@/lib/telegram/bot";
import { getN8nConfig, dispararFlujo } from "@/lib/n8n/flows";

/**
 * 20 horas y no 24: un cron diario que se corre a las 8:59 y al día siguiente a
 * las 9:01 tiene 24 h y 2 min de diferencia, y con ventana de 24 h el segundo
 * aviso se colaría igual. Veinte horas cubre el corrimiento sin dejar pasar dos.
 */
const DEDUP_HORAS = 20;

/** Cuántos avisos se mandan por Telegram. La campana los guarda todos. */
const TOPE_TELEGRAM = 5;

async function avisarPorTelegram(tenantId: string, avisos: Aviso[]): Promise<number> {
  if (!botConfigurado() || avisos.length === 0) return 0;
  const chats = await TelegramDB.listar(tenantId);
  if (chats.length === 0) return 0;

  const cuerpo =
    `☀️ <b>Lo que vi hoy en tu negocio</b>\n\n${comoTexto(avisos.slice(0, TOPE_TELEGRAM))}` +
    (avisos.length > TOPE_TELEGRAM ? `\n\n<i>Y ${avisos.length - TOPE_TELEGRAM} cosas más en el panel.</i>` : "");

  let enviados = 0;
  for (const chat of chats) {
    const id = await mandarMensaje(chat.chatId, cuerpo);
    if (id) enviados += 1;
  }
  return enviados;
}

/**
 * El flujo de n8n que el dueño destinó a los avisos.
 *
 * Se elige por la palabra «aviso» en su nombre, no por un id configurado en otro
 * lado: el dueño ya escribió para qué sirve cada flujo, y pedirle que además lo
 * marque en un selector es pedirle lo mismo dos veces.
 */
async function avisarPorN8n(tenantId: string, avisos: Aviso[]): Promise<boolean> {
  if (avisos.length === 0) return false;
  const { flujos } = await getN8nConfig(tenantId);
  const flujo = flujos.find(
    (f) => f.activo && /avis|resumen|diario|digest/i.test(`${f.nombre} ${f.descripcion}`),
  );
  if (!flujo) return false;

  const res = await dispararFlujo(tenantId, flujo, {
    tipo: "avisos-diarios",
    cantidad: avisos.length,
    avisos: avisos.map((a) => ({
      severidad: a.severidad,
      titulo: a.titulo,
      cuerpo: a.cuerpo,
      pantalla: a.pantalla,
    })),
  });
  return res.ok;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await TenantsDB.listActive();
  const resumen: Array<{ tenant: string; avisos: number; nuevos: number; telegram: number; n8n: boolean }> = [];

  for (const t of tenants) {
    try {
      const avisos = await calcularAvisos(t.id);
      if (avisos.length === 0) {
        resumen.push({ tenant: t.slug, avisos: 0, nuevos: 0, telegram: 0, n8n: false });
        continue;
      }

      // 1 · La campana. `createOrReuse` con la clave del aviso como entityId es
      // lo que hace que «el camión N12 gasta más» no aparezca todos los días.
      let nuevos = 0;
      for (const a of avisos) {
        const { created } = await NotificationCenterDB.createOrReuse({
          tenantId: t.id,
          type: "asistente-aviso",
          severity: a.severidad,
          title: a.titulo,
          body: a.cuerpo,
          actionUrl: a.url,
          actionLabel: `Ver en ${a.pantalla}`,
          entityId: a.clave,
          dedupWindowHours: DEDUP_HORAS,
        });
        if (created) nuevos += 1;
      }

      /**
       * Telegram y n8n sólo con avisos NUEVOS.
       *
       * La campana puede reusar una notificación sin molestar a nadie; un
       * mensaje al celular no. Repetir el mismo aviso cada mañana es la forma
       * más rápida de que el dueño silencie el bot.
       */
      const telegram = nuevos > 0 ? await avisarPorTelegram(t.id, avisos) : 0;
      const n8n = nuevos > 0 ? await avisarPorN8n(t.id, avisos) : false;

      resumen.push({ tenant: t.slug, avisos: avisos.length, nuevos, telegram, n8n });
    } catch (err) {
      // Un tenant que falla no puede dejar sin avisos a los demás.
      logger.error("[asistente-avisos] tenant falló", { tenant: t.slug, error: String(err) });
      resumen.push({ tenant: t.slug, avisos: -1, nuevos: 0, telegram: 0, n8n: false });
    }
  }

  logger.info("[asistente-avisos] corrida completa", {
    tenants: resumen.length,
    conAvisos: resumen.filter((r) => r.avisos > 0).length,
  });
  return NextResponse.json({ ok: true, resumen });
}
