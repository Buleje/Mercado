import "server-only";

/**
 * lib/twilio.ts — Thin wrapper sobre el SDK de Twilio para enviar SMS.
 *
 * Uso:
 *   import { sendSms, isTwilioConfigured } from "@/lib/twilio";
 *   await sendSms({ to: "+51912345678", body: "Tu código: 123456" });
 *
 * Si Twilio no está configurado (env vars ausentes), `sendSms` retorna
 * `{ ok: false, reason: "not-configured" }` y el caller decide fallback
 * (en dev: log a consola, en prod: error al usuario).
 */

import { logger } from "@/lib/logger";

// Import dinámico para no cargar el SDK en clientes donde no se use
// (y evitar `require` top-level del paquete twilio en bundles edge).
type TwilioClient = ReturnType<typeof import("twilio")>;

let cachedClient: TwilioClient | null = null;

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER,
  );
}

async function getClient(): Promise<TwilioClient> {
  if (cachedClient) return cachedClient;
  const twilio = (await import("twilio")).default;
  cachedClient = twilio(
    process.env.TWILIO_ACCOUNT_SID as string,
    process.env.TWILIO_AUTH_TOKEN as string,
  );
  return cachedClient;
}

export type SendSmsResult =
  | { ok: true; sid: string }
  | { ok: false; reason: "not-configured" | "twilio-error"; error?: string };

export interface SendSmsInput {
  /** Número destino en formato E.164 (ej: +51912345678). */
  to: string;
  /** Texto del mensaje (máx 1600 chars, pero <=160 recomendado para 1 SMS). */
  body: string;
}

export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  if (!isTwilioConfigured()) {
    return { ok: false, reason: "not-configured" };
  }

  try {
    const client = await getClient();
    const msg = await client.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER as string,
      to,
      body,
    });
    logger.info("[twilio] SMS enviado", { sid: msg.sid, to });
    return { ok: true, sid: msg.sid };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error("[twilio] Error enviando SMS", { error, to });
    return { ok: false, reason: "twilio-error", error };
  }
}
