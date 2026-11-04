/**
 * El CLIENTE acepta la cotización desde su enlace público (noche 04-11, tramo 2).
 *
 * - El negocio y la cotización salen SOLO del token (propósito `cot`); el cuerpo
 *   trae sólo `{ nombre }` y cualquier otra clave se descarta.
 * - El cambio de estado es un único UPDATE con la condición en el WHERE
 *   (`CotizacionesDB.aceptarSiSigueAbierta`): el segundo clic o una carrera con
 *   el panel no la vuelve a aceptar.
 * - Quién y cuándo: el modelo `Cotizacion` no tiene columnas para eso (sin
 *   migración esta noche), así que va al registro de actividad (`ActivityLog`,
 *   acción `cotizacion_aceptada_por_cliente`) con el nombre, la IP recortada y
 *   el navegador recortado. La página lo vuelve a leer de ahí.
 * - Aviso al dueño: la campana del panel (`Notification`). Sin WhatsApp ni correo.
 */
import "server-only";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { CotizacionesDB } from "@/lib/db/cotizaciones.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { logger } from "@/lib/logger";
import { ESTADOS_ACEPTABLES, NOMBRE_MAX, NOMBRE_MIN, condicionVigente, ipRecortada, puedeAceptarse } from "./aceptacion";
import { verificarTokenCotizacion } from "./enlace-token";

export const ACCION_ACEPTADA = "cotizacion_aceptada_por_cliente";
export const ENTIDAD_COTIZACION = "Cotizacion";
/** Quién figura en el registro: no es un usuario del panel. */
export const USUARIO_ENLACE = "cliente-enlace";

export const AceptarCotizacionSchema = z.object({
  nombre: z
    .string({ error: "Escribe tu nombre." })
    .trim()
    .min(NOMBRE_MIN, `Escribe tu nombre (al menos ${NOMBRE_MIN} letras).`)
    .max(NOMBRE_MAX, `El nombre puede tener hasta ${NOMBRE_MAX} letras.`)
    // «» delimitan el nombre en el registro; < >, controles y marcas invisibles (U+202E invierte el texto) no van en un nombre.
    .refine((s) => !/[«»<>\p{Cc}\p{Cf}]/u.test(s), "El nombre tiene caracteres que no se pueden guardar."),
});

export type ResultadoAceptar =
  | { ok: true; numero: string; nombre: string; aceptadaEl: string }
  /** 404 = enlace no válido (no dice por qué). 409 = ya no se puede aceptar. */
  | { ok: false; status: 404 | 409; estado?: string; vencida?: boolean };

const recortar = (s: string | null | undefined, n: number) => (s ?? "").replace(/[\p{Cc}\p{Cf}]/gu, " ").trim().slice(0, n);

export async function aceptarCotizacionPublica(
  token: string,
  nombreCrudo: string,
  meta: { ip: string | null; userAgent: string | null },
  ahora: number = Date.now(),
): Promise<ResultadoAceptar> {
  const v = verificarTokenCotizacion(token, ahora);
  if (!v.valido) return { ok: false, status: 404 };
  const { tenantId, cotizacionId } = v;

  const cot = await CotizacionesDB.getById(cotizacionId, tenantId);
  if (!cot || cot.tenantId !== tenantId) return { ok: false, status: 404 };
  if (!puedeAceptarse(cot.status, cot.validoHasta, ahora)) {
    // En un estado aceptable, lo único que la frena es la vigencia.
    const vencida = cot.status === "VENCIDA" || (ESTADOS_ACEPTABLES as readonly string[]).includes(cot.status);
    return { ok: false, status: 409, estado: cot.status, vencida };
  }

  const aceptada = await CotizacionesDB.aceptarSiSigueAbierta(tenantId, cotizacionId, {
    estados: ESTADOS_ACEPTABLES,
    ...condicionVigente(ahora),
  });
  if (!aceptada) return { ok: false, status: 409 };

  const nombre = nombreCrudo.replace(/\s+/g, " ").trim();
  const aceptadaEl = new Date(ahora).toISOString();

  // Esperado (no suelto): en Vercel lo suelto se corta al responder, y la página lo relee.
  await logActivity(
    ACCION_ACEPTADA,
    ENTIDAD_COTIZACION,
    `Cotización ${cot.numero} aceptada por el cliente desde el enlace público · nombre «${nombre}» · total ${cot.total} · IP ${ipRecortada(meta.ip)} · navegador ${recortar(meta.userAgent, 120) || "desconocido"}`,
    cotizacionId,
    USUARIO_ENLACE,
    undefined,
    tenantId,
  );

  await NotificationCenterDB.create({
    tenantId,
    type: "cotizacion_aceptada",
    severity: "MEDIUM",
    title: `Cotización ${cot.numero} aceptada por ${nombre}`,
    body: `${cot.clienteNombre} la aceptó desde el enlace. Falta convertirla en pedido.`,
    actionUrl: "/admin?tab=cotizaciones",
    actionLabel: "Ver cotizaciones",
    entityId: cotizacionId,
  }).catch((err) => logger.error("[cotizacion-aceptar] aviso de la campana falló", { error: String(err) }));

  try {
    const { invalidateAdminCache } = await import("@/lib/admin-cache");
    invalidateAdminCache.afterDocument(tenantId);
  } catch (err) {
    logger.error("[cotizacion-aceptar] invalidar caché falló", { error: String(err) });
  }

  return { ok: true, numero: cot.numero, nombre, aceptadaEl };
}

/** Quién la aceptó desde el enlace y cuándo (del registro de actividad); `null` si no fue por el enlace. */
export async function leerAceptacion(tenantId: string, cotizacionId: string): Promise<{ nombre: string; el: string } | null> {
  try {
    const filas = await ActivityLogDB.list(tenantId, { entity: ENTIDAD_COTIZACION, entityId: cotizacionId, limit: 20 });
    const fila = filas.find((f) => f.action === ACCION_ACEPTADA);
    const nombre = fila ? /nombre «([^»]+)»/.exec(fila.detail)?.[1] : undefined;
    return fila && nombre ? { nombre, el: new Date(fila.createdAt).toISOString() } : null;
  } catch (err) {
    logger.warn("[cotizacion-publica] leer quién aceptó falló", { error: String(err) });
    return null;
  }
}
