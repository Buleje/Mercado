import "server-only";

/**
 * Resumen de la agenda por Telegram (Brandon 20-10): a la hora de la mañana y
 * a la de la noche que elija cada negocio, un mensaje con lo que toca hoy y lo
 * atrasado. Lo llama el cron `agenda-recordatorios` cada 5 min; sólo manda
 * cuando le llega la hora y una vez por día y momento.
 *
 * Por negocio activo: config (`AgendaTelegramDB`) → ¿algún momento en su
 * ventana y sin salir hoy? → ≥1 chat vinculado → ≥1 actividad prendida →
 * reserva atómica de la marca del día → manda. Si no llegó a ningún chat suelta
 * la marca: el disparo siguiente (dentro de la misma ventana) reintenta.
 *
 * Aparte del aviso «agenda-hoy» del cron `asistente-avisos` (07:20): ése sale
 * sólo con actividades que eligieron el canal telegram; éste es el resumen del
 * negocio entero.
 */
import { logger } from "@/lib/logger";
import { TenantsDB } from "@/lib/db/tenants.db";
import { TelegramDB, type ChatVinculado } from "@/lib/db/telegram.db";
import { AgendaDB } from "@/lib/db/agenda.db";
import { AgendaTelegramDB } from "@/lib/db/agenda-telegram.db";
import { botConfigurado, mandarMensaje } from "@/lib/telegram/bot";
import { diaLima } from "@/lib/agenda/aviso-pantalla";
import { momentoDePrueba, momentosPorMandar, textoResumen, type Momento } from "@/lib/agenda/resumen-telegram";
import type { AdminRole } from "@/lib/session";

/** El cron no tiene sesión: mira la agenda entera, como el dueño (`veTodasLasActividades("admin")`). */
const ROL_QUE_VE_TODO: AdminRole = "admin";
const RUTA_HOY = "/admin?tab=administracion&vista=hoy";

function urlHoy(): string {
  return `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}${RUTA_HOY}`;
}

async function mandarATodos(chats: readonly ChatVinculado[], texto: string): Promise<number> {
  let enviados = 0;
  for (const chat of chats) {
    if (await mandarMensaje(chat.chatId, texto)) enviados += 1;
  }
  return enviados;
}

async function resumenDelNegocio(tenantId: string, ahora: Date): Promise<number> {
  const t = ahora.getTime();
  const { config, enviados } = await AgendaTelegramDB.leer(tenantId);
  const tocan = momentosPorMandar(config, enviados, t);
  if (tocan.length === 0) return 0;

  const chats = await TelegramDB.listar(tenantId);
  if (chats.length === 0) return 0;
  const actividades = await AgendaDB.listarActividades(tenantId, ROL_QUE_VE_TODO);
  if (!actividades.some((a) => a.activo)) return 0;

  const r = await AgendaDB.resumenHoy(tenantId, ROL_QUE_VE_TODO, ahora);
  const fecha = diaLima(t);
  let total = 0;
  for (const m of tocan) {
    if (!(await AgendaTelegramDB.reservarEnvio(tenantId, m, fecha))) continue;
    const n = await mandarATodos(chats, textoResumen(m, r, { url: urlHoy() }));
    if (n === 0) {
      await AgendaTelegramDB.soltarEnvio(tenantId, m, fecha).catch((err) =>
        logger.error("[agenda-telegram] no se pudo soltar la marca", { tenantId, momento: m, error: String(err) }),
      );
    }
    total += n;
  }
  return total;
}

/**
 * CONTRATO: firma fija, el cron ya la llama. Un negocio que falla no frena a
 * los demás.
 */
export async function enviarResumenesTelegram(ahora: Date): Promise<{ enviados: number }> {
  if (!botConfigurado()) return { enviados: 0 };
  const tenants = await TenantsDB.listActive();
  let enviados = 0;
  for (const tenant of tenants) {
    try {
      enviados += await resumenDelNegocio(tenant.id, ahora);
    } catch (err) {
      logger.error("[agenda-telegram] resumen del negocio falló", { tenant: tenant.slug, error: String(err) });
    }
  }
  return { enviados };
}

export type ResultadoPrueba =
  | { ok: true; momento: Momento; chats: number; enviados: number }
  | { ok: false; status: 409 | 422 | 502; error: string };

/** «Mandar uno de prueba»: el resumen de AHORA a los chats del negocio, con «[prueba]», sin tocar la marca del día. */
export async function mandarResumenDePrueba(tenantId: string, ahora: Date = new Date()): Promise<ResultadoPrueba> {
  if (!botConfigurado()) return { ok: false, status: 409, error: "El bot de Telegram no está configurado en el servidor." };
  const chats = await TelegramDB.listar(tenantId);
  if (chats.length === 0) {
    return { ok: false, status: 422, error: "No hay chat vinculado: vincúlalo en Asistente IA › Automatizaciones." };
  }
  const momento = momentoDePrueba(ahora.getTime());
  const r = await AgendaDB.resumenHoy(tenantId, ROL_QUE_VE_TODO, ahora);
  const enviados = await mandarATodos(chats, textoResumen(momento, r, { url: urlHoy(), prueba: true }));
  if (enviados === 0) return { ok: false, status: 502, error: "Telegram no aceptó el mensaje. Reintenta en un rato." };
  return { ok: true, momento, chats: chats.length, enviados };
}
