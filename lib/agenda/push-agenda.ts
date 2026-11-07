/**
 * Aviso de la agenda al celular por Web Push (Brandon 20-10) — la parte pura.
 *
 * Brandon: «que el celular vibre a la hora de cada actividad aunque el
 * navegador esté cerrado, como el aviso de las cámaras». Ejemplo: a las 09:00
 * «Marcar la asistencia · 0 de 8 marcados».
 *
 * Qué toca avisar (lo llama el cron cada 5 min, ver `push-agenda.server.ts`):
 *   - cada actividad de HOY que falta (pendiente / parcial) cuya `hora` cayó en
 *     la ventana (ahora − 10 min, ahora]: un push por actividad;
 *   - las que no tienen hora: UN push a las 09:00, misma ventana, con los nombres;
 *   - lo hecho, omitido o pospuesto no se avisa (`loQueFalta`).
 * La ventana de 10 min con el cron de 5 cubre un disparo perdido; el dedupe por
 * actividad + día + persona (bajo candado, en `reservarAvisos`) hace que dos
 * disparos que ven la misma hora manden una sola vez.
 *
 * Los dispositivos viven en el KV por negocio (como los de cámaras), en su
 * propia clave: el endpoint y las claves nunca salen del servidor.
 *
 * Sin `server-only`: lo importan la ruta, el envío y los tests.
 */

import type { ClavesPush } from "@/lib/camaras/avisar-push";
import type { AdminRole } from "@/lib/session";
import { diaLima, instanteLima, loQueFalta } from "./aviso-pantalla";
import type { FechaKey, OcurrenciaDTO, ResumenAgendaHoy } from "./tipos";

/** Minutos hacia atrás que todavía cuentan como «a su hora» (el cron corre cada 5). */
export const VENTANA_MIN = 10;
/** A qué hora sale el aviso de las actividades sin hora. */
export const HORA_SIN_HORA = "09:00";
/** Clave del aviso de las sin hora en el dedupe (las demás usan el id de la actividad). */
export const CLAVE_SIN_HORA = "sin-hora";
/** A dónde lleva el toque: Administración › Hoy (pide sesión). */
export const URL_AGENDA_HOY = "/admin?tab=administracion&vista=hoy";
/** Tope por negocio: cada aviso es un envío por dispositivo. */
export const MAX_DISPOSITIVOS_AGENDA = 20;
/** Tope por persona: una sesión no puede llenar los cupos del negocio. */
export const MAX_DISPOSITIVOS_POR_PERSONA = 5;

const MIN = 60_000;

/** Un navegador que recibe el aviso de la agenda de UNA persona. */
export interface DispositivoAgenda {
  /** `idDeEndpoint(endpoint)`: lo único que ve la pantalla para reconocerse. */
  id: string;
  endpoint: string;
  keys: ClavesPush;
  /** Usuario del panel dueño del dispositivo: el resumen se pide con SU rol. */
  username: string;
  /** Rol al darlo de alta (el envío vuelve a leer el vigente). */
  role: AdminRole;
  /** «Chrome en Android». */
  nombre: string;
  creado: string;
}

export interface EstadoAgendaCelulares {
  dispositivos: DispositivoAgenda[];
  /** `fecha|username|clave` → ISO del aviso: lo ya mandado hoy (dedupe). */
  avisados: Record<string, string>;
}

/** Lo que ve la pantalla de cada dispositivo propio: sin endpoint ni claves. */
export interface DispositivoAgendaVisible {
  id: string;
  nombre: string;
  creado: string;
}

