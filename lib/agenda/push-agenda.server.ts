import "server-only";
import { TenantsDB } from "@/lib/db/tenants.db";

/**
 * Aviso de la agenda al celular por Web Push (Brandon 20-10): a la hora de cada
 * actividad pendiente, a los celulares que cada persona prendió, aunque el
 * navegador esté cerrado. Lo llama el cron `agenda-recordatorios` cada 5 min;
 * una vez por actividad y día.
 *
 * Qué toca y el texto: `push-agenda.ts` (puro). Acá, por cada negocio del
 * índice: el resumen de hoy de cada persona con SU rol vigente (cajero y
 * almacenero ven sólo lo suyo), el dedupe bajo candado ANTES de mandar, y el
 * envío con el mismo `mandarPush` de las cámaras (claves VAPID del entorno en
 * cada envío). 404/410 → se olvida el dispositivo. Un aviso que no llegó a
 * ningún celular de la persona se devuelve: el próximo disparo (dentro de los
 * 10 min) lo reintenta.
 */

import { logger } from "@/lib/logger";
import { AgendaDB } from "@/lib/db/agenda.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { puedeLeerAgenda } from "@/lib/admin/agenda-acceso";
import { clavesVapid, esPushMuerto, mandarPush, type ClavesVapid, type EnvioPush } from "@/lib/camaras/avisar-push.server";
import type { AdminRole } from "@/lib/session";
import { diaLima } from "./aviso-pantalla";
import { AgendaCelularesStore } from "./push-agenda-dispositivos.server";
import {
  URL_AGENDA_HOY,
  avisosQueTocan,
  claveAvisado,
  topicDe,
  type DispositivoAgenda,
  type PedidoAviso,
} from "./push-agenda";
import type { ResumenAgendaHoy } from "./tipos";

const llego = (e: EnvioPush) => e.status !== null && e.status >= 200 && e.status < 300;

/** El rol VIGENTE de cada persona con celulares (dado de baja o sin acceso a la agenda → fuera). */
async function rolesVigentes(tenantId: string, usernames: readonly string[]): Promise<Map<string, AdminRole>> {
  const roles = new Map<string, AdminRole>();
  await Promise.all(
    usernames.map(async (u) => {
      const fila = await AdminUsersDB.getByUsername(tenantId, u);
      const rol = fila?.role as AdminRole | undefined;
      if (fila?.active && puedeLeerAgenda(rol)) roles.set(u, rol as AdminRole);
    }),
  );
  return roles;
}

async function avisarNegocio(tenantId: string, ahora: Date, vapid: ClavesVapid): Promise<number> {
  const enCache = await AgendaCelularesStore.listar(tenantId);
  if (enCache.dispositivos.length === 0) return 0;

  /* Qué le toca a cada persona: un resumen por ROL (dos cajeros, una lectura). */
  const roles = await rolesVigentes(tenantId, [...new Set(enCache.dispositivos.map((d) => d.username))]);
  const porRol = new Map<AdminRole, Promise<ResumenAgendaHoy>>();
  const pedidos: PedidoAviso[] = [];
  for (const [username, rol] of roles) {
    let resumen = porRol.get(rol);
    if (!resumen) {
      resumen = AgendaDB.resumenHoy(tenantId, rol, ahora);
      porRol.set(rol, resumen);
    }
    for (const aviso of avisosQueTocan(await resumen, ahora)) pedidos.push({ username, aviso });
  }
  if (pedidos.length === 0) return 0;

  const hoy = diaLima(ahora.getTime());
  const { reservados, estado, enISO } = await AgendaCelularesStore.reservar(tenantId, hoy, pedidos, ahora);
  if (reservados.length === 0) return 0;

  const deQuien = new Map<string, DispositivoAgenda[]>();
  for (const d of estado.dispositivos) deQuien.set(d.username, [...(deQuien.get(d.username) ?? []), d]);

  const resultados = await Promise.all(
    reservados.map(async (p) => {
      const { clave, ...carga } = p.aviso;
      const envios = await Promise.all((deQuien.get(p.username) ?? []).map((d) => mandarPush(vapid, d, carga, topicDe(clave))));
      return { p, envios };
    }),
  );

  const enviados = resultados.reduce((n, r) => n + r.envios.filter(llego).length, 0);
  const muertos = resultados.flatMap((r) => r.envios.filter(esPushMuerto).map((e) => e.endpoint));
  const sinLlegar = resultados.filter((r) => !r.envios.some(llego)).map((r) => claveAvisado(hoy, r.p.username, r.p.aviso.clave));
  await Promise.all([
    AgendaCelularesStore.olvidarEndpoints(tenantId, muertos).catch((err) =>
      logger.error("[agenda.push] no se pudieron olvidar los celulares dados de baja", { tenantId, error: String(err) }),
    ),
    AgendaCelularesStore.liberar(tenantId, sinLlegar, enISO).catch((err) =>
      logger.error("[agenda.push] no se pudo devolver el turno de un aviso", { tenantId, error: String(err) }),
    ),
  ]);
  logger.info("[agenda.push] avisos al celular", {
    tenantId,
    avisos: reservados.length,
    enviados,
    sinLlegar: sinLlegar.length,
    codigos: resultados.flatMap((r) => r.envios.map((e) => e.status)),
  });
  return enviados;
}

