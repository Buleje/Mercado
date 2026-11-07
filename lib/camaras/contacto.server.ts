import "server-only";
import { logger } from "@/lib/logger";
import type { ContactoCamara, TipoContacto } from "@/lib/camaras/contacto";

/**
 * Dónde se anota el último aviso de cada cámara (2026-10-05): Redis con
 * vencimiento, no la lista de cámaras.
 *
 * La lista de cámaras es un JSON que se reescribe entero: anotar ahí cada
 * latido (la cámara lo manda solo, varias veces por hora) era reescribirla
 * todo el día. Un SET en Redis cuesta un comando y vence solo a los 60 días.
 * Sin Upstash (desarrollo sin variables) vive en la memoria del proceso.
 */

const VENCE_SEG = 60 * 24 * 3600;
/** Un latido tras otro en el mismo minuto no cambia «hace X»: no se escribe. */
const ENTRE_ESCRITURAS_MS = 60_000;
const clave = (tenantId: string, camaraId: string) => `camaras:contacto:${tenantId}:${camaraId}`;

type Redis = import("@upstash/redis").Redis;
let _redis: Redis | null = null;
let _resuelto = false;

async function getRedis(): Promise<Redis | null> {
  if (_resuelto) return _redis;
  _resuelto = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    _redis = new Redis({ url, token });
  } catch (err) {
    logger.warn("[camaras.contacto] Upstash no disponible, uso la memoria", { error: String(err) });
    _redis = null;
  }
  return _redis;
}

const memoria = new Map<string, ContactoCamara>();
const ultimaEscritura = new Map<string, number>();

/** Anota que la cámara tocó la puerta. Nunca tira: el aviso ya se atendió. */
export async function anotarContacto(
  tenantId: string,
  camaraId: string,
  tipo: TipoContacto,
): Promise<void> {
  const k = clave(tenantId, camaraId);
  const ahora = Date.now();
  /* Una foto siempre se anota (es lo que la pantalla muestra); el latido, como mucho una vez por minuto. */
  if (tipo !== "foto" && ahora - (ultimaEscritura.get(k) ?? 0) < ENTRE_ESCRITURAS_MS) return;
  ultimaEscritura.set(k, ahora);
  const valor: ContactoCamara = { at: new Date(ahora).toISOString(), tipo };
  memoria.set(k, valor);
  try {
    const r = await getRedis();
    if (r) await r.set(k, valor, { ex: VENCE_SEG });
  } catch (err) {
    logger.warn("[camaras.contacto] no se pudo anotar", { error: String(err), camaraId });
  }
}

function esContacto(v: unknown): v is ContactoCamara {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.at === "string" && (o.tipo === "foto" || o.tipo === "alerta" || o.tipo === "latido")
  );
}

/** El último aviso anotado de cada cámara; las que no tienen, no aparecen. */
export async function leerContactos(
  tenantId: string,
  camaraIds: readonly string[],
): Promise<Record<string, ContactoCamara>> {
  const fuera: Record<string, ContactoCamara> = {};
  if (camaraIds.length === 0) return fuera;
  const claves = camaraIds.map((id) => clave(tenantId, id));
  let valores: unknown[] = claves.map((k) => memoria.get(k) ?? null);
  try {
    const r = await getRedis();
    if (r) valores = await r.mget<unknown[]>(...claves);
  } catch (err) {
    logger.warn("[camaras.contacto] no se pudo leer, uso la memoria", { error: String(err) });
  }
  camaraIds.forEach((id, i) => {
    const v = valores[i];
    if (esContacto(v)) fuera[id] = v;
  });
  return fuera;
}
