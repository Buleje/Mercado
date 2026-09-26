import "server-only";
import { prisma } from "@/lib/prisma";
import { auditCtp, type CtpAuditAction } from "@/lib/forestal/ctp-audit";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import {
  RANGOS_REPORTE,
  SECCIONES_REPORTE,
  TOPE_REPORTES_ACTIVOS,
  prefijoDeLog,
  type RangoReporte,
  type ReporteDiario,
  type ReporteDiarioInput,
  type SeccionReporte,
} from "@/lib/forestal/reporte-diario";

/**
 * ForestReporteDiarioDB — los reportes diarios forestales (ADR-439).
 *
 * Toda lectura y escritura lleva el `tenantId` en el WHERE (un IDOR se cierra
 * ahí, no con un `if` después). La única lectura cruzada es la del despachador
 * del cron (`paraDespachar`), que por definición recorre todos los negocios.
 */

type Fila = Awaited<ReturnType<typeof prisma.forestReporteDiario.findFirst>> & object;

const esSeccion = (s: string): s is SeccionReporte => (SECCIONES_REPORTE as readonly string[]).includes(s);
const esRango = (s: string): s is RangoReporte => (RANGOS_REPORTE as readonly string[]).includes(s);

/** Una fila como la entiende el resto: una sección o un rango desconocidos (datos viejos) no pasan. */
function aReporte(f: Fila): ReporteDiario {
  return {
    id: f.id,
    nombre: f.nombre,
    activo: f.activo,
    hora: f.hora,
    dias: f.dias ?? [],
    porCorreo: f.porCorreo,
    porWhatsapp: f.porWhatsapp,
    correos: f.correos ?? [],
    telefonos: f.telefonos ?? [],
    secciones: (f.secciones ?? []).filter(esSeccion),
    rango: esRango(f.rango) ? f.rango : "hoy",
    ultimaFechaEnviada: f.ultimaFechaEnviada,
    creadoPor: f.creadoPor,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

/** El renglón de auditoría dice a quién va: el libro sale del panel hacia terceros. */
function destinos(base: string, r: Pick<ReporteDiarioInput, "porCorreo" | "porWhatsapp" | "correos" | "telefonos">): string {
  const a = [
    r.porCorreo && r.correos.length ? `correo: ${r.correos.join(", ")}` : null,
    r.porWhatsapp && r.telefonos.length ? `WhatsApp: ${r.telefonos.join(", ")}` : null,
  ].filter(Boolean);
  return a.length ? `${base} → ${a.join(" · ")}` : base;
}

/** Un negocio no necesita más: cada reporte es un mensaje por día a cada destinatario. */
export const TOPE_REPORTES_POR_NEGOCIO = 20;

export class ReportesDiariosLlenoError extends Error {
  constructor() {
    super(`Llegaste al tope de ${TOPE_REPORTES_POR_NEGOCIO} reportes: borra uno que ya no uses.`);
  }
}

export class ReportesActivosLlenoError extends Error {
  constructor() {
    super(`Ya tienes ${TOPE_REPORTES_ACTIVOS} reportes que salen solos: pausa uno antes de activar otro.`);
  }
}

/** El módulo que tiene que estar prendido para que un reporte salga solo. */
const MODULO_CTP = "spec:forestal:ctp-libro";

/** Cuántos activos tiene el negocio, sin contar `excepto` (el que se está editando). */
async function activosDe(tenantId: string, excepto?: string): Promise<number> {
  return prisma.forestReporteDiario.count({
    where: { tenantId, activo: true, ...(excepto ? { id: { not: excepto } } : {}) },
  });
}

/** `auditCtp` no tira ni espera: reintenta y, si igual falla, lo loguea como error. */
function auditar(tenantId: string, action: CtpAuditAction, entityId: string, detail: string, user: string) {
  auditCtp({ tenantId, action, entity: "ForestReporteDiario", entityId, detail, user });
}

export const ForestReporteDiarioDB = {
  async listar(tenantId: string): Promise<ReporteDiario[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestReporteDiario.findMany({
      where: { tenantId },
      orderBy: [{ hora: "asc" }, { createdAt: "asc" }],
      take: TOPE_REPORTES_POR_NEGOCIO,
    });
    return filas.map(aReporte);
  },

  async leer(tenantId: string, id: string): Promise<ReporteDiario | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const f = await prisma.forestReporteDiario.findFirst({ where: { id, tenantId } });
    return f ? aReporte(f) : null;
  },

  async crear(tenantId: string, input: ReporteDiarioInput, usuario: string): Promise<ReporteDiario> {
    if (!tenantId) throw new Error("tenantId is required");
    const hay = await prisma.forestReporteDiario.count({ where: { tenantId } });
    if (hay >= TOPE_REPORTES_POR_NEGOCIO) throw new ReportesDiariosLlenoError();
    if (input.activo && (await activosDe(tenantId)) >= TOPE_REPORTES_ACTIVOS) throw new ReportesActivosLlenoError();
    const f = await prisma.forestReporteDiario.create({ data: { ...input, tenantId, creadoPor: usuario } });
    auditar(tenantId, "ctp_reporte_diario_crear", f.id, destinos(`Reporte diario «${f.nombre}» a las ${f.hora}`, f), usuario);
    return aReporte(f);
  },

  /**
   * Cambiar la hora de un reporte que HOY ya salió no lo vuelve a mandar hoy:
   * `ultimaFechaEnviada` no se toca. Sí se vuelve a mandar mañana a la nueva.
   */
  async actualizar(tenantId: string, id: string, input: ReporteDiarioInput, usuario: string): Promise<ReporteDiario | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (input.activo && (await activosDe(tenantId, id)) >= TOPE_REPORTES_ACTIVOS) throw new ReportesActivosLlenoError();
    const r = await prisma.forestReporteDiario.updateMany({ where: { id, tenantId }, data: input });
    if (r.count === 0) return null;
    auditar(tenantId, "ctp_reporte_diario_actualizar", id, destinos(`Reporte diario «${input.nombre}» · ${input.activo ? "activo" : "pausado"} · ${input.hora}`, input), usuario);
    return this.leer(tenantId, id);
  },

  /**
   * Sólo lo apaga. Es lo único que se puede cambiar con el módulo CTP
   * deshabilitado: un negocio sin el módulo tiene que poder frenar un reporte
   * que le sigue llegando, sin poder armar uno nuevo.
   */
  async pausar(tenantId: string, id: string, usuario: string): Promise<ReporteDiario | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.forestReporteDiario.updateMany({ where: { id, tenantId }, data: { activo: false } });
    if (r.count === 0) return null;
    auditar(tenantId, "ctp_reporte_diario_actualizar", id, "Reporte diario pausado (módulo CTP apagado)", usuario);
    return this.leer(tenantId, id);
  },

  async eliminar(tenantId: string, id: string, usuario: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const previo = await prisma.forestReporteDiario.findFirst({ where: { id, tenantId }, select: { nombre: true } });
    if (!previo) return false;
    const r = await prisma.forestReporteDiario.deleteMany({ where: { id, tenantId } });
    if (r.count > 0) auditar(tenantId, "ctp_reporte_diario_eliminar", id, `Reporte diario «${previo.nombre}» borrado`, usuario);
    return r.count > 0;
  },

  /**
   * Los activos de TODOS los negocios: sólo para el despachador del cron.
   *
   * Sólo de negocios activos y con el módulo CTP prendido: un negocio dado de
   * baja o sin el módulo no sigue recibiendo el libro por correo. El orden es
   * fijo (hora, alta, id) para que un corte por tiempo deje siempre a los
   * mismos para el disparo siguiente, no a unos distintos cada vez.
   */
  async paraDespachar(): Promise<(ReporteDiario & { tenantId: string })[]> {
    const filas = await prisma.forestReporteDiario.findMany({
      where: { activo: true },
      orderBy: [{ hora: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: 2000,
    });
    const ids = [...new Set(filas.map((f) => f.tenantId))];
    if (ids.length === 0) return [];
    const [activos, conModulo] = await Promise.all([
      prisma.tenant.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } }),
      prisma.tenantFeatureFlag.findMany({
        where: { tenantId: { in: ids }, flagKey: MODULO_CTP, enabled: true },
        select: { tenantId: true },
      }),
    ]);
    const vivos = new Set(activos.map((t) => t.id));
    const habilitados = new Set(conModulo.map((f) => f.tenantId));
    return filas
      .filter((f) => vivos.has(f.tenantId) && habilitados.has(f.tenantId))
      .map((f) => ({ ...aReporte(f), tenantId: f.tenantId }));
  },

  /**
   * Reclama el envío programado de ESE día. Compare-and-swap: el WHERE pide el
   * valor que el despachador LEYÓ (`previo`), así que de dos disparos
   * simultáneos sólo uno obtiene `count = 1` — el otro ya no ve ese valor.
   * `true` = te toca mandarlo.
   *
   * `previo` puede ser una marca de reintento de hoy («2026-09-26#1»): ver
   * `marcaDeReintento`.
   */
  async reclamarEnvio(tenantId: string, id: string, fecha: string, previo: string | null): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    if (previo === fecha) return false;
    const r = await prisma.forestReporteDiario.updateMany({
      where: { id, tenantId, activo: true, ultimaFechaEnviada: previo },
      data: { ultimaFechaEnviada: fecha },
    });
    return r.count === 1;
  },

  /**
   * Devuelve la reserva de hoy: `valor` = la marca de reintento (fallaron todos
   * los canales) o el valor previo (el corte por tiempo llegó antes de mandar).
   * Sólo si sigue siendo la reserva de hoy: nunca pisa otra cosa.
   */
  async devolverReserva(tenantId: string, id: string, fecha: string, valor: string | null): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.forestReporteDiario.updateMany({
      where: { id, tenantId, ultimaFechaEnviada: fecha },
      data: { ultimaFechaEnviada: valor },
    });
    return r.count === 1;
  },

  /** Los últimos envíos de un reporte (el historial vive en `NotificationLog`). */
  async envios(tenantId: string, id: string, limite = 12) {
    if (!tenantId) throw new Error("tenantId is required");
    return NotificationLogsDB.recientesPorPrefijo(tenantId, prefijoDeLog(id), limite);
  },
};
