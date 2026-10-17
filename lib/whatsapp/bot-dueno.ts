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
  try {
    const meta = await fetch(`${API}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meta.ok) {
      logger.warn("[whatsapp/dueño] Meta no dio la URL del media", { status: meta.status });
      return null;
    }
    const info = (await meta.json()) as { url?: string; mime_type?: string };
    if (!info.url) {
      logger.warn("[whatsapp/dueño] Meta respondió sin URL de descarga");
      return null;
    }

    const archivo = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!archivo.ok) {
      logger.warn("[whatsapp/dueño] no se pudo bajar el media", { status: archivo.status });
      return null;
    }

    const mime = info.mime_type ?? archivo.headers.get("content-type") ?? "application/octet-stream";
    const bytes = Buffer.from(await archivo.arrayBuffer());
    return { bytes, mime, nombre: `media.${extensionDe(mime)}` };
  } catch (err) {
    logger.warn("[whatsapp/dueño] falló la bajada del media", { error: String(err) });
    return null;
  }
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
