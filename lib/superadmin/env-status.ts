/**
 * lib/superadmin/env-status.ts
 *
 * Helper server-only que reporta la PRESENCIA de variables de entorno
 * críticas al panel superadmin — sin exponer nunca el valor real.
 *
 * Regla de seguridad (CLAUDE.md #10): ninguna credencial se envía al cliente.
 * Este helper debe ejecutarse exclusivamente en server components o en API routes
 * protegidas por guardSuperadmin. El tipo `EnvStatus` sólo contiene booleans.
 *
 * @example
 *   // En server component:
 *   import { getEnvStatus } from "@/lib/superadmin/env-status";
 *   const status = getEnvStatus();
 *   return <ControlCenterClient envStatus={status} />;
 */

import "server-only";

export interface EnvStatus {
  AUTH_SECRET: boolean;
  CRON_SECRET: boolean;
  DATABASE_URL: boolean;
  DIRECT_URL: boolean;
  SUPERADMIN_PASSWORD: boolean;
  STRIPE_SECRET_KEY: boolean;
  RESEND_API_KEY: boolean;
  TWILIO_WHATSAPP: boolean;
}

/**
 * Devuelve la presencia (no el valor) de las env vars críticas de la
 * plataforma. El cliente solo sabe si está configurada o no.
 */
export function getEnvStatus(): EnvStatus {
  return {
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    CRON_SECRET: !!process.env.CRON_SECRET,
    DATABASE_URL: !!process.env.DATABASE_URL,
    DIRECT_URL: !!process.env.DIRECT_URL,
    SUPERADMIN_PASSWORD: !!process.env.SUPERADMIN_PASSWORD,
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    TWILIO_WHATSAPP: !!process.env.TWILIO_AUTH_TOKEN,
  };
}
