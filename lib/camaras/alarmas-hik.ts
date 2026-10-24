/**
 * La cola de alarmas de Hik-Connect for Teams, lo puro (leer el lote, pasarlo
 * a movimientos del panel, mezclar con lo guardado). La red está en
 * `movimientos-nube.server.ts`; el porqué, en `movimientos-nube.ts`.
 *
 * Forma medida el 23-10 en Blas (`mq/messages`, `errorCode "0"`):
 * `data: { batchId, remainingNumber, alarmMsg: [{ guid, msgType "1",
 *   alarmState "1", timeInfo: { startTime "2026-10-23T12:26:27Z", endTime },
 *   eventSource: { eventType "10002", sourceID (= resourceId del enlace),
 *     sourceName "DS-2CFSP4-4G", deviceInfo: { deviceSerial } },
 *   alarmRule: { name "DS-2CFSP4-4G-Detección movim." },
 *   fileInfo: { file: [{ type "1", url, encrypted "0" }] } }] }`.
 * La `url` de la foto es `https://apiisa.ezvizlife.com/v3/unifiedmsg/…`
 * firmada, que contesta 302 a un objeto firmado de Oracle Cloud
 * (`alarm-oracle-sa….objectstorage.sa-saopaulo-1.oci.customer-oci.com`).
 */
import type { MovimientoNube } from "@/lib/camaras/movimientos-nube";

export const RUTAS_ALARMAS_HIK = {
  suscribir: "/api/hccgw/alarm/v1/mq/subscribe",
  traer: "/api/hccgw/alarm/v1/mq/messages",
  confirmar: "/api/hccgw/alarm/v1/mq/messages/complete",
} as const;

/** `subscribeMode 0` es el que acepta (1 → LAP000020, 2 → «parámetro inválido»; medido 23-10). */
export const PEDIDO_SUSCRIBIR = { subscribeType: 1, subscribeMode: 0 } as const;
/** «Failed to pull alarm messages, please subscribe first». */
export const SIN_SUSCRIPCION = "OPEN000016";

/** Cuánto se guarda en el servidor y cuántos como mucho. */
export const VIDA_MOVIMIENTOS_MS = 24 * 3_600_000;
export const TOPE_MOVIMIENTOS = 200;

export interface AlarmaHik {
  id: string;
  /** `eventSource.sourceID`: el `resourceId` de la cámara en Hik-Connect. */
  fuenteId: string;
  serie: string | null;
  tipoEvento: string;
  at: number;
  foto: string | null;
  fotoCifrada: boolean;
}

export interface LoteAlarmas {
  /** `null` = no hay nada que confirmar. */
  lote: string | null;
  quedan: number;
  alarmas: AlarmaHik[];
}

/** Lo que el servidor guarda: lo del cliente + la foto firmada (que nunca sale del servidor). */
export interface MovimientoGuardado extends MovimientoNube {
  foto: string | null;
  fotoCifrada: boolean;
}

