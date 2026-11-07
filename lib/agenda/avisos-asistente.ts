import "server-only";

/**
 * Agenda (ADR-501 §4) — el chequeo `agenda` de `calcularAvisos` (lib/asistente/avisos.ts),
 * que sale en el cron `asistente-avisos` de las 07:20 Lima: campana persistida, Telegram y n8n.
 *
 *  · `agenda-hoy:<fecha>` (LOW): lo que toca hoy y sigue abierto, en un solo aviso.
 *  · `agenda-atrasada:<actividadId>:<fecha>` (MEDIUM): lo de AYER que quedó sin hacer.
 *    Sólo ayer: lo de antes ya se avisó en su día (la clave es por fecha) y «Hoy» lo arrastra 7 días.
 *
 * Entran sólo las actividades prendidas con canal campana, telegram o n8n, y cada
 * aviso lleva `canales` = los que eligió SU actividad: el cron lo manda sólo por ahí
 * (`avisosDelCanal`). El de «hoy» se arma por canal; dos canales con la misma lista
 * comparten un solo aviso.
 */
import type { Aviso, CanalAviso } from "@/lib/asistente/avisos";
import { AgendaDB } from "@/lib/db/agenda.db";
import { sumarDias } from "@/lib/agenda/recurrencia";
import type { ActividadDTO, FechaKey, OcurrenciaDTO } from "@/lib/agenda/tipos";

/** En este orden salen los `canales` de cada aviso (estable para la clave). */
const CANALES_DEL_CRON: readonly CanalAviso[] = ["campana", "telegram", "n8n"];
const PANTALLA = "Administración › Hoy";
const URL_HOY = "/admin?tab=administracion&vista=hoy";

const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const abierta = (o: OcurrenciaDTO) => o.estado === "pendiente" || o.estado === "parcial";

/** Los canales del cron que eligió la actividad, en el orden de `CANALES_DEL_CRON`. */
function canalesDelCron(a: Pick<ActividadDTO, "canales">): CanalAviso[] {
  return CANALES_DEL_CRON.filter((c) => (a.canales as readonly string[]).includes(c));
}

/** Puro: lo que el cron avisa con el resumen del día (ayer sin hacer + lo abierto de hoy). */
export function armarAvisosAgenda(
  r: { fecha: FechaKey; hoy: readonly OcurrenciaDTO[]; atrasadas: readonly OcurrenciaDTO[] },
  actividades: readonly Pick<ActividadDTO, "id" | "activo" | "canales">[],
): Aviso[] {
  const canalesDe = new Map<string, CanalAviso[]>();
  for (const a of actividades) {
    const canales = a.activo ? canalesDelCron(a) : [];
    if (canales.length > 0) canalesDe.set(a.id, canales);
  }
  if (canalesDe.size === 0) return [];

  const ayer = sumarDias(r.fecha, -1);
  const avisos: Aviso[] = [];

  for (const o of r.atrasadas) {
    const canales = canalesDe.get(o.actividadId);
    if (!canales || o.fecha !== ayer) continue;
    avisos.push({
      clave: `agenda-atrasada:${o.actividadId}:${o.fecha}`,
      severidad: "MEDIUM",
      titulo: `Quedó sin hacer: ${o.nombre}`,
      cuerpo: `Ayer ${ddmm(o.fecha)} tocaba «${o.nombre}»${o.detalle ? ` (${o.detalle})` : ""}.`,
      pantalla: PANTALLA,
      url: URL_HOY,
      canales,
    });
  }

  // «Hoy» por canal: cada canal recibe SÓLO las actividades que lo eligieron.
  const deHoy = r.hoy.filter((o) => canalesDe.has(o.actividadId) && abierta(o));
  const porLista = new Map<string, { canales: CanalAviso[]; ocurrencias: OcurrenciaDTO[] }>();
  for (const canal of CANALES_DEL_CRON) {
    const suyas = deHoy.filter((o) => canalesDe.get(o.actividadId)?.includes(canal));
    if (suyas.length === 0) continue;
    const firma = suyas.map((o) => o.actividadId).join(",");
    const grupo = porLista.get(firma);
    if (grupo) grupo.canales.push(canal);
    else porLista.set(firma, { canales: [canal], ocurrencias: suyas });
  }
  for (const { canales, ocurrencias } of porLista.values()) {
    const n = ocurrencias.length;
    avisos.push({
      // Una sola lista para los tres = la clave de siempre; si no, la clave dice a qué canales va.
      clave: canales.length === CANALES_DEL_CRON.length ? `agenda-hoy:${r.fecha}` : `agenda-hoy:${r.fecha}:${canales.join("+")}`,
      severidad: "LOW",
      titulo: n === 1 ? "Hoy te toca 1 actividad" : `Hoy te tocan ${n} actividades`,
      cuerpo: ocurrencias.map((o) => (o.hora ? `${o.hora} ${o.nombre}` : o.nombre)).join(" · "),
      pantalla: PANTALLA,
      url: URL_HOY,
      canales,
    });
  }
  return avisos;
}

export async function avisosDeAgenda(tenantId: string, ahora: Date = new Date()): Promise<Aviso[]> {
  // El cron no tiene sesión: mira la agenda entera, como el dueño.
  const actividades = await AgendaDB.listarActividades(tenantId, "admin");
  if (!actividades.some((a) => a.activo && canalesDelCron(a).length > 0)) return [];
  const r = await AgendaDB.resumenHoy(tenantId, "admin", ahora);
  return armarAvisosAgenda(r, actividades);
}
