/**
 * Agenda → Google Calendar/Tasks (ADR-501 §5b). Una sola dirección: lo que se
 * cambia en Google no vuelve al panel.
 *
 * Contrato: quien lo llama NO espera — fire-and-forget con
 * `.catch(err => logger.error(...))`. `sincronizarActividad` nunca lanza: la
 * actividad ya quedó guardada en Buleje y un Google caído sólo deja la conexión
 * con `ultimoError` (o en «error» si Google quitó el permiso).
 *
 *  · `huella` = sha256 de lo último enviado: si no cambió, no se llama a Google.
 *  · Al Calendar van las actividades con el canal `google`; a Tasks (si dio el
 *    permiso) las tareas con vencimiento y las notas con fecha, sólo en la
 *    sincronización completa (al conectar y con «Sincronizar ahora»).
 */
import "server-only";
import { logger } from "@/lib/logger";
import { RUTA_PANEL_AGENDA, type ActividadIcs } from "@/lib/agenda/ics";
import { AgendaConexionesDB, type FilaConexionGoogle, type FilaEventoGoogle } from "@/lib/db/agenda-conexiones.db";
import { ErrorGoogle, SCOPE_TAREAS, olvidarTokenDeAcceso, origenActual, tokenDeAcceso } from "./oauth";
import { borrarEventoGoogle, cuerpoEvento, guardarEventoGoogle, huellaDe, idEventoGoogle } from "./calendar";
import { borrarTareaGoogle, claveNota, claveTarea, cuerpoNota, cuerpoTarea, guardarTareaGoogle } from "./tasks";

/** Llamadas a Google en paralelo por conexión (la cuota por usuario es de ~10/s). */
const EN_PARALELO = 4;
const MENSAJE_PERMISO_PERDIDO = "Google quitó el permiso (o venció): hay que volver a conectar.";
const MENSAJE_USUARIO_SIN_PERMISO =
  "Quien conectó esta cuenta ya no está activo o perdió el permiso de conectar la agenda: se cortó la sincronización.";

export interface ResumenSync {
  enviados: number;
  sinCambios: number;
  fallidos: number;
}

type Resultado = "enviado" | "sin_cambios";

function urlPanel(origen: string | null): string | null {
  return origen ? `${origen}${RUTA_PANEL_AGENDA}` : null;
}

function mensajeDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Antes de sincronizar: ¿el usuario que conectó esta cuenta sigue habilitado?
 * Si lo despidieron o lo bajaron de rol, NO se sincroniza y la conexión queda en
 * «error» con el motivo (la pantalla pide reconectar / el dueño puede revocarla).
 */
async function conexionHabilitada(tenantId: string, conexion: FilaConexionGoogle): Promise<boolean> {
  if (await AgendaConexionesDB.usuarioSiguePudiendoConectar(tenantId, conexion.adminUserId)) return true;
  olvidarTokenDeAcceso(conexion.id);
  await AgendaConexionesDB.marcarConexion(tenantId, conexion.id, { estado: "error", ultimoError: MENSAJE_USUARIO_SIN_PERMISO }).catch(
    (err: unknown) => logger.error("[agenda/google] no se pudo marcar la conexión deshabilitada", { tenantId, error: mensajeDe(err) }),
  );
  return false;
}

/** El token se pide la primera vez que hace falta (sin cambios = ni se pide). */
function tokenPerezoso(conexion: FilaConexionGoogle): () => Promise<string> {
  let p: Promise<string> | null = null;
  return () => {
    p ??= tokenDeAcceso(conexion);
    return p;
  };
}

/** Anota el error en la conexión. Permiso perdido = estado «error» (la pantalla pide reconectar). */
async function anotarError(tenantId: string, conexion: FilaConexionGoogle, err: unknown): Promise<void> {
  if (err instanceof ErrorGoogle && err.esPermisoPerdido) {
    olvidarTokenDeAcceso(conexion.id);
    await AgendaConexionesDB.marcarConexion(tenantId, conexion.id, { estado: "error", ultimoError: MENSAJE_PERMISO_PERDIDO });
    return;
  }
  await AgendaConexionesDB.marcarConexion(tenantId, conexion.id, { ultimoError: mensajeDe(err) });
}

