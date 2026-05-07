import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, getClientIp , applyRateLimit } from "@/lib/rate-limit";
import { storeOtp } from "@/lib/auth/otp-store";
import { logger } from "@/lib/logger";
import { sendSms, isTwilioConfigured } from "@/lib/twilio";

// Esquema: acepta 9 digitos peruanos (con o sin prefijo +51 / 51)
const SendOtpSchema = z.object({
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, "")) // elimina todo lo que no sea digito
    .refine(
      (v) => {
        // Acepta: "9XXXXXXXX" (9 digitos) o "519XXXXXXXX" (11 digitos con cod. pais)
        if (v.length === 9) return /^9\d{8}$/.test(v);
        if (v.length === 11) return /^519\d{8}$/.test(v);
        return false;
      },
      { message: "Numero de telefono invalido. Debe ser un celular peruano de 9 digitos." },
    )
    .transform((v) => (v.length === 11 ? v.slice(2) : v)), // normaliza a 9 digitos
});

// Rate limit: 3 envios por telefono por ventana de 5 min
const OTP_SEND_MAX = 3;
const OTP_SEND_WINDOW_SEC = 5 * 60;

/**
 * POST /api/auth/otp/send
 * Body: { phone: string }
 *
 * Genera y almacena un OTP de 6 digitos para el numero enviado.
 * En produccion, aqui se integraria WhatsApp/SMS. Por ahora se
 * registra en logs de desarrollo.
 */
export async function POST(req: Request) {
  const _rl = await applyRateLimit(req, "STRICT", "auth-otp-send"); if (_rl) return _rl;
  // 1. Validacion
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de solicitud invalido" },
      { status: 400 },
    );
  }

  const parsed = SendOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { phone } = parsed.data;

  // 2. Rate limit DOBLE (audit auth #12): por phone + por IP.
  //    - phone: límite natural por usuario.
  //    - IP: anti-enumeration + anti-spam Twilio. Atacante puede pedir OTPs
  //      para 1000 phones distintos sin esto, agotando créditos SMS y
  //      spameando víctimas.
  const ip = getClientIp(req);
  const rl = rateLimit(
    `otp:send:${phone}`,
    OTP_SEND_MAX,
    OTP_SEND_WINDOW_SEC,
  );
  if (!rl.allowed) {
    logger.warn("[OTP/send] Rate limit por phone excedido", { phone, ip });
    return NextResponse.json(
      {
        error: "Demasiados intentos. Espera 5 minutos antes de solicitar otro codigo.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString(),
        },
      },
    );
  }
  const ipRl = rateLimit(`otp:send:ip:${ip}`, 5, 3600);
  if (!ipRl.allowed) {
    logger.warn("[OTP/send] Rate limit por IP excedido (anti-enumeration)", { ip });
    return NextResponse.json(
      { error: "Demasiados intentos desde esta red. Espera 1 hora." },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil((ipRl.resetAt - Date.now()) / 1000).toString(),
        },
      },
    );
  }

  // 3. Generar codigo de 6 digitos con crypto nativo (sin dependencias externas)
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = String(array[0] % 1_000_000).padStart(6, "0");

  // 4. Almacenar OTP (TTL 5 min, single-use)
  storeOtp(phone, code);

  // 5. Envio — Twilio SMS (prod y dev si hay credenciales).
  //    Si Twilio NO está configurado, fallback a log en consola (solo dev).
  const isDev = process.env.NODE_ENV !== "production";

  if (isTwilioConfigured()) {
    const smsBody = `Tu codigo Buleje: ${code}. Expira en 5 min. No lo compartas.`;
    const result = await sendSms({
      to: `+51${phone}`,
      body: smsBody,
    });

    if (!result.ok) {
      logger.error("[OTP/send] Twilio falló", { phone, reason: result.reason, error: result.error });
      // En dev seguimos devolviendo ok y logueamos el código para que el user
      // pueda seguir probando sin SMS. En prod retornamos 502.
      if (isDev) {
        console.info(`\n  OTP DEV (twilio falló) ▶  +51 ${phone}  →  ${code}\n`);
        return NextResponse.json({
          ok: true,
          message: "Codigo generado (revisa la consola — SMS falló)",
        });
      }
      return NextResponse.json(
        { error: "No pudimos enviar el SMS. Intenta de nuevo en unos minutos." },
        { status: 502 },
      );
    }

    logger.info("[OTP/send] SMS enviado por Twilio", { phone, sid: result.sid });
    return NextResponse.json({ ok: true, message: "Codigo enviado por SMS" });
  }

  // Fallback: Twilio no configurado. En dev escribimos a consola; en prod error.
  if (isDev) {
    logger.info(`[OTP/send] [DEV] Codigo para +51${phone}: ${code}`, { phone });
    console.info(`\n  OTP DEV ▶  +51 ${phone}  →  ${code}\n`);
    return NextResponse.json({ ok: true, message: "Codigo enviado (modo DEV — revisa consola)" });
  }

  logger.error("[OTP/send] Twilio no configurado en producción", { phone });
  return NextResponse.json(
    { error: "Servicio de SMS no disponible. Contacta soporte." },
    { status: 503 },
  );
}