export async function enviarPushAgenda(ahora: Date): Promise<{ enviados: number }> {
  /* Sólo negocios activos: uno suspendido no sigue mandando avisos (revisión 20-10). */
  const [conCelulares, activos] = await Promise.all([AgendaCelularesStore.negocios(), TenantsDB.listActiveIds()]);
  const vivos = new Set(activos);
  const negocios = conCelulares.filter((id) => vivos.has(id));
  if (negocios.length === 0) return { enviados: 0 };
  const vapid = clavesVapid();
  if (!vapid) {
    logger.warn("[agenda.push] faltan las claves VAPID del servidor: el aviso al celular no sale", { negocios: negocios.length });
    return { enviados: 0 };
  }
  let enviados = 0;
  /* En fila: pocos negocios, y uno que falla (la base, un resumen) no frena a los demás. */
  for (const tenantId of negocios) {
    try {
      enviados += await avisarNegocio(tenantId, ahora, vapid);
    } catch (err) {
      logger.error("[agenda.push] el aviso del negocio falló", { tenantId, error: String(err) });
    }
  }
  return { enviados };
}

/** «Mandar uno de prueba»: un push a cada celular de ESA persona, sin hora ni dedupe. */
export async function probarPushAgenda(
  tenantId: string,
  username: string,
): Promise<{ ok: boolean; enviados: number; total: number; motivo?: string }> {
  const vapid = clavesVapid();
  if (!vapid) return { ok: false, enviados: 0, total: 0, motivo: "sin_claves" };
  const mios = (await AgendaCelularesStore.listar(tenantId)).dispositivos.filter((d) => d.username === username);
  if (mios.length === 0) return { ok: false, enviados: 0, total: 0, motivo: "not_found" };
  const envios = await Promise.all(
    mios.map((d) =>
      mandarPush(
        vapid,
        d,
        {
          title: "Agenda · prueba",
          body: "Así te va a llegar el aviso a la hora de cada actividad.",
          url: URL_AGENDA_HOY,
          tag: "agenda-prueba",
        },
        topicDe("prueba"),
      ),
    ),
  );
  const muertos = envios.filter(esPushMuerto).map((e) => e.endpoint);
  if (muertos.length) await AgendaCelularesStore.olvidarEndpoints(tenantId, muertos);
  const enviados = envios.filter(llego).length;
  if (enviados > 0) return { ok: true, enviados, total: mios.length };
  logger.warn("[agenda.push] la prueba no llegó a ningún celular", { tenantId, status: envios.map((e) => e.status ?? e.error ?? "?") });
  // Todos dados de baja por el servicio = el navegador perdió la suscripción: hay que volver a prender.
  return { ok: false, enviados: 0, total: mios.length, motivo: muertos.length === envios.length ? "muerto" : "no_salio" };
}