/** Un evento de Calendar: alta/edición si `actividad` va, si no lo saca. */
async function actividadEnConexion(
  tenantId: string,
  conexion: FilaConexionGoogle,
  actividadId: string,
  actividad: ActividadIcs | null,
  url: string | null,
  token: () => Promise<string>,
  vinculoConocido?: FilaEventoGoogle | null,
): Promise<Resultado> {
  if (!conexion.calendarId) return "sin_cambios";
  const vinculo = vinculoConocido !== undefined ? vinculoConocido : await AgendaConexionesDB.eventoDe(tenantId, conexion.id, actividadId);
  const cuerpo = actividad ? cuerpoEvento(actividad, url) : null;
  if (!cuerpo) {
    if (!vinculo) return "sin_cambios";
    if (vinculo.googleEventId) await borrarEventoGoogle(await token(), conexion.calendarId, vinculo.googleEventId);
    await AgendaConexionesDB.borrarEvento(tenantId, conexion.id, actividadId);
    return "enviado";
  }
  const huella = huellaDe({ calendario: conexion.calendarId, cuerpo });
  if (vinculo?.googleEventId && vinculo.huella === huella) return "sin_cambios";
  const eventId = idEventoGoogle(conexion.id, actividadId);
  await guardarEventoGoogle(await token(), conexion.calendarId, eventId, cuerpo, Boolean(vinculo?.googleEventId));
  await AgendaConexionesDB.guardarEvento(tenantId, conexion.id, actividadId, { googleEventId: eventId, huella });
  return "enviado";
}

/**
 * Una actividad recién guardada o borrada → todas las conexiones activas del negocio.
 * Nunca lanza (contrato del stub de la fase 0).
 */
export async function sincronizarActividad(tenantId: string, actividadId: string, accion: "guardar" | "borrar"): Promise<void> {
  try {
    const conexiones = await AgendaConexionesDB.conexionesActivas(tenantId);
    if (!conexiones.length) return;
    const { actividad, va } =
      accion === "borrar"
        ? { actividad: null, va: false }
        : await AgendaConexionesDB.actividadParaGoogle(tenantId, actividadId);
    const url = urlPanel(await origenActual());
    for (const conexion of conexiones) {
      try {
        if (!(await conexionHabilitada(tenantId, conexion))) continue;
        await actividadEnConexion(tenantId, conexion, actividadId, va ? actividad : null, url, tokenPerezoso(conexion));
        await AgendaConexionesDB.marcarConexion(tenantId, conexion.id, { ultimaSync: new Date(), ultimoError: null });
      } catch (err) {
        logger.warn("[agenda/google] no se pudo sincronizar la actividad", {
          tenantId,
          actividadId,
          conexionId: conexion.id,
          error: mensajeDe(err),
        });
        await anotarError(tenantId, conexion, err).catch((e: unknown) =>
          logger.error("[agenda/google] no se pudo anotar el error de la conexión", { tenantId, error: mensajeDe(e) }),
        );
      }
    }
  } catch (err) {
    logger.error("[agenda/google] sincronizarActividad falló", { tenantId, actividadId, accion, error: mensajeDe(err) });
  }
}

async function enParalelo<T>(items: readonly T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const trabajadores = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const x = items[i++];
      await fn(x);
    }
  });
  await Promise.all(trabajadores);
}

/**
 * Sincronización completa de UNA conexión: actividades con canal `google`, lo que
 * sobra en el calendario, y (con permiso de Tasks) tareas y notas con fecha.
 */
