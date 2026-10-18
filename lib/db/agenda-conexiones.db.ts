/**
 * Agenda de Administración (ADR-501) — lo que sale del panel hacia afuera:
 * el feed ICS (Google Calendar, Outlook, Apple por suscripción) y la conexión
 * con Google Calendar + Google Tasks por OAuth.
 *
 * `tenantId` es el 1.er parámetro de todo, salvo `feedPorToken`: el ICS público
 * no sabe de qué negocio es hasta mirar el token (como un webhook), y devuelve
 * el tenantId de la fila. En la base vive sólo el sha256 del token.
 *
 * Las actividades se leen con consultas propias (no con AgendaDB): este archivo
 * sólo necesita lo que se publica — nombre, regla, con quién, repetición, hora y
 * nota — y nunca montos.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { PREFIJO_NOTA_DE_SISTEMA } from "@/lib/db/notes.db";
import { AgendaFuentesDB } from "@/lib/db/agenda-fuentes.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { puedeConectarAgenda } from "@/lib/admin/agenda-acceso";
import type { AdminRole } from "@/lib/session";
import type { ActividadIcs, DatosIcs, NotaIcs, TareaIcs, VencimientoIcs } from "@/lib/agenda/ics";
import {
  FRECUENCIAS_AGENDA,
  INCLUYE_FEED_ICS,
  REGLAS_AGENDA,
  type ConexionGoogleDTO,
  type FechaKey,
  type FeedIcsDTO,
  type FrecuenciaAgenda,
  type IncluyeFeedIcs,
  type ReglaAgenda,
} from "@/lib/agenda/tipos";

// ── Constantes ──────────────────────────────────────────────────────────────

/** Feeds vivos por negocio: más que esto es una URL olvidada en algún lado. */
export const TOPE_FEEDS_ACTIVOS = 10;
/** `ultimoUso` se anota como mucho una vez por hora (Google pide el feed seguido). */
const FRENO_ULTIMO_USO_MS = 60 * 60_000;
/** Notas y tareas con fecha que entran al feed / a Google Tasks. */
export const VENTANA_DIAS_ATRAS = 90;
export const VENTANA_DIAS_ADELANTE = 365;
/** Tope de filas por tipo (un feed es texto: 500 eventos ya son ~300 KB). */
const TOPE_FILAS = 500;
export const SCOPE_TASKS = "https://www.googleapis.com/auth/tasks";

const claveFeeds = (tenantId: string) => `agenda:${tenantId}:feeds`;

/** Auditoría de conectar/revocar (fire-and-forget: no frena la respuesta). */
function auditar(tenantId: string, usuario: string, action: string, entity: string, entityId: string, detail: string): void {
  ActivityLogDB.create(tenantId, { action, entity, entityId, detail, user: usuario }).catch((err: unknown) =>
    logger.error("[agenda-conexiones] auditoría falló", { tenantId, action, error: String(err) }),
  );
}

// ── Utilidades ──────────────────────────────────────────────────────────────

