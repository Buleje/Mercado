import "server-only";

/**
 * lib/ai/transcribir.ts
 *
 * Audio → texto, para que «anotame…» se pueda decir de verdad.
 *
 * Por qué existe teniendo el dictado del navegador: la Web Speech API se cae
 * donde más se la necesita — un celular viejo, un galpón con el motor prendido,
 * o simplemente un audio de WhatsApp que ya está grabado y hay que leer. Groq
 * sirve `whisper-large-v3-turbo` en la MISMA cuenta que ya usa el asistente, y
 * transcribe el `.ogg` que manda Telegram sin convertir nada.
 *
 * Verificado 2026-09-04 con un dictado real en español:
 *   «Anótame compra de combustible para camión N12, el precio del petróleo sale
 *    27 y el tanque 25 galones» → transcrito palabra por palabra, «N12» incluido.
 */

import { logger } from "@/lib/logger";

/**
 * Las extensiones que Groq acepta, TAL CUAL las publica su error.
 *
 * Copiadas de la respuesta del servidor, no de la documentación: es la lista
 * contra la que realmente valida.
 */
const FORMATOS_GROQ = [
  "flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "opus", "wav", "webm",
] as const;

/**
 * ⛔ Extensiones que Groq NO conoce pero cuyo contenido sí sabe leer.
 *
 * `.oga` es Opus dentro de un contenedor Ogg — el MISMO archivo que `.ogg`, con
 * otro nombre. Y es justo lo que manda Telegram en cada nota de voz. Groq
 * valida por extensión antes de mirar el contenido, así que rechazaba con
 * «file must be one of the following types» un audio que decodifica perfecto.
 *
 * Se renombra al subirlo. El archivo no se toca: sólo el nombre con el que
 * viaja.
 *
 * Esto no lo atrapó la prueba original porque el audio de prueba se generó como
 * `.ogg`: el formato que Telegram usa de verdad nunca pasó por acá.
 */
const ALIAS: Record<string, string> = {
  oga: "ogg",
  weba: "webm",
  mpg: "mpeg",
  mp2: "mpga",
  // Lo que graba un iPhone si el navegador no convierte.
  caf: "m4a",
};

/** Lo que aceptamos de entrada: lo de Groq más lo que sabemos traducir. */
export const FORMATOS_AUDIO = [...FORMATOS_GROQ, ...Object.keys(ALIAS)] as const;

/** 25 MB es el tope de Groq; un audio de voz de 10 minutos pesa ~1 MB. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * El vocabulario del negocio, como pista para el reconocedor.
 *
 * Whisper acepta un `prompt` que sesga la transcripción hacia ciertas palabras.
 * Sin esto, «GTF» sale «ge te efe», «troza» sale «trozar» y «Yape» sale «llape»
 * — y una palabra mal transcrita es una operación que no se puede anotar.
 * Son términos, no una instrucción: Whisper no obedece órdenes, imita estilo.
 */
const VOCABULARIO =
  "Buleje, Pucallpa, soles, S/, galones, petróleo, combustible, camión, tractor, " +
  "cargador frontal, horómetro, adelanto, fiado, Yape, Plin, boleta, factura, " +
  "guía forestal, GTF, troza, trozas, pies tablares, aserradero, SERFOR, lote.";

export interface Transcripcion {
  texto: string;
  /** Segundos de audio — para saber cuánto se consumió. */
  duracion?: number;
}

export type ResultadoTranscribir =
  | { ok: true; transcripcion: Transcripcion }
  | { ok: false; error: string };

/**
 * Transcribe un audio a texto en español.
 *
 * @param audio     el archivo, tal como llegó (no hace falta convertirlo)
 * @param nombre    nombre con extensión — Groq elige el decodificador por ella
 */
export async function transcribirAudio(
  audio: Blob | Buffer | Uint8Array,
  nombre: string,
): Promise<ResultadoTranscribir> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Falta GROQ_API_KEY: no hay con qué transcribir el audio." };
  }

  const extension = nombre.split(".").pop()?.toLowerCase() ?? "";
  const paraGroq = ALIAS[extension] ?? extension;
  if (!FORMATOS_GROQ.includes(paraGroq as (typeof FORMATOS_GROQ)[number])) {
    return {
      ok: false,
      error: `No sé leer archivos ".${extension}". Mandá el audio en ${FORMATOS_GROQ.slice(0, 5).join(", ")}…`,
    };
  }
  /**
   * El nombre con el que sube, no el que llegó: si la extensión es una que Groq
   * no conoce, viaja con su equivalente. El contenido es el mismo byte por byte.
   */
  const nombreParaGroq = paraGroq === extension ? nombre : `${nombre.slice(0, -extension.length)}${paraGroq}`;

  /**
   * `Buffer` de Node no encaja en `BlobPart` (su `ArrayBufferLike` puede ser
   * `SharedArrayBuffer`), así que se copia a un `Uint8Array` con respaldo
   * propio antes de armar el Blob.
   */
  const blob =
    audio instanceof Blob
      ? audio
      : new Blob([Uint8Array.from(audio as Uint8Array)]);

  if (blob.size === 0) return { ok: false, error: "El audio llegó vacío." };
  if (blob.size > MAX_AUDIO_BYTES) {
    return { ok: false, error: `El audio pesa ${Math.round(blob.size / 1024 / 1024)} MB y el tope son 25 MB.` };
  }

  const form = new FormData();
  form.append("file", blob, nombreParaGroq);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "es");
  form.append("prompt", VOCABULARIO);
  // `verbose_json` trae la duración, que sirve para saber qué se consumió.
  form.append("response_format", "verbose_json");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detalle = (await res.text().catch(() => "")).slice(0, 300);
      logger.warn("[transcribir] Groq rechazó el audio", { status: res.status, detalle });
      // Un 429 acá es el mismo límite por minuto que el del chat: se dice.
      if (res.status === 429) {
        return { ok: false, error: "El proveedor cortó por límite de uso. Probá de nuevo en un minuto." };
      }
      return { ok: false, error: `No se pudo transcribir (HTTP ${res.status}).` };
    }

    const data = (await res.json()) as { text?: string; duration?: number };
    const texto = (data.text ?? "").trim();
    if (!texto) {
      return { ok: false, error: "El audio no trae voz reconocible. ¿Se grabó con el micrófono tapado?" };
    }

    logger.info("[transcribir] audio transcrito", {
      bytes: blob.size,
      segundos: data.duration,
      caracteres: texto.length,
    });
    return { ok: true, transcripcion: { texto, duracion: data.duration } };
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    logger.error("[transcribir] falló", { error: mensaje });
    return {
      ok: false,
      error: mensaje.includes("timeout") || mensaje.includes("abort")
        ? "El audio tardó demasiado en transcribirse. Probá con uno más corto."
        : "No se pudo transcribir el audio.",
    };
  }
}
