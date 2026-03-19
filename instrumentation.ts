/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Runs once when the Next.js server boots (both Node.js and Edge runtime).
 * Used here to validate required environment variables early so that any
 * misconfiguration fails loudly at startup instead of at request time.
 */
export async function register() {
  // Only validate on the Node.js runtime (edge workers have a subset of env vars)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
