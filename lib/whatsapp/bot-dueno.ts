import "server-only";

/**
 * lib/whatsapp/bot-dueno.ts
 *
 * Las tuberías del bot que ANOTA por WhatsApp: bajar lo que mandaron y
 * contestar. Es el equivalente de `lib/telegram/bot.ts` para el otro canal.
 *
 * ── Por qué un módulo aparte de `lib/integrations/whatsapp.ts` ───────────────
 * Aquel manda con el número y el token de la PLATAFORMA (avisos de pedidos,
 * recordatorios de fiado). Éste contesta por el número DEL NEGOCIO que recibió
 * el mensaje, con el token de ese negocio, porque la conversación tiene que
 * seguir en el mismo hilo donde el dueño escribió.
 */

import { logger } from "@/lib/logger";

/** La versión de la Graph API que ya usa el resto del código de WhatsApp. */
const API = "https://graph.facebook.com/v19.0";

export interface CredencialesMeta {
  phoneNumberId: string;
  token: string;
}

/**
 * Baja un archivo que llegó por WhatsApp (audio, foto, documento).
 *
 * Son DOS saltos, no uno: Meta primero entrega una URL firmada y recién esa URL
 * devuelve los bytes — y el segundo pedido también va con el token, cosa que se
 * olvida fácil porque la URL ya parece autenticada.
 *
 * Devuelve `null` en cualquier fallo (no lanza): el webhook tiene que poder
 * contestarle algo al usuario en vez de reventar.
 */
export async function bajarMedia(
  mediaId: string,
  token: string,
): Promise<{ bytes: Buffer; mime: string; nombre: string } | null> {
  const r = await bajarMediaConTope(mediaId, token);
  return r.ok ? { bytes: r.bytes, mime: r.mime, nombre: r.nombre } : null;
}

export type BajadaDeMedia =
  | { ok: true; bytes: Buffer; mime: string; nombre: string }
  | { ok: false; motivo: "grande" | "fallo" };

/**
 * Un id de media de Meta son dígitos (a lo sumo letras): nunca una ruta. Va
 * pegado a la URL de la Graph API con el token del negocio, así que un `../` o
 * un `?` ahí apuntaría ese token a otro endpoint.
 */
const ID_DE_MEDIA = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Dónde sirve Meta los adjuntos (misma lista que `whatsapp/yape-capture`,
 * pentest N3). La URL de descarga la entrega la Graph API y se pide CON el
 * token: un host inesperado se quedaría con el token del negocio.
 */
const HOSTS_DE_MEDIA = ["lookaside.fbsbx.com", "scontent.xx.fbcdn.net", ".fbcdn.net", ".facebook.com"];

export function esHostDeMediaDeMeta(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return HOSTS_DE_MEDIA.some((p) => (p.startsWith(".") ? h.endsWith(p) : h === p));
}

/**
 * Lo mismo que `bajarMedia`, pero frena antes de bajar lo que pesa de más y
 * dice POR QUÉ no se pudo: «es muy grande» y «falló» piden respuestas distintas.
 *
 * El peso se mira tres veces porque ninguna sola alcanza: `file_size` de la
 * Graph API (antes de bajar nada), el `content-length` de la descarga, y los
 * bytes reales (los dos primeros pueden faltar).
 */
