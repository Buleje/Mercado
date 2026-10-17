import "server-only";

/**
 * Manda los avisos de cámaras al celular por Web Push (2026-10-10).
 *
 * Mismo disparo que el WhatsApp del detector (`avisarPersonaDelMosaico`):
 * sólo «apareció» y «llegó otra», nunca «sigue»; cámara activa; franja de cada
 * dispositivo; pausa de 10 minutos por cámara (propia: el push no espera a que
 * el WhatsApp salga, y viceversa). Corre en `after()` de la ruta de la foto.
 *
 * Las claves VAPID salen SOLO del entorno (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` /
 * `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`) y van en cada envío, sin
 * `setVapidDetails` global: otro módulo que lo llame con claves de relleno no
 * nos tumba.
 */

import webpush from "web-push";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { CamarasCelularesDB } from "@/lib/db/camaras-celulares.db";
import { MOTIVOS_PERSONA_QUE_AVISAN } from "./avisar";
import {
  URL_PERSONAS,
  destinatariosDelPush,
  endpointDePushValido,
  fueraDeLaPausa,
  textoDelPush,
  type CelularSuscrito,
} from "./avisar-push";
import type { MetaFotoPersona } from "./personas";

/** Quiénes pueden recibir: los que ven el video y las fotos (y `manager`, que `requireAdmin` deja pasar siempre). */
export const ROLES_AVISO_CELULAR: readonly string[] = ["admin", "owner", "almacenero", "manager"];

export interface ClavesVapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Las claves del entorno, o `null` si faltan o son de relleno. Una pública de
 * verdad son 65 bytes (P-256 sin comprimir) y una privada 32: «xx...» no pasa.
 */
export function clavesVapid(): ClavesVapid | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const email = process.env.VAPID_EMAIL?.trim() ?? "";
  const b64 = /^[A-Za-z0-9_-]+$/;
  if (!b64.test(publicKey) || !b64.test(privateKey)) return null;
  if (Buffer.from(publicKey, "base64url").length !== 65 || Buffer.from(privateKey, "base64url").length !== 32) return null;
  const subject = /^(mailto:|https:\/\/)/.test(email) ? email : email.includes("@") ? `mailto:${email}` : "mailto:avisos@buleje.pe";
  return { publicKey, privateKey, subject };
}