export interface AvisoAgenda {
  /** Id de la actividad, o `CLAVE_SIN_HORA`. */
  clave: string;
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PedidoAviso {
  username: string;
  aviso: AvisoAgenda;
}

export const ESTADO_VACIO: EstadoAgendaCelulares = { dispositivos: [], avisados: {} };

/** Lee lo guardado sin confiar en su forma (lo escribe sólo el servidor, pero el KV es un JSON). */
export function estadoAgendaDe(valor: unknown): EstadoAgendaCelulares {
  const v = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Partial<EstadoAgendaCelulares>) : {};
  const dispositivos = Array.isArray(v.dispositivos)
    ? v.dispositivos.filter(
        (d): d is DispositivoAgenda =>
          !!d &&
          typeof d.id === "string" &&
          typeof d.endpoint === "string" &&
          typeof d.username === "string" &&
          !!d.keys &&
          typeof d.keys.p256dh === "string" &&
          typeof d.keys.auth === "string",
      )
    : [];
  const avisados: Record<string, string> = {};
  if (v.avisados && typeof v.avisados === "object" && !Array.isArray(v.avisados)) {
    for (const [k, en] of Object.entries(v.avisados)) if (typeof en === "string") avisados[k] = en;
  }
  return { dispositivos: dispositivos.map((d) => ({ ...d, keys: { ...d.keys } })), avisados };
}

export function dispositivosDe(estado: EstadoAgendaCelulares, username: string): DispositivoAgendaVisible[] {
  return estado.dispositivos
    .filter((d) => d.username === username)
    .map((d) => ({ id: d.id, nombre: d.nombre, creado: d.creado }));
}

export type ResultadoAlta = { ok: true; estado: EstadoAgendaCelulares } | { ok: false; motivo: string };

/**
 * Prende ESTE navegador para la persona. Si ya estaba (mismo endpoint), se
 * actualizan las claves y pasa a ser de quien lo prendió ahora: un celular
 * avisa a una sola persona.
 */
export function altaDispositivo(
  estado: EstadoAgendaCelulares,
  entrada: Omit<DispositivoAgenda, "creado">,
  ahora: Date,
): ResultadoAlta {
  const previo = estado.dispositivos.find((d) => d.id === entrada.id);
  if (!previo && estado.dispositivos.length >= MAX_DISPOSITIVOS_AGENDA) {
    return { ok: false, motivo: `Ya hay ${MAX_DISPOSITIVOS_AGENDA} celulares con el aviso de la agenda. Apaga alguno que ya no se use.` };
  }
  const suyos = estado.dispositivos.filter((d) => d.id !== entrada.id && d.username === entrada.username).length;
  if (suyos >= MAX_DISPOSITIVOS_POR_PERSONA) {
    return { ok: false, motivo: `Ya tienes ${MAX_DISPOSITIVOS_POR_PERSONA} celulares con el aviso. Apaga alguno que ya no uses.` };
  }
  const nuevo: DispositivoAgenda = { ...entrada, creado: previo?.creado ?? ahora.toISOString() };
  const dispositivos = previo ? estado.dispositivos.map((d) => (d.id === entrada.id ? nuevo : d)) : [...estado.dispositivos, nuevo];
  return { ok: true, estado: { ...estado, dispositivos } };
}

/** Saca un dispositivo SÓLO si es de esa persona (el de otro no se toca). `null` = no había nada que sacar. */
export function bajaDispositivo(estado: EstadoAgendaCelulares, id: string, username: string): EstadoAgendaCelulares | null {
  const dispositivos = estado.dispositivos.filter((d) => !(d.id === id && d.username === username));
  return dispositivos.length === estado.dispositivos.length ? null : { ...estado, dispositivos };
}

/** Sin los que el servicio de push dio por muertos (404/410). `null` = no cambió nada. */
export function sinEndpoints(estado: EstadoAgendaCelulares, endpoints: readonly string[]): EstadoAgendaCelulares | null {
  const fuera = new Set(endpoints);
  const dispositivos = estado.dispositivos.filter((d) => !fuera.has(d.endpoint));
  return dispositivos.length === estado.dispositivos.length ? null : { ...estado, dispositivos };
}