export interface CamaraEnlazada {
  id: string;
  nombre: string;
  resourceId: string;
  deviceSerial: string;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const texto = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

function horaDe(v: unknown): number | null {
  const s = texto(v).trim();
  if (!s) return null;
  if (/^\d{10,13}$/.test(s)) return s.length === 10 ? Number(s) * 1000 : Number(s);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** La primera foto (`type "1"`) del evento; los videos (`type "2"`) no se bajan. */
function fotoDe(a: Record<string, unknown>): { url: string | null; cifrada: boolean } {
  const files = obj(a.fileInfo)?.file;
  for (const f of Array.isArray(files) ? files : []) {
    const o = obj(f);
    const url = texto(o?.url ?? o?.URL).trim();
    if (o && url && (texto(o.type) === "1" || texto(o.type) === "")) {
      return { url, cifrada: texto(o.encrypted) === "1" };
    }
  }
  return { url: null, cifrada: false };
}

/**
 * `data` de `mq/messages` → el lote. Se quedan sólo las alarmas que empiezan
 * (`alarmState "0"` es la que termina: sería el mismo movimiento dos veces) y
 * las que traen id, hora y cámara.
 */
export function leerLoteAlarmas(data: unknown): LoteAlarmas {
  const d = obj(data) ?? {};
  const lote = texto(d.batchId).trim();
  const quedan = Number(texto(d.remainingNumber));
  const alarmas: AlarmaHik[] = [];
  for (const crudo of Array.isArray(d.alarmMsg) ? d.alarmMsg : []) {
    const a = obj(crudo);
    if (!a) continue;
    const msgType = texto(a.msgType);
    if (msgType && msgType !== "1") continue;
    if (texto(a.alarmState) === "0") continue;
    const fuente = obj(a.eventSource) ?? {};
    const id = texto(a.guid).trim();
    const at = horaDe(obj(a.timeInfo)?.startTime);
    const fuenteId = texto(fuente.sourceID).trim();
    const serie = texto(obj(fuente.deviceInfo)?.deviceSerial).trim() || null;
    if (!id || at === null || (!fuenteId && !serie)) continue;
    const foto = fotoDe(a);
    alarmas.push({
      id,
      fuenteId,
      serie,
      tipoEvento: texto(fuente.eventType),
      at,
      foto: foto.url,
      fotoCifrada: foto.cifrada,
    });
  }
  return {
    lote: lote && lote !== "0" ? lote : null,
    quedan: Number.isFinite(quedan) && quedan > 0 ? quedan : 0,
    alarmas,
  };
}

/**
 * Alarmas → movimientos de las cámaras del panel: por `resourceId` y, si no,
 * por serie. Una alarma de una cámara que no está enlazada no se muestra.
 */
export function aMovimientos(
  alarmas: readonly AlarmaHik[],
  camaras: readonly CamaraEnlazada[],
): MovimientoGuardado[] {
  const out: MovimientoGuardado[] = [];
  for (const a of alarmas) {
    const c =
      camaras.find((x) => a.fuenteId && x.resourceId === a.fuenteId) ??
      camaras.find((x) => a.serie && x.deviceSerial === a.serie);
    if (!c) continue;
    out.push({
      id: a.id,
      camaraId: c.id,
      nombre: c.nombre,
      at: a.at,
      conFoto: a.foto !== null,
      foto: a.foto,
      fotoCifrada: a.fotoCifrada,
    });
  }
  return out;
}

/** Guardado + nuevos, sin repetidos (gana el guardado), sin lo de más de 24 h, del más nuevo al más viejo. */
export function mezclarMovimientos(
  guardados: readonly MovimientoGuardado[],
  nuevos: readonly MovimientoGuardado[],
  ahora: number,
  vidaMs = VIDA_MOVIMIENTOS_MS,
  tope = TOPE_MOVIMIENTOS,
): MovimientoGuardado[] {
  const por = new Map<string, MovimientoGuardado>();
  for (const m of [...guardados, ...nuevos]) if (!por.has(m.id)) por.set(m.id, m);
  return [...por.values()]
    .filter((m) => ahora - m.at <= vidaMs)
    .sort((a, b) => b.at - a.at)
    .slice(0, tope);
}

/** Lo que sale al navegador: sin la URL firmada de la foto. */
export const paraCliente = (m: MovimientoGuardado): MovimientoNube => ({
  id: m.id,
  camaraId: m.camaraId,
  nombre: m.nombre,
  at: m.at,
  conFoto: m.conFoto,
});

/**
 * Dónde puede estar la foto (anti-SSRF): https, sin usuario, en la nube de EZVIZ
 * o su almacén. Sólo lo medido (23-10: `apiisa.ezvizlife.com` → 302 a
 * `*.customer-oci.com`); otro almacén se agrega cuando se vea, no antes.
 */
const DOMINIOS_FOTO = [".ezvizlife.com", ".customer-oci.com"];

export function esUrlDeFotoAlarma(url: string, primerSalto = true): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    /* El primer pedido va SIEMPRE a EZVIZ; el almacén sólo se acepta como redirección de EZVIZ. */
    const dominios = primerSalto ? [".ezvizlife.com"] : DOMINIOS_FOTO;
    return dominios.some((d) => u.hostname.endsWith(d));
  } catch {
    return false;
  }
}

/** Id de alarma aceptable en la URL de la foto (el `guid` medido: 32 hex). */
export const ID_ALARMA = /^[A-Za-z0-9_-]{6,64}$/;
