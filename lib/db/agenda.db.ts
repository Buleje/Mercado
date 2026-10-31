import "server-only";

/**
 * lib/db/agenda.db.ts — actividades y marcas de la agenda de Administración (ADR-501 §8),
 * y la composición de «Hoy» y del calendario con el motor puro (lib/agenda/motor.ts).
 *
 * · `tenantId` SIEMPRE 1.er parámetro; nada sale del body.
 * · Cajero, almacenero y analista ven y marcan SÓLO las actividades con su
 *   `responsableRol` (lib/admin/agenda-acceso.ts): el filtro es de esta clase.
 *   Una actividad que el rol no ve responde 404, igual que una ajena.
 * · El objetivo (parte / beneficiario) se busca en ESTE tenant y su nombre sale
 *   de la base, nunca del cliente.
 * · Editar = `updateMany` con `updatedAt = version` en el WHERE: 0 filas = 409.
 * · Cada write: `invalidateByPrefix(\`agenda:${tenantId}:\`)` + auditoría.
 */
import { prisma } from "@/lib/prisma";
import type { AgendaActividad, Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import type { AdminRole } from "@/lib/session";
import { checkPermission, type Role } from "@/lib/auth/role-permissions";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { NotesDB } from "@/lib/db/notes.db";
import { AgendaFuentesDB } from "@/lib/db/agenda-fuentes.db";
import { SeguimientoClientasDB } from "@/lib/db/seguimiento-clientas.db";
import type { SeguimientoClienta } from "@/lib/agenda/seguimiento-clientas";
import { puedeVerActividad } from "@/lib/admin/agenda-acceso";
import {
  calcularOcurrencias,
  esDiaDeLaActividad,
  horaDeLima,
  rangoDeHoy,
  resumirHoy,
  type FuentesDelRango,
  type MarcaManual,
} from "@/lib/agenda/motor";
import { sumarDias } from "@/lib/agenda/recurrencia";
import { OBJETIVO_POR_REGLA, validarActividadCompleta } from "@/lib/agenda/schemas";
import type { ActividadCrearInput, ActividadEditarInput, MarcarOcurrenciaInput } from "@/lib/agenda/schemas";
import type {
  ActividadDTO,
  CanalAgenda,
  ColorAgenda,
  DiaAgenda,
  EstadoManual,
  FechaKey,
  FrecuenciaAgenda,
  ObjetivoActividad,
  OcurrenciaDTO,
  ReglaAgenda,
  ResumenAgendaHoy,
  TareaDelDia,
} from "@/lib/agenda/tipos";

const TTL = 60;

const fechaADate = (f: FechaKey) => new Date(`${f}T00:00:00Z`);
const dateAFecha = (d: Date) => d.toISOString().slice(0, 10);
const prefijo = (tenantId: string) => `agenda:${tenantId}:`;

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

export type ResultadoAgenda<T> =
  | { ok: true; valor: T }
  | { ok: false; status: 400 | 404 | 409; error: string; actual?: ActividadDTO };

const falla = (status: 400 | 404 | 409, error: string, actual?: ActividadDTO): ResultadoAgenda<never> => ({
  ok: false,
  status,
  error,
  ...(actual ? { actual } : {}),
});

function aDTO(r: AgendaActividad): ActividadDTO {
  return {
    id: r.id,
    nombre: r.nombre,
    regla: r.regla as ReglaAgenda,
    objetivo:
      r.objetivoTipo && r.objetivoId
        ? { tipo: r.objetivoTipo as ObjetivoActividad["tipo"], id: r.objetivoId, nombre: r.objetivoNombre ?? "" }
        : null,
    recurrencia: {
      frecuencia: r.frecuencia as FrecuenciaAgenda,
      desde: dateAFecha(r.desde),
      hasta: r.hasta ? dateAFecha(r.hasta) : null,
      diasSemana: r.diasSemana,
      diaMes: r.diaMes,
      cadaN: r.cadaN,
    },
    hora: r.hora,
    canales: r.canales as CanalAgenda[],
    responsableRol: (r.responsableRol as AdminRole | null) ?? null,
    parametros:
      r.parametros && typeof r.parametros === "object" && !Array.isArray(r.parametros)
        ? (r.parametros as Record<string, unknown>)
        : {},
    color: r.color as ColorAgenda,
    nota: r.nota,
    activo: r.activo,
    version: r.updatedAt.toISOString(),
  };
}

function auditar(tenantId: string, usuario: string, action: string, entityId: string, detail: string): void {
  const entity = action.startsWith("agenda_ocurrencia") ? "AgendaOcurrencia" : "AgendaActividad";
  ActivityLogDB.create(tenantId, { action, entity, entityId, detail, user: usuario }).catch((err) =>
    logger.error("[agenda] auditoría falló", { tenantId, action, error: String(err) }),
  );
}

/** El objetivo existe en ESTE tenant; devuelve el nombre de la base. */
async function resolverObjetivo(
  tenantId: string,
  objetivo: { tipo: ObjetivoActividad["tipo"]; id: string } | null,
): Promise<ObjetivoActividad | null | "ajeno"> {
  if (!objetivo) return null;
  const fila =
    objetivo.tipo === "parte"
      ? await prisma.forestParty.findFirst({ where: { tenantId, id: objetivo.id, deletedAt: null }, select: { nombre: true } })
      : await prisma.adelantoBeneficiario.findFirst({ where: { tenantId, id: objetivo.id }, select: { nombre: true } });
  return fila ? { tipo: objetivo.tipo, id: objetivo.id, nombre: fila.nombre } : "ajeno";
}

function columnasDe(datos: {
  nombre: string;
  regla: ReglaAgenda;
  objetivo: ObjetivoActividad | null;
  recurrencia: ActividadDTO["recurrencia"];
  hora: string | null;
  canales: CanalAgenda[];
  responsableRol: string | null;
  parametros: Record<string, unknown>;
  color: ColorAgenda;
  nota: string | null;
  activo: boolean;
}) {
  return {
    nombre: datos.nombre,
    regla: datos.regla,
    objetivoTipo: datos.objetivo?.tipo ?? null,
    objetivoId: datos.objetivo?.id ?? null,
    objetivoNombre: datos.objetivo?.nombre ?? null,
    frecuencia: datos.recurrencia.frecuencia,
    desde: fechaADate(datos.recurrencia.desde),
    hasta: datos.recurrencia.hasta ? fechaADate(datos.recurrencia.hasta) : null,
    diasSemana: datos.recurrencia.diasSemana,
    diaMes: datos.recurrencia.diaMes,
    cadaN: datos.recurrencia.cadaN,
    hora: datos.hora,
    canales: datos.canales,
    responsableRol: datos.responsableRol,
    parametros: datos.parametros as Prisma.InputJsonValue,
    color: datos.color,
    nota: datos.nota,
    activo: datos.activo,
  };
}

const esUnicoDuplicado = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";

/** Las notas del calendario: los mismos roles que `/api/notes` (+ el bypass de gestión de requireAdmin). */
const ROLES_NOTAS: readonly AdminRole[] = ["admin", "owner", "manager", "cajero", "almacenero"];

/**
 * Seguimiento a clientes (ADR-508) sólo para quien puede ver clientes. Si la
 * consulta falla, la agenda sale igual (sin la lista) y queda en el log.
 */
async function seguimientosPara(
  tenantId: string,
  rol: AdminRole,
  desde: FechaKey,
  hasta: FechaKey,
  hoy: FechaKey,
): Promise<SeguimientoClienta[] | undefined> {
  if (!checkPermission(rol as Role, "customers", "read")) return undefined;
  try {
    return await SeguimientoClientasDB.delRango(tenantId, desde, hasta, hoy);
  } catch (err) {
    logger.error("[agenda] seguimiento a clientes falló", { tenantId, error: String(err) });
    return undefined;
  }
}

export const AgendaDB = {
  // ── Actividades ────────────────────────────────────────────────────────────

  /** Todas las vivas (prendidas y apagadas) que el rol puede ver. */
  async listarActividades(tenantId: string, rol: AdminRole): Promise<ActividadDTO[]> {
    exigirTenant(tenantId);
    const todas = await getOrSet(`${prefijo(tenantId)}actividades`, TTL, async () => {
      const filas = await prisma.agendaActividad.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: [{ activo: "desc" }, { hora: "asc" }, { nombre: "asc" }],
      });
      return filas.map(aDTO);
    });
    return todas.filter((a) => puedeVerActividad(rol, a));
  },

  async crearActividad(tenantId: string, datos: ActividadCrearInput, usuario: string): Promise<ResultadoAgenda<ActividadDTO>> {
    exigirTenant(tenantId);
    const objetivo = await resolverObjetivo(tenantId, datos.objetivo);
    if (objetivo === "ajeno") return falla(404, "No encontré esa cuenta o beneficiario");
    const fila = await prisma.agendaActividad.create({
      data: { tenantId, creadoPor: usuario, ...columnasDe({ ...datos, objetivo }) },
    });
    invalidateByPrefix(prefijo(tenantId));
    auditar(tenantId, usuario, "agenda_actividad_crear", fila.id, `Creó «${fila.nombre}» (${fila.regla})`);
    return { ok: true, valor: aDTO(fila) };
  },

  /**
   * Mezcla el PATCH con la fila, valida la actividad ENTERA y escribe sólo si
   * nadie la cambió desde `datos.version`. Devuelve también cómo estaba (para Google).
   */
  async editarActividad(
    tenantId: string,
    id: string,
    datos: ActividadEditarInput,
    usuario: string,
  ): Promise<ResultadoAgenda<{ actividad: ActividadDTO; antes: ActividadDTO }>> {
    exigirTenant(tenantId);
    const fila = await prisma.agendaActividad.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!fila) return falla(404, "No encontré esa actividad");
    const antes = aDTO(fila);
    if (antes.version !== datos.version) return falla(409, "Alguien cambió esta actividad. Revisa lo nuevo.", antes);

    const regla = datos.regla ?? antes.regla;
    const cambiaRegla = regla !== antes.regla;
    // Cambia la regla y no vino objetivo: el viejo se queda sólo si es del tipo que la nueva admite.
    const objetivoPedido =
      datos.objetivo !== undefined
        ? datos.objetivo
        : cambiaRegla && OBJETIVO_POR_REGLA[regla]?.tipo !== antes.objetivo?.tipo
          ? null
          : antes.objetivo;
    const parametros = datos.parametros ?? (cambiaRegla ? {} : antes.parametros);
    const valida = validarActividadCompleta({ regla, objetivo: objetivoPedido, parametros });
    if (!valida.ok) return falla(400, valida.error);

    const objetivo =
      datos.objetivo !== undefined ? await resolverObjetivo(tenantId, datos.objetivo) : objetivoPedido;
    if (objetivo === "ajeno") return falla(404, "No encontré esa cuenta o beneficiario");

    const mezcla = {
      nombre: datos.nombre ?? antes.nombre,
      regla,
      objetivo,
      recurrencia: datos.recurrencia ?? antes.recurrencia,
      hora: datos.hora !== undefined ? datos.hora : antes.hora,
      canales: datos.canales ?? antes.canales,
      responsableRol: datos.responsableRol !== undefined ? datos.responsableRol : antes.responsableRol,
      parametros: valida.parametros,
      color: datos.color ?? antes.color,
      nota: datos.nota !== undefined ? datos.nota : antes.nota,
      activo: datos.activo ?? antes.activo,
    };
    const { count } = await prisma.agendaActividad.updateMany({
      where: { tenantId, id, deletedAt: null, updatedAt: new Date(datos.version) },
      data: { ...columnasDe(mezcla), updatedAt: new Date() },
    });
    if (count === 0) {
      const actual = await prisma.agendaActividad.findFirst({ where: { tenantId, id, deletedAt: null } });
      return actual
        ? falla(409, "Alguien cambió esta actividad. Revisa lo nuevo.", aDTO(actual))
        : falla(404, "No encontré esa actividad");
    }
    invalidateByPrefix(prefijo(tenantId));
    const nueva = await prisma.agendaActividad.findFirst({ where: { tenantId, id } });
    if (!nueva) return falla(404, "No encontré esa actividad");
    auditar(tenantId, usuario, "agenda_actividad_editar", id, `Editó «${nueva.nombre}»`);
    return { ok: true, valor: { actividad: aDTO(nueva), antes } };
  },

  /** Borrado blando: la actividad se apaga y sus marcas quedan (historial). */
  async borrarActividad(tenantId: string, id: string, usuario: string): Promise<ResultadoAgenda<ActividadDTO>> {
    exigirTenant(tenantId);
    const fila = await prisma.agendaActividad.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!fila) return falla(404, "No encontré esa actividad");
    const { count } = await prisma.agendaActividad.updateMany({
      where: { tenantId, id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: usuario, activo: false },
    });
    if (count === 0) return falla(404, "No encontré esa actividad");
    invalidateByPrefix(prefijo(tenantId));
    auditar(tenantId, usuario, "agenda_actividad_borrar", id, `Borró «${fila.nombre}»`);
    return { ok: true, valor: aDTO(fila) };
  },

  // ── Marcas ─────────────────────────────────────────────────────────────────

  /** Marcas cuya `fecha` o `posponerA` cae en [desde, hasta]. */
  async ocurrenciasDelRango(tenantId: string, desde: FechaKey, hasta: FechaKey): Promise<MarcaManual[]> {
    exigirTenant(tenantId);
    return getOrSet(`${prefijo(tenantId)}marcas:${desde}:${hasta}`, TTL, async () => {
      const rango = { gte: fechaADate(desde), lte: fechaADate(hasta) };
      const filas = await prisma.agendaOcurrencia.findMany({
        where: { tenantId, OR: [{ fecha: rango }, { posponerA: rango }] },
        select: { actividadId: true, fecha: true, estado: true, posponerA: true, nota: true, marcadoPor: true },
      });
      return filas.map((f) => ({
        actividadId: f.actividadId,
        fecha: dateAFecha(f.fecha),
        estado: f.estado as EstadoManual,
        posponerA: f.posponerA ? dateAFecha(f.posponerA) : null,
        nota: f.nota,
        marcadoPor: f.marcadoPor,
      }));
    });
  },

  async marcarOcurrencia(
    tenantId: string,
    input: MarcarOcurrenciaInput,
    ctx: { rol: AdminRole; usuario: string },
  ): Promise<ResultadoAgenda<OcurrenciaDTO>> {
    exigirTenant(tenantId);
    const fila = await prisma.agendaActividad.findFirst({ where: { tenantId, id: input.actividadId, deletedAt: null } });
    if (!fila || !puedeVerActividad(ctx.rol, fila)) return falla(404, "No encontré esa actividad");
    if (!fila.activo) return falla(400, "La actividad está apagada: préndela para marcarla");
    const hoy = limaDateKey();
    if (input.estado === "hecha" && input.fecha > hoy) return falla(400, "No puedes dar por hecho un día que todavía no llega");

    const actividad = aDTO(fila);
    const pospuestasHacia = await prisma.agendaOcurrencia.findMany({
      where: { tenantId, actividadId: fila.id, estado: "pospuesta", posponerA: fechaADate(input.fecha) },
      select: { fecha: true, posponerA: true, nota: true, marcadoPor: true },
    });
    const previas: MarcaManual[] = pospuestasHacia.map((p) => ({
      actividadId: fila.id,
      fecha: dateAFecha(p.fecha),
      estado: "pospuesta",
      posponerA: input.fecha,
      nota: p.nota,
      marcadoPor: p.marcadoPor,
    }));
    if (!esDiaDeLaActividad(actividad, input.fecha, previas)) return falla(400, "Esa actividad no toca ese día");

    const clave = { tenantId, actividadId: fila.id, fecha: fechaADate(input.fecha) };
    const datos = {
      estado: input.estado,
      posponerA: input.posponerA ? fechaADate(input.posponerA) : null,
      nota: input.nota,
      marcadoPor: ctx.usuario,
    };
    try {
      await prisma.agendaOcurrencia.upsert({
        where: { tenantId_actividadId_fecha: clave },
        create: { ...clave, ...datos },
        update: datos,
      });
    } catch (err) {
      // Dos pestañas crean la misma marca a la vez: la segunda pisa a la primera.
      if (!esUnicoDuplicado(err)) throw err;
      await prisma.agendaOcurrencia.updateMany({ where: clave, data: datos });
    }
    invalidateByPrefix(prefijo(tenantId));
    auditar(tenantId, ctx.usuario, "agenda_ocurrencia_marcar", fila.id, `«${fila.nombre}» ${input.fecha}: ${input.estado}`);

    const marca: MarcaManual = { actividadId: fila.id, fecha: input.fecha, ...datos, posponerA: input.posponerA };
    const [ocurrencia] = calcularOcurrencias({
      actividades: [actividad],
      desde: input.fecha,
      hasta: input.fecha,
      hoy,
      marcas: [marca, ...previas],
      fuentes: {},
    });
    return ocurrencia ? { ok: true, valor: ocurrencia } : falla(400, "Esa actividad no toca ese día");
  },

  /** Deshacer la marca: el día vuelve a lo que diga la fuente (o pendiente). */
  async desmarcarOcurrencia(
    tenantId: string,
    actividadId: string,
    fecha: FechaKey,
    ctx: { rol: AdminRole; usuario: string },
  ): Promise<ResultadoAgenda<{ borradas: number }>> {
    exigirTenant(tenantId);
    const fila = await prisma.agendaActividad.findFirst({ where: { tenantId, id: actividadId, deletedAt: null } });
    if (!fila || !puedeVerActividad(ctx.rol, fila)) return falla(404, "No encontré esa actividad");
    const { count } = await prisma.agendaOcurrencia.deleteMany({ where: { tenantId, actividadId, fecha: fechaADate(fecha) } });
    if (count > 0) {
      invalidateByPrefix(prefijo(tenantId));
      auditar(tenantId, ctx.usuario, "agenda_ocurrencia_desmarcar", actividadId, `«${fila.nombre}» ${fecha}: sin marca`);
    }
    return { ok: true, valor: { borradas: count } };
  },

  // ── Composición ────────────────────────────────────────────────────────────

  /** Sólo las fuentes que alguna actividad pide; todas en paralelo, una consulta cada una. */
  async fuentesPara(tenantId: string, actividades: ActividadDTO[], desde: FechaKey, hasta: FechaKey, hoy: FechaKey): Promise<FuentesDelRango> {
    const reglas = new Set(actividades.map((a) => a.regla));
    const pasaHoy = desde <= hoy && hoy <= hasta;
    const conHoy = (r: ReglaAgenda) => actividades.filter((a) => a.regla === r);
    const cuentas = pasaHoy ? conHoy("cuenta_tercero") : [];
    const [asistencia, corridas, plata, gestionesAdelanto, saldos, movimientos, facturas] = await Promise.all([
      reglas.has("asistencia") ? AgendaFuentesDB.asistenciaPorDia(tenantId, desde, hasta) : undefined,
      reglas.has("servicio_aserrio") ? AgendaFuentesDB.corridasPorDia(tenantId, desde, hasta) : undefined,
      reglas.has("gastos_ingresos") ? AgendaFuentesDB.plataPorDia(tenantId, desde, hasta) : undefined,
      reglas.has("adelantos") ? AgendaFuentesDB.gestionesAdelantoPorDia(tenantId, desde, hasta) : undefined,
      pasaHoy && reglas.has("adelantos") ? AgendaFuentesDB.saldoAdelantos(tenantId, hoy) : undefined,
      cuentas.length > 0 ? AgendaFuentesDB.movimientosDesdeRevision(tenantId, cuentas.map((a) => a.id)) : undefined,
      pasaHoy && reglas.has("facturas") ? AgendaFuentesDB.apoyoFacturas(tenantId, hoy.slice(0, 7)) : undefined,
    ]);

    const apoyoHoy: Record<string, string> = {};
    if (pasaHoy) {
      for (const a of actividades) {
        if (a.regla === "adelantos" && saldos) {
          const s = saldos[a.objetivo?.id ?? "*"] ?? { conSaldo: 0, vencidos: 0 };
          apoyoHoy[a.id] = `${s.conSaldo} con saldo · ${s.vencidos} vencidos`;
        } else if (a.regla === "cuenta_tercero" && movimientos?.[a.id]) {
          const m = movimientos[a.id];
          const n = `${m.movimientos} ${m.movimientos === 1 ? "movimiento" : "movimientos"}`;
          apoyoHoy[a.id] = m.ultimaRevision
            ? `${n} desde tu última revisión (${m.ultimaRevision.slice(8, 10)}/${m.ultimaRevision.slice(5, 7)})`
            : `${n} · sin revisión anotada`;
        } else if (a.regla === "facturas" && facturas) {
          apoyoHoy[a.id] =
            a.parametros.modo === "contador"
              ? [facturas.ventana, `${facturas.gastosConRuc} gastos con RUC este mes`].filter(Boolean).join(" · ")
              : `${facturas.porEnviar} comprobantes por enviar a SUNAT`;
        }
      }
    }
    return { asistencia, corridas, plata, gestionesAdelanto, apoyoHoy };
  },

  async ocurrenciasCalculadas(tenantId: string, rol: AdminRole, desde: FechaKey, hasta: FechaKey, hoy: FechaKey): Promise<OcurrenciaDTO[]> {
    exigirTenant(tenantId);
    const activas = (await AgendaDB.listarActividades(tenantId, rol)).filter((a) => a.activo);
    if (activas.length === 0) return [];
    const [marcas, fuentes] = await Promise.all([
      AgendaDB.ocurrenciasDelRango(tenantId, desde, hasta),
      AgendaDB.fuentesPara(tenantId, activas, desde, hasta, hoy),
    ]);
    return calcularOcurrencias({ actividades: activas, desde, hasta, hoy, marcas, fuentes });
  },

  /**
   * «Hoy»: lo de hoy + atrasadas de los últimos 7 días + alertas de la campana.
   * `conSeguimientos` (sólo la pantalla, no los crons de Telegram/push): suma a
   * quién escribirle hoy (ADR-508), fuera de `cuenta` y de las alertas.
   */
  async resumenHoy(
    tenantId: string,
    rol: AdminRole,
    ahora: Date = new Date(),
    opciones: { conSeguimientos?: boolean } = {},
  ): Promise<ResumenAgendaHoy> {
    exigirTenant(tenantId);
    const hoy = limaDateKey(ahora);
    const { desde, hasta } = rangoDeHoy(hoy);
    const [ocurrencias, seguimientos] = await Promise.all([
      AgendaDB.ocurrenciasCalculadas(tenantId, rol, desde, hasta, hoy),
      opciones.conSeguimientos ? seguimientosPara(tenantId, rol, hoy, hoy, hoy) : Promise.resolve(undefined),
    ]);
    const resumen = resumirHoy(ocurrencias, hoy, horaDeLima(ahora));
    return seguimientos ? { ...resumen, seguimientos } : resumen;
  },

  /** Un `DiaAgenda` por cada día del rango (los vacíos también: la grilla los dibuja). */
  async calendario(tenantId: string, rol: AdminRole, desde: FechaKey, hasta: FechaKey, ahora: Date = new Date()): Promise<DiaAgenda[]> {
    exigirTenant(tenantId);
    const hoy = limaDateKey(ahora);
    const veAdelantos = checkPermission(rol as Role, "adelantos", "read");
    const [ocurrencias, notas, tareas, vencimientos, seguimientos] = await Promise.all([
      AgendaDB.ocurrenciasCalculadas(tenantId, rol, desde, hasta, hoy),
      ROLES_NOTAS.includes(rol) ? NotesDB.delRango(tenantId, desde, hasta) : Promise.resolve([]),
      prisma.adminTask.findMany({
        where: { tenantId, dueDate: { gte: fechaADate(desde), lte: fechaADate(hasta) } },
        select: { id: true, title: true, status: true, priority: true, assignedTo: true, dueDate: true },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      }),
      AgendaFuentesDB.vencimientosDelRango(tenantId, desde, hasta),
      seguimientosPara(tenantId, rol, desde, hasta, hoy),
    ]);

    const dias = new Map<FechaKey, DiaAgenda>();
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
      dias.set(f, { fecha: f, ocurrencias: [], notas: [], tareas: [], vencimientos: [] });
    }
    for (const o of ocurrencias) dias.get(o.fecha)?.ocurrencias.push(o);
    for (const n of notas) {
      if (!n.fecha) continue;
      const fecha = dateAFecha(n.fecha);
      dias.get(fecha)?.notas.push({ id: n.id, titulo: n.title, contenido: n.content, color: n.color, fecha });
    }
    for (const t of tareas) {
      if (!t.dueDate) continue;
      const tarea: TareaDelDia = {
        id: t.id,
        titulo: t.title,
        estado: t.status,
        prioridad: t.priority,
        asignadoA: t.assignedTo,
        fecha: dateAFecha(t.dueDate),
      };
      dias.get(tarea.fecha)?.tareas.push(tarea);
    }
    for (const v of vencimientos) {
      if (v.origen !== "recordatorio" && !veAdelantos) continue;
      dias.get(v.fecha)?.vencimientos.push(v);
    }
    // ADR-508: uno por día («Escribir a 3 clientes»), no uno por cliente: la lista está en «Hoy».
    const porDia = new Map<FechaKey, number>();
    for (const sg of seguimientos ?? []) porDia.set(sg.fecha, (porDia.get(sg.fecha) ?? 0) + 1);
    for (const [fecha, n] of porDia) {
      dias.get(fecha)?.vencimientos.push({
        id: `seguimiento:${fecha}`,
        origen: "seguimiento_clienta",
        titulo: n === 1 ? "Escribir a 1 cliente (seguimiento)" : `Escribir a ${n} clientes (seguimiento)`,
        fecha,
        href: "/admin?tab=administracion&vista=hoy",
      });
    }
    return [...dias.values()];
  },

  /** «Actualizar» con `?fresco=1`: vuelve a leer actividades, marcas y fuentes. */
  olvidar(tenantId: string): void {
    exigirTenant(tenantId);
    invalidateByPrefix(prefijo(tenantId));
    AgendaFuentesDB.olvidar(tenantId);
    SeguimientoClientasDB.olvidar(tenantId);
  },
};
