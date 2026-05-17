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
  {
    key: "STRIPE_STARTER_PRICE_ID",
    description: "Stripe Price ID para el plan Starter (price_*) — S/49.00/mes",
    productionOnly: true,
  },
  {
    key: "STRIPE_PRO_PRICE_ID",
    description: "Stripe Price ID para el plan Pro (price_*) — S/149.00/mes",
    productionOnly: true,
  },
  {
    // Audit 2026-05-17 08-P1-3: agregado tras introducir plan Business
    // (S/349/mes) en sesión 2026-05-11. Antes no se validaba en startup,
    // un deploy sin la var permitía checkout fallar silencioso en runtime.
    key: "STRIPE_BUSINESS_PRICE_ID",
    description: "Stripe Price ID para el plan Business (price_*) — S/349.00/mes",
    productionOnly: true,
  },
  {
    // Audit 2026-05-17 04-P1-W4: si WHATSAPP_APP_SECRET falta en runtime,
    // el webhook acepta cualquier POST (sin firma válida no rechaza). Hard
    // fail en prod fuerza configurar HMAC secret de Meta antes de exponer
    // el endpoint público.
    key: "WHATSAPP_APP_SECRET",
    description: "HMAC secret de la app de Meta — valida X-Hub-Signature-256 en /api/whatsapp/webhook",
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
// Twilio SMS (OTP login):
//   TWILIO_ACCOUNT_SID     — Account SID del dashboard Twilio (AC...)
//   TWILIO_AUTH_TOKEN      — Auth Token del dashboard Twilio (rotar si se filtra)
//   TWILIO_PHONE_NUMBER    — Número Twilio con SMS capability, formato E.164 (+1...)
//   Si las 3 están presentes, `/api/auth/otp/send` envía SMS real.
//   Si faltan en dev, el endpoint cae a log en consola (safe fallback).
//   En prod sin estas vars, el endpoint retorna 503.
//
// WhatsApp:
//   WHATSAPP_API_URL, WHATSAPP_API_TOKEN
//   NOTIFY_PHONE / WHATSAPP_OWNER_PHONE — fallback owner phone for single-tenant mode
//   DAILY_DIGEST_WA_ENABLED — feature flag (default: enabled). Set to "false"
//                             to skip WhatsApp delivery of the daily digest
//                             while keeping the email path intact (Roadmap #5
//                             gradual rollout).
//
// Webhooks internos:
//   INTERNAL_WEBHOOK_SECRET — HMAC-SHA256 secret para webhooks internos (whatsapp/voice, etc.)
//                             Si no se define, fallback a CRON_SECRET con WARNING en log.
//                             Genera con: openssl rand -hex 32
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

  // ── LLM provider keys (sanity check) ────────────────────────────────────
  // 2026-04-28: detectar API keys placeholder (muy cortas) — son la causa
  // de respuestas vacías silenciosas en /api/ai-assistant.
  // Real Groq key ~56 chars. Anthropic ~108. xAI ~84.
  const llmKeyChecks = [
    { key: "GROQ_API_KEY", minLen: 30 },
    { key: "ANTHROPIC_API_KEY", minLen: 30 },
    { key: "XAI_API_KEY", minLen: 30 },
    { key: "AI_GATEWAY_API_KEY", minLen: 30 },
  ];
  const presentLlmKeys = llmKeyChecks.filter((c) => {
    const v = process.env[c.key];
    return v && v.trim().length > 0;
  });
  const validLlmKeys = presentLlmKeys.filter((c) => (process.env[c.key]?.length ?? 0) >= c.minLen);
  const placeholderLlmKeys = presentLlmKeys.filter((c) => (process.env[c.key]?.length ?? 0) < c.minLen);
  if (placeholderLlmKeys.length > 0) {
    logger.warn(
      "[env] LLM API keys parecen placeholders (longitud sospechosa) — el chat IA devolverá respuesta vacía",
      { keys: placeholderLlmKeys.map((c) => `${c.key} (${process.env[c.key]?.length} chars, esperado ≥${c.minLen})`) },
    );
  }
  if (validLlmKeys.length === 0) {
    logger.warn(
      "[env] Ningún LLM provider configurado (GROQ/ANTHROPIC/XAI/AI_GATEWAY) — chat IA y features IA estarán inactivas",
    );
  }

  // Upstash Redis rate-limiting (ADR-022). In production we now HARD-FAIL when
  // the REST vars are missing, unless the operator opts into the in-memory
  // fallback by setting ALLOW_IN_MEMORY_RATELIMIT=true. Keeping the fallback
  // silent in prod masks DDoS protection gaps across Vercel replicas.
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const allowInMemory = process.env.ALLOW_IN_MEMORY_RATELIMIT === "true";
  if (isProd && (!upstashUrl || !upstashToken)) {
    if (allowInMemory) {
      logger.warn(
        "[env] Upstash Redis REST env vars missing — rate limiting will fall " +
          "back to per-instance in-memory. ALLOW_IN_MEMORY_RATELIMIT=true is " +
          "set, so boot continues. Distributed rate limiting DISABLED.",
      );
    } else {
      missing.push(
        "  ❌  UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — " +
          "Distributed rate limiting (set ALLOW_IN_MEMORY_RATELIMIT=true " +
          "to explicitly opt into the in-memory fallback, ADR-022)",
      );
    }
  }

  // Admin bypass login must NEVER be enabled in production via env var.
  if (isProd && process.env.ALLOW_ADMIN_BYPASS_LOGIN === "true") {
    missing.push(
      "  ❌  ALLOW_ADMIN_BYPASS_LOGIN=true is set in production — refuse to boot. " +
        "This flag grants passwordless admin access and is DEV-ONLY. Unset it or remove from Vercel env.",
    );
  }

  // ── HARD-FAIL: vars que rompen la seguridad si faltan ──────────────────
  // AUTH_SECRET firma JWTs. Si falta en prod, los tokens se firman con
  // string vacía y CUALQUIERA puede emitir tokens válidos. Hard-fail siempre.
  // DATABASE_URL/DIRECT_URL: sin DB no hay app. Hard-fail siempre.
  const HARD_FAIL_VARS = ["AUTH_SECRET", "DATABASE_URL", "DIRECT_URL"];
  const hardFailMissing = HARD_FAIL_VARS.filter((v) => !process.env[v]);
  if (hardFailMissing.length > 0) {
    throw new Error(
      `\n🚨 CRITICAL — required security env vars are missing: ${hardFailMissing.join(", ")}.\n` +
      "These cannot soft-fail because they would expose the app to JWT forgery or DB-less crashes.\n" +
      "Set them in .env.local (dev) or Vercel project settings (prod) before booting.\n",
    );
  }

  if (missing.length > 0) {
    // SOFT-FAIL en producción para vars NO críticas (Stripe, MP, Resend…):
    // la app arranca y solo los endpoints que usan esas vars fallan.
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