async function sincronizarConexion(
  tenantId: string,
  conexion: FilaConexionGoogle,
  actividades: ActividadIcs[],
  pendientes: Awaited<ReturnType<typeof AgendaConexionesDB.pendientesParaTasks>> | null,
  url: string | null,
): Promise<ResumenSync> {
  const r: ResumenSync = { enviados: 0, sinCambios: 0, fallidos: 0 };
  const token = tokenPerezoso(conexion);
  let ultimoError: unknown = null;
  let cortado = false;

  const contar = async (paso: () => Promise<Resultado>) => {
    if (cortado) return;
    try {
      const res = await paso();
      if (res === "enviado") r.enviados++;
      else r.sinCambios++;
    } catch (err) {
      r.fallidos++;
      ultimoError = err;
      if (err instanceof ErrorGoogle && err.esPermisoPerdido) cortado = true;
    }
  };

  const vinculos = await AgendaConexionesDB.eventosDeConexion(tenantId, conexion.id);
  const porClave = new Map(vinculos.map((v) => [v.actividadId, v]));
  const esDeTasks = (clave: string) => clave.startsWith("tarea:") || clave.startsWith("nota:");

  // 1. Calendar: lo que va, y lo que ya no va (borrada, apagada o sin el canal).
  const ids = new Set(actividades.map((a) => a.id));
  await enParalelo(actividades, EN_PARALELO, (a) =>
    contar(() => actividadEnConexion(tenantId, conexion, a.id, a, url, token, porClave.get(a.id) ?? null)),
  );
  const sobran = vinculos.filter((v) => !esDeTasks(v.actividadId) && !ids.has(v.actividadId));
  await enParalelo(sobran, EN_PARALELO, (v) =>
    contar(() => actividadEnConexion(tenantId, conexion, v.actividadId, null, url, token, v)),
  );

  // 2. Tasks (sólo si dio el permiso y la lista existe).
  const listaId = conexion.tasklistId;
  if (pendientes && listaId && conexion.scopes.includes(SCOPE_TAREAS)) {
    const items = [
      ...pendientes.tareas.map((t) => ({ clave: claveTarea(t.id), cuerpo: cuerpoTarea(t, url) })),
      ...pendientes.notas.map((n) => ({ clave: claveNota(n.id), cuerpo: cuerpoNota(n, url) })),
    ];
    const claves = new Set(items.map((x) => x.clave));
    await enParalelo(items, EN_PARALELO, ({ clave, cuerpo }) =>
      contar(async () => {
        const vinculo = porClave.get(clave) ?? null;
        const huella = huellaDe({ lista: listaId, cuerpo });
        if (vinculo?.googleTaskId && vinculo.huella === huella) return "sin_cambios";
        const taskId = await guardarTareaGoogle(await token(), listaId, vinculo?.googleTaskId ?? null, cuerpo);
        await AgendaConexionesDB.guardarEvento(tenantId, conexion.id, clave, { googleTaskId: taskId, huella });
        return "enviado";
      }),
    );
    // Las que ya no están en la ventana: se borran sólo si su fila ya no existe (o perdió la fecha).
    const fuera = vinculos.filter((v) => esDeTasks(v.actividadId) && !claves.has(v.actividadId));
    if (fuera.length && !cortado) {
      const siguen = await AgendaConexionesDB.clavesQueSiguen(
        tenantId,
        fuera.filter((v) => v.actividadId.startsWith("tarea:")).map((v) => v.actividadId.slice("tarea:".length)),
        fuera.filter((v) => v.actividadId.startsWith("nota:")).map((v) => v.actividadId.slice("nota:".length)),
      );
      const borrar = fuera.filter((v) => !siguen.has(v.actividadId));
      await enParalelo(borrar, EN_PARALELO, (v) =>
        contar(async () => {
          if (v.googleTaskId) await borrarTareaGoogle(await token(), listaId, v.googleTaskId);
          await AgendaConexionesDB.borrarEvento(tenantId, conexion.id, v.actividadId);
          return "enviado";
        }),
      );
    }
  }

  if (ultimoError) {
    await anotarError(tenantId, conexion, ultimoError);
    if (!cortado) await AgendaConexionesDB.marcarConexion(tenantId, conexion.id, { ultimaSync: new Date() });
  } else {
    await AgendaConexionesDB.marcarConexion(tenantId, conexion.id, { ultimaSync: new Date(), ultimoError: null });
  }
  return r;
}

/**
 * Todo el negocio (o sólo la conexión de `adminUserId`). La usa «Sincronizar ahora»
 * y la vuelta del OAuth. Tira sólo si la base falla; los errores de Google se cuentan.
 */
export async function sincronizarTenant(
  tenantId: string,
  opciones: { adminUserId?: string; origen?: string | null } = {},
): Promise<ResumenSync> {
  const total: ResumenSync = { enviados: 0, sinCambios: 0, fallidos: 0 };
  const conexiones = opciones.adminUserId
    ? [await AgendaConexionesDB.conexionGoogle(tenantId, opciones.adminUserId)].filter(
        (c): c is FilaConexionGoogle => c !== null && c.estado === "activa",
      )
    : await AgendaConexionesDB.conexionesActivas(tenantId);
  if (!conexiones.length) return total;

  const necesitaTasks = conexiones.some((c) => c.tasklistId && c.scopes.includes(SCOPE_TAREAS));
  const [actividades, pendientes] = await Promise.all([
    AgendaConexionesDB.actividadesParaGoogle(tenantId),
    necesitaTasks ? AgendaConexionesDB.pendientesParaTasks(tenantId) : Promise.resolve(null),
  ]);
  const url = urlPanel(opciones.origen !== undefined ? opciones.origen : await origenActual());
  for (const conexion of conexiones) {
    if (!(await conexionHabilitada(tenantId, conexion))) continue;
    const r = await sincronizarConexion(tenantId, conexion, actividades, pendientes, url);
    total.enviados += r.enviados;
    total.sinCambios += r.sinCambios;
    total.fallidos += r.fallidos;
  }
  return total;
}
