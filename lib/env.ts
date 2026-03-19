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
    description: "PostgreSQL connection string (Supabase pooler URL)",
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
    console.warn(
      "[env] Optional env vars not set (OK for dev):\n" + warnings.join("\n"),
    );
  }

  if (missing.length > 0) {
    throw new Error(
      "\n\n🚨 Missing required environment variables:\n\n" +
        missing.join("\n") +
        "\n\nSet these in your .env.local file (dev) or Vercel project settings (prod).\n",
    );
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