export async function bajarMediaConTope(
  mediaId: string,
  token: string,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<BajadaDeMedia> {
  const fallo = { ok: false, motivo: "fallo" } as const;
  const grande = { ok: false, motivo: "grande" } as const;
  if (!ID_DE_MEDIA.test(mediaId)) {
    logger.warn("[whatsapp/dueño] id de media con forma rara — no se pide");
    return fallo;
  }
  try {
    // La Graph API no redirige: una redirección acá es rara y se corta.
    const meta = await fetch(`${API}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
    });
    if (!meta.ok) {
      logger.warn("[whatsapp/dueño] Meta no dio la URL del media", { status: meta.status });
      return fallo;
    }
    const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!info.url) {
      logger.warn("[whatsapp/dueño] Meta respondió sin URL de descarga");
      return fallo;
    }
    if (typeof info.file_size === "number" && info.file_size > maxBytes) return grande;

    const archivo = await pedirMediaDeMeta(info.url, token);
    if (!archivo) return fallo;
    if (!archivo.ok) {
      logger.warn("[whatsapp/dueño] no se pudo bajar el media", { status: archivo.status });
      return fallo;
    }
    const declarado = Number(archivo.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(declarado) && declarado > maxBytes) {
      await archivo.body?.cancel().catch((err: unknown) =>
        logger.warn("[whatsapp/dueño] no se pudo cortar la descarga", { error: String(err) }),
      );
      return grande;
    }

    const mime = info.mime_type ?? archivo.headers.get("content-type") ?? "application/octet-stream";
    const bytes = await leerConTope(archivo, maxBytes);
    if (!bytes) return grande;
    return { ok: true, bytes, mime, nombre: `media.${extensionDe(mime)}` };
  } catch (err) {
    logger.warn("[whatsapp/dueño] falló la bajada del media", { error: String(err) });
    return fallo;
  }
}

/** Saltos de redirección que se aceptan en la descarga (cada uno, revalidado). */
const MAX_REDIRECCIONES = 3;

/** `https:` y host de Meta: lo único a lo que se le manda el token. */
function urlDeMediaSegura(cruda: string, base?: string): URL | null {
  let url: URL;
  try {
    url = new URL(cruda, base);
  } catch {
    logger.warn("[whatsapp/dueño] la URL del media no se entiende");
    return null;
  }
  if (url.protocol !== "https:" || !esHostDeMediaDeMeta(url.hostname)) {
    logger.warn("[whatsapp/dueño] URL del media fuera de Meta — no se manda el token", { host: url.hostname });
    return null;
  }
  return url;
}

/**
 * GET del binario con el token, siguiendo las redirecciones A MANO: cada salto
 * se revalida (https + host de Meta) antes de mandarle el token. Hoy Meta
 * entrega el binario directo desde lookaside; si un día redirige a su CDN, sigue
 * andando, y si redirige afuera, se corta. `null` = no se pudo o no era seguro.
 */
async function pedirMediaDeMeta(urlInicial: string, token: string): Promise<Response | null> {
  let url = urlDeMediaSegura(urlInicial);
  for (let salto = 0; url && salto <= MAX_REDIRECCIONES; salto++) {
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, redirect: "manual" });
    if (r.status < 300 || r.status >= 400) return r;
    const siguiente = r.headers.get("location");
    await r.body?.cancel().catch((err: unknown) =>
      logger.warn("[whatsapp/dueño] no se pudo cerrar la redirección", { error: String(err) }),
    );
    if (!siguiente) {
      logger.warn("[whatsapp/dueño] redirección sin destino", { status: r.status });
      return null;
    }
    url = urlDeMediaSegura(siguiente, url.toString());
  }
  if (url) logger.warn("[whatsapp/dueño] demasiadas redirecciones bajando el media");
  return null;
}

/**
 * Lee el cuerpo por partes y corta apenas pasa el tope: sin `content-length`,
 * `arrayBuffer()` cargaba TODO en memoria antes de poder mirar el peso.
 * `null` = se pasó del tope.
 */
async function leerConTope(res: Response, maxBytes: number): Promise<Buffer | null> {
  if (!res.body) return Buffer.alloc(0);
  const lector = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await lector.cancel().catch((err: unknown) =>
        logger.warn("[whatsapp/dueño] no se pudo cortar la descarga", { error: String(err) }),
      );
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes, total);
}

/**
 * La extensión importa: Groq elige el decodificador por ella, así que un `.bin`
 * hace fallar una transcripción que el audio soportaba perfectamente.
 */
function extensionDe(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("webm")) return "webm";
  if (m.includes("flac")) return "flac";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("pdf")) return "pdf";
  return "ogg"; // el default de las notas de voz de WhatsApp
}

/** Manda un texto por el número del negocio. */
export async function mandarTexto(
  cred: CredencialesMeta,
  telefono: string,
  texto: string,
): Promise<boolean> {
  return enviar(cred, {
    messaging_product: "whatsapp",
    to: telefono,
    type: "text",
    text: { body: recortar(texto) },
  });
}

/**
 * Manda un texto con botones de respuesta.
 *
 * WhatsApp admite TRES botones como máximo y 20 caracteres por título; pasarse
 * hace que Meta rechace el mensaje entero con un 400 y el usuario no vea nada.
 * Se recorta acá en vez de confiar en quien llama.
 */
export async function mandarBotones(
  cred: CredencialesMeta,
  telefono: string,
  texto: string,
  botones: Array<{ id: string; titulo: string }>,
): Promise<boolean> {
  return enviar(cred, {
    messaging_product: "whatsapp",
    to: telefono,
    type: "interactive",
    interactive: {
      type: "button",
      // El cuerpo de un interactivo tope en 1024, no en 4096 como el texto.
      body: { text: recortar(texto, 1024) },
      action: {
        buttons: botones.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id.slice(0, 256), title: b.titulo.slice(0, 20) },
        })),
      },
    },
  });
}

/** WhatsApp corta los textos largos; mejor recortar avisando que perder el final. */
function recortar(texto: string, tope = 4000): string {
  const limpio = texto.trim();
  if (limpio.length <= tope) return limpio;
  return `${limpio.slice(0, tope - 1)}…`;
}

async function enviar(cred: CredencialesMeta, cuerpo: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${API}/${cred.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cred.token}`,
      },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      logger.warn("[whatsapp/dueño] Meta rechazó el envío", { status: res.status, detalle });
    }
    return res.ok;
  } catch (err) {
    logger.warn("[whatsapp/dueño] no se pudo enviar", { error: String(err) });
    return false;
  }
}