/** ¿El instante `t` cayó en (ahora − 10 min, ahora]? */
export function enVentana(t: number, ahora: number): boolean {
  return Number.isFinite(t) && t > ahora - VENTANA_MIN * MIN && t <= ahora;
}

/** El `topic` del servicio de push (≤32, base64url): si el celular estuvo sin señal, llega el último de cada actividad. */
export function topicDe(clave: string): string {
  return `ag-${clave}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
}

function avisoDeActividad(o: OcurrenciaDTO): AvisoAgenda {
  return {
    clave: o.actividadId,
    title: o.nombre,
    body: o.detalle?.trim() || "Te toca ahora",
    url: URL_AGENDA_HOY,
    tag: `agenda-${o.actividadId}`,
  };
}

/** «Hoy también: Revisar la caja, Pagar la luz y 2 más». */
export function avisoSinHora(nombres: readonly string[]): AvisoAgenda {
  const unicos = [...new Set(nombres)];
  const resto = unicos.length - 3;
  return {
    clave: CLAVE_SIN_HORA,
    title: `Hoy también: ${unicos.slice(0, 3).join(", ")}${resto > 0 ? ` y ${resto} más` : ""}`,
    body: unicos.length === 1 ? "No tiene hora fija: toca para verla." : "No tienen hora fija: toca para verlas.",
    url: URL_AGENDA_HOY,
    tag: "agenda-sin-hora",
  };
}

/** Qué avisar AHORA con el resumen de hoy de una persona (ya filtrado por su rol). */
export function avisosQueTocan(resumen: ResumenAgendaHoy, ahora: Date): AvisoAgenda[] {
  const t = ahora.getTime();
  const hoy = diaLima(t);
  if (resumen.fecha !== hoy) return [];
  const faltan = loQueFalta(resumen, { atrasadas: false }).hoy.filter((o) => o.fecha === hoy);
  const avisos = faltan.filter((o) => !!o.hora && enVentana(instanteLima(hoy, o.hora), t)).map(avisoDeActividad);
  const sinHora = faltan.filter((o) => !o.hora);
  if (sinHora.length > 0 && enVentana(instanteLima(hoy, HORA_SIN_HORA), t)) avisos.push(avisoSinHora(sinHora.map((o) => o.nombre)));
  return avisos;
}

export const claveAvisado = (fecha: FechaKey, username: string, clave: string): string => `${fecha}|${username}|${clave}`;

/**
 * Bajo el candado de la clave del negocio: aparta los pedidos que nadie avisó
 * hoy, los marca con `enISO` y poda lo de días anteriores. Dos disparos que
 * ven la misma hora: el segundo encuentra la marca y no aparta nada.
 */
export function reservarAvisos(
  estado: EstadoAgendaCelulares,
  hoy: FechaKey,
  pedidos: readonly PedidoAviso[],
  enISO: string,
): { siguiente: EstadoAgendaCelulares; reservados: PedidoAviso[] } {
  const avisados: Record<string, string> = {};
  for (const [k, en] of Object.entries(estado.avisados)) if (k.slice(0, 10) >= hoy) avisados[k] = en;
  const reservados: PedidoAviso[] = [];
  for (const p of pedidos) {
    const k = claveAvisado(hoy, p.username, p.aviso.clave);
    if (avisados[k]) continue;
    avisados[k] = enISO;
    reservados.push(p);
  }
  return { siguiente: { ...estado, avisados }, reservados };
}

/** Devuelve los turnos que no llegaron a ningún celular, sólo si nadie los tomó después. `null` = nada que devolver. */
export function liberarAvisos(estado: EstadoAgendaCelulares, claves: readonly string[], enISO: string): EstadoAgendaCelulares | null {
  const avisados = { ...estado.avisados };
  let cambio = false;
  for (const k of claves) {
    if (avisados[k] === enISO) {
      delete avisados[k];
      cambio = true;
    }
  }
  return cambio ? { ...estado, avisados } : null;
}