/** El `topic` agrupa en el servicio de push: si el celular estuvo sin señal, le llega el último aviso de cada cámara, no veinte. */
function topicDe(camaraId: string): string {
  return `cam-${camaraId}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
}

const ENDPOINT_NO_PERMITIDO = "endpoint_no_permitido";

export type EnvioPush = { id: string; endpoint: string; status: number | null; error: string | null };

/** Un push a un dispositivo. Nunca tira: devuelve el código del servicio (201 = aceptado). */
export async function mandarPush(
  vapid: ClavesVapid,
  d: Pick<CelularSuscrito, "id" | "endpoint" | "keys">,
  carga: { title: string; body: string; url: string; tag: string },
  topic: string,
): Promise<EnvioPush> {
  /* Se vuelve a mirar justo antes del POST (revisión de seguridad 10-10): la
     lista vive en el KV y la ruta no es el único que podría escribirla. Una
     dirección que no es de un servicio de push no se toca y se olvida. */
  if (!endpointDePushValido(d.endpoint)) return { id: d.id, endpoint: d.endpoint, status: null, error: ENDPOINT_NO_PERMITIDO };
  try {
    const r = await webpush.sendNotification({ endpoint: d.endpoint, keys: d.keys }, JSON.stringify(carga), {
      vapidDetails: vapid,
      TTL: 60 * 60,
      urgency: "high",
      topic,
      timeout: 8_000,
    });
    return { id: d.id, endpoint: d.endpoint, status: r.statusCode, error: null };
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode ?? null;
    return { id: d.id, endpoint: d.endpoint, status, error: String((err as Error)?.message ?? err).slice(0, 200) };
  }
}

/** 404/410 = el navegador se desuscribió (borró datos, quitó el permiso): se olvida. Igual un endpoint no permitido. */
const MUERTO = (e: Pick<EnvioPush, "status" | "error">) => e.status === 404 || e.status === 410 || e.error === ENDPOINT_NO_PERMITIDO;

/** Se quedan sólo los dispositivos de usuarios activos del negocio con un rol que ve las fotos. */
async function soloUsuariosVigentes(tenantId: string, dispositivos: CelularSuscrito[]): Promise<CelularSuscrito[]> {
  const usuarios = [...new Set(dispositivos.map((d) => d.usuario))];
  const vigentes = new Set<string>();
  await Promise.all(
    usuarios.map(async (u) => {
      const fila = await AdminUsersDB.getByUsername(tenantId, u);
      if (fila?.active && ROLES_AVISO_CELULAR.includes(fila.role)) vigentes.add(u);
    }),
  );
  return dispositivos.filter((d) => vigentes.has(d.usuario));
}

export type ResultadoPush = {
  resultado: "mandado" | "no_corresponde" | "no_salio" | "sin_claves";
  enviados: number;
  total: number;
};

/**
 * Avisa al celular la foto que acaba de guardar el detector, si corresponde.
 * Puede tirar por la base: el que llama lo cierra con `.catch(logger)`.
 */
export async function avisarPersonaAlCelular(
  tenantId: string,
  camaraId: string,
  meta: Pick<MetaFotoPersona, "motivo" | "personas">,
  ahora: Date = new Date(),
): Promise<ResultadoPush> {
  const nada = (resultado: ResultadoPush["resultado"], total = 0): ResultadoPush => ({ resultado, enviados: 0, total });
  if (!MOTIVOS_PERSONA_QUE_AVISAN.includes(meta.motivo)) return nada("no_corresponde");

  const camara = (await CamarasDB.list(tenantId)).find((c) => c.id === camaraId);
  if (!camara) return nada("no_corresponde");
  /* Primer filtro con la lista en caché: casi todas las fotos caen en la pausa
     o fuera de franja y no llegan a tomar el candado. */
  const enCache = await CamarasCelularesDB.listar(tenantId);
  if (destinatariosDelPush(camara, enCache.dispositivos, ahora, enCache.ultimoPush[camaraId]).length === 0) {
    return nada("no_corresponde");
  }

  const vapid = clavesVapid();
  if (!vapid) {
    logger.warn("[camaras.push] faltan las claves VAPID del servidor: el aviso al celular no sale", { tenantId, camaraId });
    return nada("sin_claves");
  }

  const turno = await CamarasCelularesDB.reservarTurno(
    tenantId,
    camaraId,
    ahora,
    (estado, previo) =>
      fueraDeLaPausa(previo, ahora) && destinatariosDelPush(camara, estado.dispositivos, ahora, null).length > 0,
  );
  if (!turno.ok) return nada("no_corresponde");

  const destinos = await soloUsuariosVigentes(
    tenantId,
    destinatariosDelPush(camara, turno.estado.dispositivos, ahora, null),
  );
  const { title, body } = textoDelPush(camara, meta, ahora);
  const envios = await Promise.all(
    destinos.map((d) => mandarPush(vapid, d, { title, body, url: URL_PERSONAS, tag: `camara-${camara.id}` }, topicDe(camara.id))),
  );
  const enviados = envios.filter((e) => e.status !== null && e.status >= 200 && e.status < 300).length;
  const muertos = envios.filter((e) => MUERTO(e)).map((e) => e.endpoint);
  if (muertos.length) {
    await CamarasCelularesDB.olvidarEndpoints(tenantId, muertos).catch((err) =>
      logger.error("[camaras.push] no se pudieron olvidar los dispositivos dados de baja", { tenantId, error: String(err) }),
    );
  }
  logger.info("[camaras.push] aviso al celular", {
    tenantId,
    camaraId,
    motivo: meta.motivo,
    enviados,
    total: destinos.length,
    codigos: envios.map((e) => e.status),
  });
  if (enviados > 0) return { resultado: "mandado", enviados, total: destinos.length };

  /* Ninguno salió: se devuelve el turno para que la próxima persona sí avise. */
  await CamarasCelularesDB.liberarTurno(tenantId, camaraId, ahora, turno.previo).catch((err) =>
    logger.error("[camaras.push] no se pudo devolver el turno del aviso", { tenantId, camaraId, error: String(err) }),
  );
  return { resultado: "no_salio", enviados: 0, total: destinos.length };
}

/** El botón «Probar»: un push a UN dispositivo, sin pausa ni franja. */
export async function probarCelular(
  tenantId: string,
  id: string,
  camara: { id: string; nombre: string },
): Promise<{ ok: boolean; status: number | null; motivo?: string }> {
  const vapid = clavesVapid();
  if (!vapid) return { ok: false, status: null, motivo: "sin_claves" };
  const d = (await CamarasCelularesDB.listar(tenantId)).dispositivos.find((x) => x.id === id);
  if (!d) return { ok: false, status: null, motivo: "not_found" };
  const r = await mandarPush(
    vapid,
    d,
    {
      title: `📷 ${camara.nombre} · prueba`,
      body: "Así te va a llegar el aviso cuando el video en vivo vea a alguien.",
      url: URL_PERSONAS,
      tag: `camara-${camara.id}-prueba`,
    },
    topicDe(`${camara.id}p`),
  );
  if (MUERTO(r)) await CamarasCelularesDB.olvidarEndpoints(tenantId, [d.endpoint]);
  return { ok: r.status !== null && r.status >= 200 && r.status < 300, status: r.status, motivo: r.error ?? undefined };
}
