#!/usr/bin/env node
/**
 * scripts/check-prod-health.mjs
 *
 * Probes the critical production endpoints. If any return 5xx (or fail to
 * resolve), it reports to Sentry as an `alertEndpointDown` (P1) event so
 * Brandon's notification rules trigger.
 *
 * Usage (local sanity):
 *   node scripts/check-prod-health.mjs
 *   BASE_URL=https://buleje.pe node scripts/check-prod-health.mjs
 *
 * Vercel Cron (recommended every 2-5 minutes):
 *   { "path": "/api/cron/health-probe", "schedule": "every 2 minutes" }
 *   …and have that route shell out to this script's logic, OR run this script
 *   from a Vercel Cron Job using `npx tsx`.
 *
 * Exit codes:
 *   0 — all endpoints healthy
 *   1 — one or more endpoints returned non-2xx / failed
 *   2 — script-level error (network total failure, etc.)
 */

import process from "node:process";

const BASE_URL =
  process.env.BASE_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://buleje.pe";

const TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS ?? 10_000);
const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const NODE_ENV = process.env.NODE_ENV ?? "development";

// ---------------------------------------------------------------------------
// Endpoints to probe
// ---------------------------------------------------------------------------

/** @type {{ path: string; expect?: number; allow503?: boolean }[]} */
const ENDPOINTS = [
  { path: "/api/health", expect: 200, allow503: true }, // 503 == known degraded
  { path: "/api/marketplace/catalog" },
  { path: "/api/admin/delivery/kpis", expect: 401 }, // 401 = auth wall is up (good)
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} url
 * @param {number} timeoutMs
 */
async function probe(url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        "user-agent": "buleje-health-probe/1.0",
        accept: "application/json",
      },
    });
    return { ok: true, status: res.status, ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lazy-loaded Sentry — we don't want to require the dep when running in CI
 * or against staging without a DSN.
 *
 * @returns {Promise<null | typeof import("@sentry/node")>}
 */
async function loadSentry() {
  if (!SENTRY_DSN) return null;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: NODE_ENV,
      tracesSampleRate: 0,
      enabled: NODE_ENV === "production",
    });
    return Sentry;
  } catch {
    // @sentry/node is optional in this script — if not installed, fall back
    // to the @sentry/nextjs server module, otherwise just log to stderr.
    try {
      const Sentry = await import("@sentry/nextjs");
      return /** @type {any} */ (Sentry);
    } catch {
      return null;
    }
  }
}

/**
 * @param {Awaited<ReturnType<typeof loadSentry>>} Sentry
 * @param {string} endpoint
 * @param {number} status
 * @param {string} [errorMsg]
 */
function reportToSentry(Sentry, endpoint, status, errorMsg) {
  if (!Sentry) return;
  const message = `[health-probe] ${endpoint} responded ${status || "no-response"}`;
  Sentry.captureMessage(message, {
    level: "error",
    tags: {
      severity: "critical",
      domain: "infra",
      alert_route: "p1",
      endpoint,
    },
    extra: { endpoint, status, errorMsg, baseUrl: BASE_URL },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  // eslint-disable-next-line no-console
  console.log(`[health-probe] Probing ${BASE_URL} …`);
  const Sentry = await loadSentry();

  /** @type {Array<{ path: string; status: number; ms: number; ok: boolean; reason?: string }>} */
  const results = [];

  for (const ep of ENDPOINTS) {
    const url = `${BASE_URL}${ep.path}`;
    const r = await probe(url, TIMEOUT_MS);
    const expected = ep.expect ?? 200;
    const allow503 = ep.allow503 === true && r.status === 503;
    const networkFailed = !r.ok;
    const statusOk = r.status === expected || allow503;

    if (networkFailed || (!statusOk && r.status >= 500)) {
      const reason = networkFailed
        ? `network failure: ${r.error ?? "unknown"}`
        : `expected ${expected}, got ${r.status}`;
      results.push({ path: ep.path, status: r.status, ms: r.ms, ok: false, reason });
      reportToSentry(Sentry, ep.path, r.status, reason);
    } else {
      results.push({ path: ep.path, status: r.status, ms: r.ms, ok: true });
    }
  }

  // Pretty print
  const padPath = Math.max(...results.map((r) => r.path.length));
  for (const r of results) {
    const flag = r.ok ? "OK " : "FAIL";
    // eslint-disable-next-line no-console
    console.log(
      `  [${flag}] ${r.path.padEnd(padPath)}  ${String(r.status).padStart(3)}  ${r.ms}ms${
        r.reason ? `  — ${r.reason}` : ""
      }`,
    );
  }

  if (Sentry && typeof Sentry.flush === "function") {
    await Sentry.flush(2000).catch(() => {});
  }

  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[health-probe] ${failures.length}/${results.length} endpoint(s) failed`,
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`[health-probe] All ${results.length} endpoints healthy.`);
  process.exit(0);
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[health-probe] Script-level error:", err);
  process.exit(2);
});