/** sha256 hex del token del feed: es lo único que se guarda. */
export function hashTokenFeed(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function fechaKey(d: Date): FechaKey {
  return d.toISOString().slice(0, 10);
}

/** «YYYY-MM-DD» → Date a medianoche UTC (así guarda Prisma las `@db.Date`). */
function aFechaDb(f: FechaKey): Date {
  return new Date(`${f}T00:00:00.000Z`);
}

/** Hoy en Lima (UTC−5 fijo) como FechaKey. */
function hoyLima(ahora = Date.now()): FechaKey {
  return new Date(ahora - 5 * 3_600_000).toISOString().slice(0, 10);
}

function masDias(f: FechaKey, n: number): FechaKey {
  return fechaKey(new Date(aFechaDb(f).getTime() + n * 86_400_000));
}

function esRegla(v: string): v is ReglaAgenda {
  return (REGLAS_AGENDA as readonly string[]).includes(v);
}
function esFrecuencia(v: string): v is FrecuenciaAgenda {
  return (FRECUENCIAS_AGENDA as readonly string[]).includes(v);
}
function esIncluye(v: string): v is IncluyeFeedIcs {
  return (INCLUYE_FEED_ICS as readonly string[]).includes(v);
}

const SELECT_FEED = {
  id: true,
  nombre: true,
  tokenPista: true,
  incluye: true,
  createdAt: true,
  ultimoUso: true,
} as const;

function aFeedDTO(f: { id: string; nombre: string; tokenPista: string; incluye: string[]; createdAt: Date; ultimoUso: Date | null }): FeedIcsDTO {
  return {
    id: f.id,
    nombre: f.nombre,
    pista: f.tokenPista,
    incluye: f.incluye,
    creadoEn: f.createdAt.toISOString(),
    ultimoUso: f.ultimoUso ? f.ultimoUso.toISOString() : null,
  };
}

const SELECT_ACTIVIDAD = {
  id: true,
  nombre: true,
  regla: true,
  objetivoNombre: true,
  frecuencia: true,
  desde: true,
  hasta: true,
  diasSemana: true,
  diaMes: true,
  cadaN: true,
  hora: true,
  nota: true,
  canales: true,
  activo: true,
  deletedAt: true,
  updatedAt: true,
} as const;

interface FilaActividad {
  id: string;
  nombre: string;
  regla: string;
  objetivoNombre: string | null;
  frecuencia: string;
  desde: Date;
  hasta: Date | null;
  diasSemana: number[];
  diaMes: number | null;
  cadaN: number | null;
  hora: string | null;
  nota: string | null;
  canales: string[];
  activo: boolean;
  deletedAt: Date | null;
  updatedAt: Date;
}

/** null = la fila trae una regla o frecuencia que este código no conoce (no se publica). */
function aActividadIcs(a: FilaActividad): ActividadIcs | null {
  if (!esFrecuencia(a.frecuencia)) return null;
  return {
    id: a.id,
    nombre: a.nombre,
    regla: esRegla(a.regla) ? a.regla : "manual",
    objetivoNombre: a.objetivoNombre,
    recurrencia: {
      frecuencia: a.frecuencia,
      desde: fechaKey(a.desde),
      hasta: a.hasta ? fechaKey(a.hasta) : null,
      diasSemana: a.diasSemana,
      diaMes: a.diaMes,
      cadaN: a.cadaN,
    },
    hora: a.hora,
    nota: a.nota,
    actualizado: a.updatedAt,
  };
}

/** Lo que Google necesita saber además de lo publicable: si todavía va. */
export interface ActividadParaGoogle {
  actividad: ActividadIcs | null;
  /** false = borrada, apagada o sin el canal `google` → hay que sacar el evento. */
  va: boolean;
}

export interface FilaConexionGoogle {
  id: string;
  tenantId: string;
  adminUserId: string;
  email: string;
  scopes: string[];
  refreshTokenCifrado: string;
  calendarId: string | null;
  tasklistId: string | null;
  estado: string;
  ultimoError: string | null;
  ultimaSync: Date | null;
}

const SELECT_CONEXION = {
  id: true,
  tenantId: true,
  adminUserId: true,
  email: true,
  scopes: true,
  refreshTokenCifrado: true,
  calendarId: true,
  tasklistId: true,
  estado: true,
  ultimoError: true,
  ultimaSync: true,
} as const;

export function aConexionDTO(c: FilaConexionGoogle): ConexionGoogleDTO {
  const estado = c.estado === "activa" || c.estado === "revocada" || c.estado === "error" ? c.estado : "error";
  return {
    email: c.email,
    estado,
    ultimaSync: c.ultimaSync ? c.ultimaSync.toISOString() : null,
    ultimoError: c.ultimoError,
    tareas: Boolean(c.tasklistId) && c.scopes.includes(SCOPE_TASKS),
  };
}

/** Lo que ve el dueño/admin al listar TODAS las conexiones: quién conectó y su id (para revocar). */
export interface ConexionAdminDTO extends ConexionGoogleDTO {
  id: string;
  /** El usuario del panel que conectó esta cuenta (`adminUserId`). */
  usuario: string;
}

export function aConexionAdminDTO(c: FilaConexionGoogle): ConexionAdminDTO {
  return { id: c.id, usuario: c.adminUserId, ...aConexionDTO(c) };
}

export interface FilaEventoGoogle {
  id: string;
  actividadId: string;
  googleEventId: string | null;
  googleTaskId: string | null;
  huella: string;
}

const SELECT_EVENTO = { id: true, actividadId: true, googleEventId: true, googleTaskId: true, huella: true } as const;

// ── DB class ────────────────────────────────────────────────────────────────

export const AgendaConexionesDB = {
  // ── Feeds ICS ─────────────────────────────────────────────────────────────

  /**
   * Crea un feed y devuelve el token en claro UNA vez (la pantalla arma la URL).
   * `null` = ya hay TOPE_FEEDS_ACTIVOS vivos (la ruta responde 409).
   */
  async crearFeed(
    tenantId: string,
    datos: { nombre?: string; incluye?: IncluyeFeedIcs[] },
    usuario: string,
  ): Promise<{ feed: FeedIcsDTO; token: string } | null> {
    const vivos = await prisma.agendaFeedIcs.count({ where: { tenantId, revocadoEn: null } });
    if (vivos >= TOPE_FEEDS_ACTIVOS) return null;
    const token = randomBytes(32).toString("base64url");
    const fila = await prisma.agendaFeedIcs.create({
      data: {
        tenantId,
        ...(datos.nombre ? { nombre: datos.nombre } : {}),
        ...(datos.incluye?.length ? { incluye: datos.incluye } : {}),
        tokenHash: hashTokenFeed(token),
        tokenPista: token.slice(-4),
        creadoPor: usuario,
      },
      select: SELECT_FEED,
    });
    invalidate(claveFeeds(tenantId));
    auditar(tenantId, usuario, "agenda_feed_crear", "AgendaFeedIcs", fila.id, `Publicó el calendario «${fila.nombre}» (${fila.incluye.join(", ")})`);
    return { feed: aFeedDTO(fila), token };
  },

  /** Los feeds vivos (los revocados no se listan: no hay nada que hacer con ellos). */
  async listarFeeds(tenantId: string): Promise<FeedIcsDTO[]> {
    return getOrSet(claveFeeds(tenantId), 60, async () => {
      const filas = await prisma.agendaFeedIcs.findMany({
        where: { tenantId, revocadoEn: null },
        orderBy: { createdAt: "desc" },
        select: SELECT_FEED,
      });
      return filas.map(aFeedDTO);
    });
  },

  /** null = no existe, es de otro negocio o ya estaba revocado (la ruta responde 404). */
  async revocarFeed(tenantId: string, id: string, usuario: string): Promise<{ nombre: string } | null> {
    const fila = await prisma.agendaFeedIcs.findFirst({ where: { id, tenantId, revocadoEn: null }, select: { nombre: true } });
    if (!fila) return null;
    const { count } = await prisma.agendaFeedIcs.updateMany({
      where: { id, tenantId, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    invalidate(claveFeeds(tenantId));
    if (count === 0) return null;
    auditar(tenantId, usuario, "agenda_feed_revocar", "AgendaFeedIcs", id, `Revocó el calendario «${fila.nombre}»`);
    return fila;
  },

  /**
   * La ÚNICA sin tenantId de entrada: busca por el hash del secreto y devuelve
   * el negocio de la fila. Revocado = null (la ruta responde 404 igual que si no
   * existiera). Anota `ultimoUso` como mucho una vez por hora.
   */
  async feedPorToken(tokenHash: string): Promise<{ id: string; tenantId: string; nombre: string; incluye: IncluyeFeedIcs[] } | null> {
    const fila = await prisma.agendaFeedIcs.findUnique({
      where: { tokenHash },
      select: { id: true, tenantId: true, nombre: true, incluye: true, revocadoEn: true, ultimoUso: true },
    });
    if (!fila || fila.revocadoEn) return null;
    const ahora = new Date();
    if (!fila.ultimoUso || ahora.getTime() - fila.ultimoUso.getTime() > FRENO_ULTIMO_USO_MS) {
      const { count } = await prisma.agendaFeedIcs.updateMany({
        where: {
          id: fila.id,
          tenantId: fila.tenantId,
          revocadoEn: null,
          OR: [{ ultimoUso: null }, { ultimoUso: { lt: new Date(ahora.getTime() - FRENO_ULTIMO_USO_MS) } }],
        },
        data: { ultimoUso: ahora },
      });
      if (count > 0) invalidate(claveFeeds(fila.tenantId));
    }
    return { id: fila.id, tenantId: fila.tenantId, nombre: fila.nombre, incluye: fila.incluye.filter(esIncluye) };
  },

  /**
   * Lo que entra al ICS según `incluye`: actividades activas (todas, sin mirar
   * canales: el feed es «la agenda»), notas con fecha, tareas con vencimiento y
   * vencimientos del sistema (adelantos, entregas pactadas…: sólo el título) en la
   * ventana −90/+365 días. Las notas de sistema (`__…`) nunca.
   */
  async datosParaIcs(tenantId: string, incluye: readonly IncluyeFeedIcs[]): Promise<DatosIcs> {
    const hoy = hoyLima();
    const desdeKey = masDias(hoy, -VENTANA_DIAS_ATRAS);
    const hastaKey = masDias(hoy, VENTANA_DIAS_ADELANTE);
    const desde = aFechaDb(desdeKey);
    const hasta = aFechaDb(hastaKey);
    const [actividades, notas, tareas, vencimientos] = await Promise.all([
      incluye.includes("actividades")
        ? prisma.agendaActividad.findMany({
            where: { tenantId, activo: true, deletedAt: null },
            orderBy: { createdAt: "asc" },
            take: TOPE_FILAS,
            select: SELECT_ACTIVIDAD,
          })
        : Promise.resolve([]),
      incluye.includes("notas") ? notasDeLaVentana(tenantId, desde, hasta) : Promise.resolve([]),
      incluye.includes("tareas") ? tareasDeLaVentana(tenantId, desde, hasta) : Promise.resolve([]),
      incluye.includes("vencimientos")
        ? AgendaFuentesDB.vencimientosDelRango(tenantId, desdeKey, hastaKey).then((vs) =>
            vs.slice(0, TOPE_FILAS).map((v): VencimientoIcs => ({ id: v.id, titulo: v.titulo, fecha: v.fecha })),
          )
        : Promise.resolve([]),
    ]);
    return {
      actividades: actividades.map(aActividadIcs).filter((a): a is ActividadIcs => a !== null),
      notas,
      tareas,
      vencimientos,
    };
  },

  // ── Google ────────────────────────────────────────────────────────────────

  async conexionGoogle(tenantId: string, adminUserId: string): Promise<FilaConexionGoogle | null> {
    return prisma.agendaConexionGoogle.findFirst({ where: { tenantId, adminUserId }, select: SELECT_CONEXION });
  },

  /** Las conexiones que reciben cambios (una por usuario que conectó su cuenta). */
  async conexionesActivas(tenantId: string): Promise<FilaConexionGoogle[]> {
    return prisma.agendaConexionGoogle.findMany({ where: { tenantId, estado: "activa" }, select: SELECT_CONEXION });
  },

  /** Todas las conexiones del negocio (dueño/admin): activas, en error o revocadas. */
  async listarConexiones(tenantId: string): Promise<ConexionAdminDTO[]> {
    const filas = await prisma.agendaConexionGoogle.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: SELECT_CONEXION,
    });
    return filas.map(aConexionAdminDTO);
  },

  /**
   * ¿El usuario que conectó esta cuenta sigue habilitado para hacerlo? (existe,
   * activo y con un rol que permite conectar la agenda). Un admin despedido o
   * bajado a cajero deja de sincronizar: la sync marca la conexión en «error».
   */
  async usuarioSiguePudiendoConectar(tenantId: string, adminUserId: string): Promise<boolean> {
    const u = await AdminUsersDB.getByUsername(tenantId, adminUserId);
    return !!u && u.active && puedeConectarAgenda(u.role as AdminRole);
  },

  /**
   * Alta o reconexión. Si cambió la cuenta o el calendario, los vínculos viejos
   * apuntan a eventos que ya no se ven: se borran y la próxima sincronización
   * crea todo de nuevo en el calendario nuevo.
   */
  async guardarConexionGoogle(
    tenantId: string,
    adminUserId: string,
    datos: { email: string; scopes: string[]; refreshTokenCifrado: string; calendarId: string | null; tasklistId: string | null },
  ): Promise<FilaConexionGoogle> {
    const previa = await prisma.agendaConexionGoogle.findFirst({
      where: { tenantId, adminUserId },
      select: { id: true, email: true, calendarId: true, tasklistId: true },
    });
    if (previa && (previa.email !== datos.email || previa.calendarId !== datos.calendarId || previa.tasklistId !== datos.tasklistId)) {
      await prisma.agendaGoogleEvento.deleteMany({ where: { tenantId, conexionId: previa.id } });
    }
    const valores = {
      email: datos.email,
      scopes: datos.scopes,
      refreshTokenCifrado: datos.refreshTokenCifrado,
      calendarId: datos.calendarId,
      tasklistId: datos.tasklistId,
      estado: "activa",
      ultimoError: null,
    };
    const fila = await prisma.agendaConexionGoogle.upsert({
      where: { tenantId_adminUserId: { tenantId, adminUserId } },
      create: { tenantId, adminUserId, ...valores },
      update: valores,
      select: SELECT_CONEXION,
    });
    auditar(tenantId, adminUserId, "agenda_google_conectar", "AgendaConexionGoogle", fila.id, `Conectó Google (${datos.email})`);
    return fila;
  },

  async marcarConexion(
    tenantId: string,
    conexionId: string,
    datos: { estado?: "activa" | "error"; ultimoError?: string | null; ultimaSync?: Date },
  ): Promise<void> {
    await prisma.agendaConexionGoogle.updateMany({
      where: { id: conexionId, tenantId },
      data: {
        ...(datos.estado ? { estado: datos.estado } : {}),
        ...(datos.ultimoError !== undefined ? { ultimoError: datos.ultimoError ? datos.ultimoError.slice(0, 300) : null } : {}),
        ...(datos.ultimaSync ? { ultimaSync: datos.ultimaSync } : {}),
      },
    });
  },

  /** Borra la conexión y (cascade) sus vínculos. Devuelve la fila borrada para revocar el token en Google. */
  async revocarConexionGoogle(tenantId: string, adminUserId: string): Promise<FilaConexionGoogle | null> {
    const fila = await prisma.agendaConexionGoogle.findFirst({ where: { tenantId, adminUserId }, select: SELECT_CONEXION });
    if (!fila) return null;
    await prisma.agendaConexionGoogle.deleteMany({ where: { id: fila.id, tenantId } });
    auditar(tenantId, adminUserId, "agenda_google_revocar", "AgendaConexionGoogle", fila.id, `Desconectó Google (${fila.email})`);
    return fila;
  },

  /**
   * Revoca CUALQUIER conexión del negocio por id (dueño/admin). Doble filtro
   * `{ id, tenantId }`: ajena, inexistente o de otro negocio → null (la ruta
   * responde 404). `usuarioQueRevoca` es quien hace la acción (para la auditoría).
   */
  async revocarConexionGooglePorId(tenantId: string, id: string, usuarioQueRevoca: string): Promise<FilaConexionGoogle | null> {
    const fila = await prisma.agendaConexionGoogle.findFirst({ where: { id, tenantId }, select: SELECT_CONEXION });
    if (!fila) return null;
    const { count } = await prisma.agendaConexionGoogle.deleteMany({ where: { id, tenantId } });
    if (count === 0) return null;
    auditar(
      tenantId,
      usuarioQueRevoca,
      "agenda_google_revocar",
      "AgendaConexionGoogle",
      fila.id,
      `Desconectó Google de ${fila.adminUserId} (${fila.email})`,
    );
    return fila;
  },

  /** Clave del vínculo: el id de la actividad, `tarea:<id>` o `nota:<id>`. */
  async eventoDe(tenantId: string, conexionId: string, clave: string): Promise<FilaEventoGoogle | null> {
    return prisma.agendaGoogleEvento.findFirst({ where: { tenantId, conexionId, actividadId: clave }, select: SELECT_EVENTO });
  },

  async eventosDeConexion(tenantId: string, conexionId: string): Promise<FilaEventoGoogle[]> {
    return prisma.agendaGoogleEvento.findMany({ where: { tenantId, conexionId }, select: SELECT_EVENTO });
  },

  async guardarEvento(
    tenantId: string,
    conexionId: string,
    clave: string,
    datos: { googleEventId?: string | null; googleTaskId?: string | null; huella: string },
  ): Promise<void> {
    const valores = {
      ...(datos.googleEventId !== undefined ? { googleEventId: datos.googleEventId } : {}),
      ...(datos.googleTaskId !== undefined ? { googleTaskId: datos.googleTaskId } : {}),
      huella: datos.huella,
    };
    // tenantId en el WHERE único: si el vínculo fuera de otro negocio no actualiza, intenta
    // crear y choca con el único (falla en vez de pisar).
    await prisma.agendaGoogleEvento.upsert({
      where: { conexionId_actividadId: { conexionId, actividadId: clave }, tenantId },
      create: { tenantId, conexionId, actividadId: clave, ...valores },
      update: valores,
    });
  },

  async borrarEvento(tenantId: string, conexionId: string, clave: string): Promise<void> {
    await prisma.agendaGoogleEvento.deleteMany({ where: { tenantId, conexionId, actividadId: clave } });
  },

  /** Una actividad para Google: `va=false` si está borrada, apagada o sin canal `google`. */
  async actividadParaGoogle(tenantId: string, actividadId: string): Promise<ActividadParaGoogle> {
    const fila = await prisma.agendaActividad.findFirst({ where: { id: actividadId, tenantId }, select: SELECT_ACTIVIDAD });
    if (!fila) return { actividad: null, va: false };
    const actividad = aActividadIcs(fila);
    return { actividad, va: Boolean(actividad) && fila.activo && !fila.deletedAt && fila.canales.includes("google") };
  },

  /** Todas las actividades que van a Google (sincronización completa). */
  async actividadesParaGoogle(tenantId: string): Promise<ActividadIcs[]> {
    const filas = await prisma.agendaActividad.findMany({
      where: { tenantId, activo: true, deletedAt: null, canales: { has: "google" } },
      orderBy: { createdAt: "asc" },
      take: TOPE_FILAS,
      select: SELECT_ACTIVIDAD,
    });
    return filas.map(aActividadIcs).filter((a): a is ActividadIcs => a !== null);
  },

  /** Tareas con vencimiento y notas con fecha de la ventana (van a la lista «Buleje» de Google Tasks). */
  async pendientesParaTasks(tenantId: string): Promise<{ notas: NotaIcs[]; tareas: TareaIcs[] }> {
    const hoy = hoyLima();
    const desde = aFechaDb(masDias(hoy, -VENTANA_DIAS_ATRAS));
    const hasta = aFechaDb(masDias(hoy, VENTANA_DIAS_ADELANTE));
    const [notas, tareas] = await Promise.all([notasDeLaVentana(tenantId, desde, hasta), tareasDeLaVentana(tenantId, desde, hasta)]);
    return { notas, tareas };
  },

  /**
   * De los vínculos `tarea:`/`nota:` que hay en Google, cuáles siguen teniendo su
   * fila con fecha (los demás se borran de Tasks). Una tarea que sólo salió de la
   * ventana sigue: no se borra de Google por vieja.
   */
  async clavesQueSiguen(tenantId: string, tareaIds: string[], notaIds: string[]): Promise<Set<string>> {
    const [tareas, notas] = await Promise.all([
      tareaIds.length
        ? prisma.adminTask.findMany({ where: { tenantId, id: { in: tareaIds }, dueDate: { not: null } }, select: { id: true } })
        : Promise.resolve([]),
      notaIds.length
        ? prisma.note.findMany({ where: { tenantId, id: { in: notaIds }, fecha: { not: null } }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    return new Set([...tareas.map((t) => `tarea:${t.id}`), ...notas.map((n) => `nota:${n.id}`)]);
  },
};

async function notasDeLaVentana(tenantId: string, desde: Date, hasta: Date): Promise<NotaIcs[]> {
  const filas = await prisma.note.findMany({
    where: {
      tenantId,
      fecha: { gte: desde, lte: hasta },
      NOT: { title: { startsWith: PREFIJO_NOTA_DE_SISTEMA } },
    },
    orderBy: { fecha: "asc" },
    take: TOPE_FILAS,
    select: { id: true, title: true, content: true, fecha: true, updatedAt: true },
  });
  return filas.flatMap((n) =>
    n.fecha ? [{ id: n.id, titulo: n.title, contenido: n.content, fecha: fechaKey(n.fecha), actualizado: n.updatedAt }] : [],
  );
}

async function tareasDeLaVentana(tenantId: string, desde: Date, hasta: Date): Promise<TareaIcs[]> {
  const filas = await prisma.adminTask.findMany({
    where: { tenantId, dueDate: { gte: desde, lte: hasta } },
    orderBy: { dueDate: "asc" },
    take: TOPE_FILAS,
    select: { id: true, title: true, status: true, dueDate: true, updatedAt: true },
  });
  return filas.flatMap((t) =>
    t.dueDate ? [{ id: t.id, titulo: t.title, estado: t.status, fecha: fechaKey(t.dueDate), actualizado: t.updatedAt }] : [],
  );
}
