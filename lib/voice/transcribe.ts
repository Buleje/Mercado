import "server-only";
import { logger } from "@/lib/logger";

/**
 * Envía audio YA EN MEMORIA a Groq Whisper large-v3. Extraído de
 * `transcribeAudio` (2026-08-31) para reusar el mismo proveedor con audio
 * que no viene de WhatsApp — ej. un archivo subido desde el admin — sin
 * duplicar la llamada a Groq en dos lugares.
 *
 * @param audioBuffer - contenido crudo del audio
 * @param mimeType     - MIME type real (define la extensión que ve Groq)
 * @returns            - Texto transcrito en español
 */
export async function transcribeAudioBuffer(
  audioBuffer: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const groqApiKey = process.env.GROQ_API_KEY ?? "";
  if (!groqApiKey) {
    throw new Error("[voice/transcribe] GROQ_API_KEY no configurado");
  }

  const ext = resolveExtension(mimeType);
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append("file", blob, `audio.${ext}`);
  formData.append("model", "whisper-large-v3");
  formData.append("language", "es");
  formData.append("response_format", "text");

  const groqRes = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${groqApiKey}` },
      body: formData,
    },
  );

  if (!groqRes.ok) {
    const detail = await groqRes.text().catch(() => "");
    throw new Error(
      `[voice/transcribe] Error en Groq Whisper: ${groqRes.status} ${detail}`,
    );
  }

  // response_format=text devuelve plain text, no JSON
  return (await groqRes.text()).trim();
}

/**
 * Descarga un audio desde la Media API de WhatsApp y lo transcribe
 * usando Groq Whisper large-v3.
 *
 * @param mediaId  - ID del media object retornado por Meta en el webhook
 * @param mimeType - MIME type del audio (e.g. "audio/ogg; codecs=opus")
 * @returns        - Texto transcrito en español
 */
export async function transcribeAudio(
  mediaId: string,
  mimeType?: string,
): Promise<string> {
  const whatsappToken =
    process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_API_TOKEN ?? "";

  if (!whatsappToken) {
    throw new Error("[voice/transcribe] WHATSAPP_ACCESS_TOKEN no configurado");
  }

  // ── 1. Obtener URL de descarga desde la Graph API ──────────────────────────
  const metaRes = await fetch(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${whatsappToken}` },
    },
  );

  if (!metaRes.ok) {
    const detail = await metaRes.text().catch(() => "");
    throw new Error(
      `[voice/transcribe] Error obteniendo URL del media: ${metaRes.status} ${detail}`,
    );
  }

  const metaJson = (await metaRes.json()) as { url?: string };
  const mediaUrl = metaJson.url;
  if (!mediaUrl) {
    throw new Error("[voice/transcribe] Meta no devolvió URL de descarga");
  }

  // ── 2. Descargar el audio ──────────────────────────────────────────────────
  const audioRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${whatsappToken}` },
  });

  if (!audioRes.ok) {
    throw new Error(
      `[voice/transcribe] Error descargando audio: ${audioRes.status}`,
    );
  }

  const audioBuffer = await audioRes.arrayBuffer();

  // ── 3. Transcribir con Groq Whisper (helper compartido) ────────────────────
  const transcription = await transcribeAudioBuffer(audioBuffer, mimeType ?? "audio/ogg");

  logger.info("[voice/transcribe] Transcripción completada", {
    mediaId,
    chars: transcription.length,
  });

  return transcription;
}

function resolveExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("mp4") || lower.includes("m4a")) return "m4a";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("flac")) return "flac";
  return "ogg"; // WhatsApp default
}
