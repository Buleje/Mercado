import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { logger } from "@/lib/logger";


// ─── Definicion de variables ──────────────────────────────────────────────────

interface EnvVarDef {
  name: string;
  critical: boolean;
  hint: string;
}

const ENV_VARS: EnvVarDef[] = [
  // Base de datos
  { name: "DATABASE_URL", critical: true, hint: "Connection string Supabase con pgBouncer (runtime)" },
  { name: "DIRECT_URL", critical: false, hint: "Connection string sin pgBouncer (migraciones)" },
  // Autenticacion
  { name: "AUTH_SECRET", critical: true, hint: "HMAC-SHA256, min 32 chars" },
  // Stripe
  { name: "STRIPE_SECRET_KEY", critical: false, hint: "sk_live_... o sk_test_..." },
  { name: "STRIPE_WEBHOOK_SECRET", critical: true, hint: "whsec_... para verificar webhooks de Stripe" },
  // Mercado Pago
  { name: "MERCADOPAGO_ACCESS_TOKEN", critical: false, hint: "Token de acceso MercadoPago" },
  { name: "MERCADOPAGO_WEBHOOK_SECRET", critical: true, hint: "Secret para verificar webhooks de MercadoPago" },
  // Twilio / WhatsApp
  { name: "TWILIO_ACCOUNT_SID", critical: false, hint: "AC... Account SID de Twilio" },
  { name: "TWILIO_AUTH_TOKEN", critical: true, hint: "Auth token de Twilio para firma de webhooks" },
  { name: "WHATSAPP_VERIFY_TOKEN", critical: false, hint: "Token de verificacion webhook Meta" },
  { name: "WHATSAPP_APP_SECRET", critical: false, hint: "App secret Meta para verificar firma HMAC" },
  // Email
  { name: "RESEND_API_KEY", critical: false, hint: "re_... API key de Resend" },
  // Cache
  { name: "UPSTASH_REDIS_REST_URL", critical: false, hint: "URL REST de Upstash Redis" },
  { name: "UPSTASH_REDIS_REST_TOKEN", critical: false, hint: "Token REST de Upstash Redis" },
  // Monitoreo
  { name: "SENTRY_DSN", critical: false, hint: "DSN de Sentry para error tracking" },
  // Crons
  { name: "CRON_SECRET", critical: false, hint: "Secret para validar requests de cron jobs" },
  // Push notifications
  { name: "VAPID_PUBLIC_KEY", critical: false, hint: "Clave publica VAPID para Web Push" },
  { name: "VAPID_PRIVATE_KEY", critical: false, hint: "Clave privada VAPID para Web Push" },
  // Base URL
  { name: "NEXT_PUBLIC_BASE_URL", critical: false, hint: "URL publica de la aplicacion" },
];

// ─── Route Handler ────────────────────────────────────────────────────────────

/**
 * GET /api/health/secrets
 *
 * Reporta presencia (no valores) de env vars criticas y opcionales.
 * Protegido por sesion de superadmin.
 *
 * Retorna 200 si todas las criticas estan presentes; 503 si falta alguna.
 */
export async function GET(req: NextRequest) {
  try {
    // Verificar sesion de superadmin
    const auth = await requirePlatformAPI(req);
    if (auth instanceof NextResponse) return auth;

    const results = ENV_VARS.map(({ name, critical, hint }) => {
      const value = process.env[name];
      const present = typeof value === "string" && value.length > 0;
      return {
        name,
        critical,
        present,
        length: present ? value!.length : 0,
        hint,
      };
    });

    const missingCritical = results.filter((r) => r.critical && !r.present);
    const healthy = missingCritical.length === 0;

    const summary = {
      status: healthy ? "ok" : "missing_critical",
      totalVars: results.length,
      presentCount: results.filter((r) => r.present).length,
      missingCount: results.filter((r) => !r.present).length,
      missingCritical: missingCritical.map((r) => r.name),
    };

    return NextResponse.json(
      {
        ...summary,
        vars: results,
        checkedAt: new Date().toISOString(),
        checkedBy: auth.username,
      },
      {
        status: healthy ? 200 : 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
