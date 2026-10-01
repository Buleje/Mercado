import "server-only";

/**
 * app/api/cron/ia-salud/route.ts
 *
 * Te avisa el día que la IA se cae, no semanas después.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * Groq dio de baja tres modelos sin aviso y el asistente quedó mudo semanas:
 * cada llamada devolvía 404, el router lo traducía a «no pude responder» y desde
 * el chat parecía un problema de conexión. La tarjeta de Automatizaciones
 * (`/api/admin/ia-salud`) lo muestra, pero hay que ir a mirarla — y nadie mira
 * una pantalla que casi siempre está en verde. Esto cierra el círculo.
 *
 * ── Dos decisiones que lo hacen útil en vez de ruido ─────────────────────────
 *
 *  1. **Si está todo bien, NO dice nada.** Un aviso diario de «todo ok» entrena
 *     a ignorar el canal, y el día que llegue el que importa va a pasar de
 *     largo con los demás.
 *  2. **El dedupe va por lo que está roto, no por «hubo un problema».** La
 *     clave del aviso lleva los modelos caídos: si mañana se cae OTRO, avisa de
 *     nuevo; si es el mismo, se queda callado hasta que se arregle.
 *
 * ── Por qué se diagnostica UNA vez y se avisa a muchos ───────────────────────
 * El proveedor y los modelos son de la PLATAFORMA, no de cada negocio: si Groq
 * da de baja un modelo, se cae para todos a la vez. Diagnosticar por tenant
 * sería repetir la misma llamada N veces para obtener la misma respuesta.
 *
 * Autorización: Bearer <CRON_SECRET>.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";
import { TenantsDB } from "@/lib/db/tenants.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { TelegramDB } from "@/lib/db/telegram.db";
import { botConfigurado, mandarMensaje, esc } from "@/lib/telegram/bot";
import { diagnosticarIA, type Diagnostico } from "@/lib/ai/diagnostico";

/**
 * 20 horas, igual que el cron de avisos: un cron diario que corre 09:01 y al día
 * siguiente 08:59 tiene menos de 24 h de diferencia, y con ventana de 24 h el
 * segundo aviso se colaría.
 */
const DEDUP_HORAS = 20;

/** El texto del aviso, en palabras de quien atiende el negocio. Exportado para test. */
export function comoTexto(d: Diagnostico): { titulo: string; cuerpo: string } {
  const rotos = d.modelos.filter((m) => m.estado === "roto");
  const huecos = d.agentes.huecos;

  if (rotos.length > 0) {
    return {
      titulo: "El asistente está mudo",
      cuerpo:
        `El proveedor dejó de servir ${rotos.length === 1 ? "el modelo" : "los modelos"} ` +
        `${rotos.map((m) => m.modelo).join(", ")}. ` +
        `Mientras tanto ${rotos.map((m) => m.para.toLowerCase()).join(" y ")} no funciona: ` +
        `las respuestas fallan sin dar error, como si fuera un problema de conexión. ` +
        `Se arregla actualizando los modelos en lib/llm-providers/groq.ts.`,
    };
  }
  return {
    titulo: "El asistente tiene herramientas que no puede usar",
    cuerpo:
      `${huecos.length} ${huecos.length === 1 ? "herramienta quedó" : "herramientas quedaron"} sin conectar: ` +
      `${huecos.map((h) => h.donde).join(", ")}. ` +
      `El asistente va a contestar «no puedo hacer eso» sin explicar por qué.`,
  };
}

/**
 * La clave del dedupe. Lleva QUÉ está roto para que un problema nuevo vuelva a
 * avisar aunque el anterior siga sin resolverse. Exportada para test.
 */
export function claveDe(d: Diagnostico): string {
  const partes = [
    ...d.modelos.filter((m) => m.estado === "roto").map((m) => `modelo:${m.modelo}`),
    ...d.agentes.huecos.map((h) => `${h.tipo}:${h.donde}`),
  ].sort();
  return `ia-salud:${partes.join("|")}`;
}

async function avisarPorTelegram(tenantId: string, titulo: string, cuerpo: string): Promise<number> {
  if (!botConfigurado()) return 0;
  const chats = await TelegramDB.listar(tenantId);
  let enviados = 0;
  for (const chat of chats) {
    const id = await mandarMensaje(chat.chatId, `⚠️ <b>${esc(titulo)}</b>\n\n${esc(cuerpo)}`);
    if (id) enviados += 1;
  }
  return enviados;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Se fuerza el refresco: el cache de 5 min existe para la pantalla, no para
  // el chequeo diario, que justamente tiene que ir a preguntar de nuevo.
  const d = await diagnosticarIA({ refrescar: true });

  /**
   * `sin-verificar` NO dispara aviso: significa que no se pudo preguntar (sin
   * red, sin API key, el proveedor caído un minuto), y avisar por eso todos los
   * días convertiría esto en el ruido que arriba se decidió evitar. Queda en el
   * log, y la pantalla lo muestra en gris.
   */
  if (d.estado !== "roto") {
    logger.info("[cron/ia-salud] sin novedad", { estado: d.estado, resumen: d.resumen });
    return NextResponse.json({ ok: true, estado: d.estado, avisados: 0 });
  }

  const { titulo, cuerpo } = comoTexto(d);
  const clave = claveDe(d);
  logger.error("[cron/ia-salud] la capa de IA está rota", { clave, resumen: d.resumen });

  const tenants = await TenantsDB.listActive();
  let avisados = 0;

  for (const t of tenants) {
    try {
      const { created } = await NotificationCenterDB.createOrReuse({
        tenantId: t.id,
        type: "ia-salud",
        severity: "alta",
        title: titulo,
        body: cuerpo,
        actionUrl: "/admin?tab=asistente-ia&vista=automatizaciones",
        actionLabel: "Ver el estado de la IA",
        entityId: clave,
        dedupWindowHours: DEDUP_HORAS,
      });
      // Telegram sólo cuando la campana consideró que es un aviso NUEVO: si no,
      // el mismo problema llegaría al chat todos los días.
      if (created) {
        avisados += 1;
        await avisarPorTelegram(t.id, titulo, cuerpo).catch((err) =>
          logger.warn("[cron/ia-salud] no se pudo avisar por Telegram", { error: String(err) }),
        );
      }
    } catch (err) {
      logger.error("[cron/ia-salud] falló el aviso de un negocio", {
        tenantId: t.id,
        error: String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, estado: d.estado, clave, avisados });
}
