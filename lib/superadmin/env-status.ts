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
  // Auth
  AUTH_SECRET: boolean;
  CRON_SECRET: boolean;
  SUPERADMIN_PASSWORD: boolean;
  // Database
  DATABASE_URL: boolean;
  DIRECT_URL: boolean;
  SUPABASE_URL: boolean;
  SUPABASE_ANON_KEY: boolean;
  // Pagos
  STRIPE_SECRET_KEY: boolean;
  MP_ACCESS_TOKEN: boolean;
  // Comunicación
  RESEND_API_KEY: boolean;
  TWILIO_WHATSAPP: boolean;
  VAPID_PUBLIC: boolean;
  // Observabilidad
  SENTRY_DSN: boolean;
  POSTHOG_KEY: boolean;
  // Cache / RL
  UPSTASH_REDIS: boolean;
}

/**
 * Devuelve la presencia (no el valor) de las env vars críticas de la
 * plataforma. El cliente solo sabe si está configurada o no.
 */
export function getEnvStatus(): EnvStatus {
  return {
    // Auth
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    CRON_SECRET: !!process.env.CRON_SECRET,
    SUPERADMIN_PASSWORD: !!process.env.SUPERADMIN_PASSWORD,
    // Database
    DATABASE_URL: !!process.env.DATABASE_URL,
    DIRECT_URL: !!process.env.DIRECT_URL,
    SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    // Pagos
    STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    MP_ACCESS_TOKEN: !!process.env.MP_ACCESS_TOKEN,
    // Comunicación
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    TWILIO_WHATSAPP: !!process.env.TWILIO_AUTH_TOKEN,
    VAPID_PUBLIC: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    // Observabilidad
    SENTRY_DSN: !!process.env.NEXT_PUBLIC_SENTRY_DSN || !!process.env.SENTRY_DSN,
    POSTHOG_KEY: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
    // Cache / RL
    UPSTASH_REDIS: !!process.env.UPSTASH_REDIS_REST_URL,
  };
}
