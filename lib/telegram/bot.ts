import "server-only";

/**
 * lib/telegram/bot.ts
 *
 * El cliente de la API de Telegram, con lo justo para un bot que anota.
 *
 * Se habla directo con `api.telegram.org` en vez de una librería: son cuatro
 * llamadas (mandar mensaje, contestar un botón, bajar un audio, registrar el
 * webhook) y una dependencia menos que auditar en un camino que recibe datos de
 * afuera.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";

const API = "https://api.telegram.org";

export function botConfigurado(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN no está configurado.");
  return t;
}

/**
 * El secreto que Telegram devuelve en cada webhook.
 *
 * Se deriva del token del bot: quien no lo tiene no puede fabricarlo, y no hay
 * un secreto más que administrar. Telegram lo manda en
 * `X-Telegram-Bot-Api-Secret-Token` y sin él cualquiera que descubra la URL
 * podría inyectar mensajes falsos.
 */
export function secretoWebhook(): string {
  return createHmac("sha256", token()).update("telegram-webhook").digest("hex").slice(0, 48);
}

export function secretoValido(recibido: string | null): boolean {
  if (!recibido) return false;
  const esperado = secretoWebhook();
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Tipos de lo que manda Telegram (sólo lo que se usa) ─────────────────────

export interface TgChat { id: number; type: string; title?: string; username?: string; first_name?: string }
export interface TgUser { id: number; first_name?: string; username?: string }
export interface TgVoice { file_id: string; duration: number; mime_type?: string; file_size?: number }
export interface TgAudio extends TgVoice { file_name?: string }
export interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  voice?: TgVoice;
  audio?: TgAudio;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
}
export interface TgCallback {
  id: string;
  from?: TgUser;
  data?: string;
  message?: { message_id: number; chat: TgChat };
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallback;
}

/** Un botón de los que aparecen debajo del mensaje. */
export interface Boton { texto: string; data: string }

// ── Llamadas ────────────────────────────────────────────────────────────────

async function llamar(metodo: string, cuerpo: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API}/bot${token()}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram ${metodo}: ${data.description ?? `HTTP ${res.status}`}`);
  }
  return data.result;
}

/**
 * Manda un mensaje al chat.
 *
 * `parse_mode` es HTML y no Markdown a propósito: los montos llevan `S/` y los
 * nombres llevan guiones y paréntesis, que en Markdown hay que escapar uno por
 * uno y un escape olvidado hace que Telegram RECHACE el mensaje entero — es
 * decir, la confirmación no llega y la operación queda colgada.
 */
export async function mandarMensaje(
  chatId: number,
  texto: string,
  botones?: Boton[],
): Promise<number | null> {
  try {
    const res = (await llamar("sendMessage", {
      chat_id: chatId,
      text: texto,
      parse_mode: "HTML",
      ...(botones && botones.length > 0
        ? { reply_markup: { inline_keyboard: [botones.map((b) => ({ text: b.texto, callback_data: b.data }))] } }
        : {}),
    })) as { message_id?: number };
    return res?.message_id ?? null;
  } catch (err) {
    logger.warn("[telegram] no se pudo mandar el mensaje", { chatId, error: String(err) });
    return null;
  }
}

/** Reemplaza el texto de un mensaje ya mandado (y le saca los botones). */
export async function editarMensaje(chatId: number, messageId: number, texto: string): Promise<void> {
  try {
    await llamar("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: texto,
      parse_mode: "HTML",
    });
  } catch (err) {
    logger.warn("[telegram] no se pudo editar el mensaje", { chatId, error: String(err) });
  }
}

/**
 * Le saca el relojito al botón que el usuario tocó.
 *
 * Telegram deja el botón "cargando" hasta que se contesta esto. Sin la
 * respuesta, la app se ve trabada aunque el trabajo ya esté hecho.
 */
export async function contestarBoton(callbackId: string, aviso?: string): Promise<void> {
  try {
    await llamar("answerCallbackQuery", { callback_query_id: callbackId, ...(aviso ? { text: aviso } : {}) });
  } catch (err) {
    logger.warn("[telegram] no se pudo contestar el botón", { error: String(err) });
  }
}

/** «escribiendo…» mientras se transcribe y se interpreta. */
export async function mostrarEscribiendo(chatId: number): Promise<void> {
  try {
    await llamar("sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {
    // Cosmético: que falle no puede afectar al mensaje real.
  }
}

/** Baja un archivo del bot (audio de voz, adjunto). Devuelve bytes + nombre. */
export async function bajarArchivo(fileId: string): Promise<{ bytes: Uint8Array; nombre: string } | null> {
  try {
    const info = (await llamar("getFile", { file_id: fileId })) as { file_path?: string };
    if (!info?.file_path) return null;
    const res = await fetch(`${API}/file/bot${token()}/${info.file_path}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // El nombre importa: Groq elige el decodificador por la extensión, y las
    // notas de voz de Telegram vienen como `.oga` (Opus en contenedor Ogg).
    const nombre = info.file_path.split("/").pop() ?? "audio.oga";
    return { bytes, nombre };
  } catch (err) {
    logger.warn("[telegram] no se pudo bajar el archivo", { fileId, error: String(err) });
    return null;
  }
}

/** Registra (o borra) el webhook. Lo usa la pantalla de Automatizaciones. */
export async function registrarWebhook(url: string | null): Promise<{ ok: boolean; detalle: string }> {
  try {
    if (!url) {
      await llamar("deleteWebhook", { drop_pending_updates: false });
      return { ok: true, detalle: "Webhook borrado. El bot deja de recibir mensajes." };
    }
    await llamar("setWebhook", {
      url,
      secret_token: secretoWebhook(),
      // Sólo lo que se usa: menos superficie y menos ruido en el log.
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
    return { ok: true, detalle: `Webhook apuntando a ${url}` };
  } catch (err) {
    return { ok: false, detalle: err instanceof Error ? err.message : String(err) };
  }
}

/** Estado actual del webhook, para poder diagnosticar sin salir del panel. */
export async function estadoWebhook(): Promise<Record<string, unknown> | null> {
  try {
    return (await llamar("getWebhookInfo", {})) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Datos del bot (nombre de usuario) — para mostrar el enlace t.me correcto. */
export async function datosDelBot(): Promise<{ username?: string; first_name?: string } | null> {
  try {
    return (await llamar("getMe", {})) as { username?: string; first_name?: string };
  } catch {
    return null;
  }
}

/** Escapa lo que va dentro de un mensaje HTML de Telegram. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
