/**
 * lib/captcha-turnstile.ts
 *
 * Verificación server-side de Cloudflare Turnstile (CAPTCHA gratis sin
 * cuenta CF, drop-in replacement de reCAPTCHA).
 *
 * Pentest 2026-05-18 Sprint D #5. Aplicar en endpoints sensibles a
 * credential stuffing:
 *   - POST /api/auth/login (admin)
 *   - POST /api/auth/register (customer)
 *   - POST /api/auth/otp/send (customer phone)
 *
 * Setup (Brandon — pendiente activar):
 *   1. https://dash.cloudflare.com → Turnstile → Add Site → "buleje.pe"
 *   2. Copy Site Key → TURNSTILE_SITE_KEY (NEXT_PUBLIC_)
 *   3. Copy Secret Key → TURNSTILE_SECRET_KEY (server-only)
 *   4. Cliente: incluir <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" />
 *   5. Cliente: <div className="cf-turnstile" data-sitekey="..." />
 *   6. Server: leer body.cfTurnstileToken y llamar verifyTurnstile()
 *
 * Si TURNSTILE_SECRET_KEY no está configurado, verifyTurnstile retorna `true`
 * (bypass dev). En prod, lib/env.ts debería exigir la key — agregar después.
 */

import "server-only";
import { logger } from "@/lib/logger";

const TURNSTILE_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

/**
 * Valida un token de Turnstile contra el endpoint de Cloudflare.
 *
 * @param token Token enviado desde el cliente (campo `cf-turnstile-response`)
 * @param remoteip IP del cliente (opcional pero recomendado — Cloudflare verifica match)
 * @returns true si el token es válido y reciente; false si inválido/expirado
 *
 * Dev mode: si TURNSTILE_SECRET_KEY no está, retorna `true` (no bloquea).
 *           En producción esto NO debe pasar — agregar guard en lib/env.ts.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  remoteip?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("[captcha] TURNSTILE_SECRET_KEY no configurado en prod — fail-open");
    }
    // Dev / tests: passthrough.
    return true;
  }

  if (!token) {
    logger.warn("[captcha] token ausente — rechazado");
    return false;
  }

  try {
    const form = new URLSearchParams();
    form.append("secret", secret);
    form.append("response", token);
    if (remoteip) form.append("remoteip", remoteip);

    const res = await fetch(TURNSTILE_ENDPOINT, {
      method: "POST",
      body: form,
      // Cloudflare responde <100ms en p99; 3s es timeout sano para evitar hangs
      // si CF está caído. En ese caso fail-open (devuelve true) y log error —
      // bloquear login porque CF down sería un DoS auto-inflingido.
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      logger.error("[captcha] Cloudflare verify endpoint error", { status: res.status });
      return true; // fail-open: CF caído no debe bloquear
    }

    const data = (await res.json()) as TurnstileResponse;
    if (!data.success) {
      logger.warn("[captcha] token inválido", { errors: data["error-codes"] });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("[captcha] verify exception — fail-open", { err: String(err) });
    return true; // fail-open por la misma razón
  }
}
