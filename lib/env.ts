/**
 * Server-side Environment Variable Validation
 *
 * Call `validateEnv()` once at startup (e.g. in lib/prisma.ts or instrumentation.ts).
 * It checks all required variables are present and throws a detailed error if any
 * are missing, so you get a clear error message at deploy time instead of a
 * cryptic failure deep inside a request handler.
 *
 * Usage (in instrumentation.ts):
 *   import { validateEnv } from "@/lib/env";
 *   export async function register() { validateEnv(); }
 */

import { logger } from "@/lib/logger";

interface EnvSpec {
  key: string;
  description: string;
  /** Whether this variable is only required in production. Default: true */
  productionOnly?: boolean;
}

const REQUIRED: EnvSpec[] = [
  // ── Core ──────────────────────────────────────────────────────────────────
  {
    key: "DATABASE_URL",
    description: "PostgreSQL connection string (Supabase transaction pooler, port 6543, pgbouncer=true)",
  },
  {
    key: "DIRECT_URL",
    description: "PostgreSQL direct connection (port 5432) — required for `prisma migrate deploy`",
    productionOnly: true,
  },
  {
    key: "AUTH_SECRET",
    description: "32+ byte secret used to sign admin session tokens",
    productionOnly: true,
  },
  // ── Supabase Storage ──────────────────────────────────────────────────────
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    description: "Supabase project URL (used for file storage and auth)",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    description: "Supabase anon/public key",
  },
  // ── Stripe ────────────────────────────────────────────────────────────────
  {
    key: "STRIPE_SECRET_KEY",
    description: "Stripe secret key (sk_live_* or sk_test_*)",
    productionOnly: true,
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    description: "Stripe webhook signing secret (whsec_*) — required for billing",
    productionOnly: true,
  },
  // ── Cron security ─────────────────────────────────────────────────────────
  {
    key: "CRON_SECRET",
    description: "Bearer token that Vercel Cron sends with scheduled job requests",
    productionOnly: true,
  },
];

// ── Optional variables (documented for discoverability, not validated) ────────
//
// Google OAuth 2.0 (customer login):
//   GOOGLE_CLIENT_ID       — OAuth client ID from Google Cloud Console
//   GOOGLE_CLIENT_SECRET   — OAuth client secret from Google Cloud Console
//   Enable via feature flag: FEATURE_OAUTH_GOOGLE=true
//
// Redis:
//   REDIS_URL              — Redis connection URL for distributed cache
//
// Upstash Redis (distributed rate limiting — ADR-022):
//   UPSTASH_REDIS_REST_URL    — REST endpoint from Upstash console
//   UPSTASH_REDIS_REST_TOKEN  — REST token from Upstash console
//   If BOTH are missing, lib/rate-limit.ts falls back to per-instance in-memory
//   rate limiting. In production this is checked by `validateEnv()` below and
//   logged as a warning (NOT a throw) so existing deploys keep working.
//
// Email (SMTP):
//   SMTP_USER, SMTP_PASS   — Nodemailer credentials
//
// Push notifications:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//
// WhatsApp:
//   WHATSAPP_API_URL, WHATSAPP_API_TOKEN
//   NOTIFY_PHONE / WHATSAPP_OWNER_PHONE — fallback owner phone for single-tenant mode
//   DAILY_DIGEST_WA_ENABLED — feature flag (default: enabled). Set to "false"
//                             to skip WhatsApp delivery of the daily digest
//                             while keeping the email path intact (Roadmap #5
//                             gradual rollout).
//
// Analytics:
//   NEXT_PUBLIC_GA_MEASUREMENT_ID — Google Analytics 4
//
// Churn engine (ver app/api/cron/churn-score/route.ts):
//   CHURN_AUTORUN          — "true" para ejecutar playbooks automáticamente en
//                            el cron /api/cron/churn-score. Cualquier otro
//                            valor (o vacío) mantiene el motor en dry-run
//                            (calcula y persiste scores + signals pero NO
//                            dispara emails/WhatsApp/descuentos). Default:
//                            dry-run (safe-by-default).
//
// LLM providers (ver lib/llm-router.ts y ADR-010):
//   GROQ_API_KEY           — Groq (primario) — ya usado por lib/ai-assistant
//   ANTHROPIC_API_KEY      — Claude (premium tier + fallback) — pendiente de
//                            implementación en lib/llm-providers/anthropic.ts,
//                            el router stub permite que el tier 'premium'
//                            degrade a Groq hasta que exista la key y el SDK

// ── Validation logic ──────────────────────────────────────────────────────────

let validated = false;

export function validateEnv(): void {
  // Only run once per process lifetime
  if (validated) return;
  validated = true;

  const isProd = process.env.NODE_ENV === "production";
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const spec of REQUIRED) {
    const value = process.env[spec.key];
    const isRequired = !spec.productionOnly || isProd;

    if (isRequired && (!value || value.trim() === "")) {
      missing.push(`  ❌  ${spec.key} — ${spec.description}`);
    } else if (!value && spec.productionOnly && !isProd) {
      warnings.push(`  ⚠️   ${spec.key} — ${spec.description} (only required in production)`);
    }
  }

  if (warnings.length > 0) {
    logger.warn("[env] Optional env vars not set (OK for dev)", { warnings });
  }

  // Soft-check for Upstash Redis rate-limiting (ADR-022). In production,
  // missing env vars mean distributed rate limiting is disabled — we log
  // a warning but do NOT throw, so existing deploys on Vercel continue to
  // boot while the human toggles the Upstash integration.
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (isProd && (!upstashUrl || !upstashToken)) {
    logger.warn(
      "[env] Upstash Redis REST env vars missing — rate limiting will fall " +
        "back to per-instance in-memory (not distributed across Vercel " +
        "replicas). Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to " +
        "close this gap. See docs/adr/022-upstash-rate-limit-distribuido.md.",
    );
  }

  if (missing.length > 0) {
    // SOFT-FAIL en producción en lugar de THROW: la app arranca y los
    // endpoints específicos que necesitan estas vars fallan cuando se llaman.
    //
    // Antes: throw → crashea TODOS los endpoints (incluso /superadmin/login
    //                que no necesita las vars que están missing)
    // Ahora: error log estructurado → permite que páginas estáticas rendericen.
    //
    // Esto evita "todo el sitio en HTTP 500" cuando falta una env var
    // específica (p. ej. STRIPE_SECRET_KEY que solo necesita /api/billing).
    const errorMessage =
      "\n\n🚨 Missing required environment variables (app puede arrancar pero algunos endpoints fallarán):\n\n" +
      missing.join("\n") +
      "\n\nSet these in your .env.local file (dev) or Vercel project settings (prod).\n";

    if (isProd) {
      logger.error("[env] CRITICAL: missing required env vars in production", {
        missing: missing.map((m) => m.replace(/^.+❌\s+/, "").split(" — ")[0]),
        message: errorMessage,
      });
    } else {
      // En dev seguimos throw para que el dev se entere de inmediato
      throw new Error(errorMessage);
    }
  }
}

/** Typed accessor — throws if the value is absent. */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is required but not set.`);
  }
  return value;
}
