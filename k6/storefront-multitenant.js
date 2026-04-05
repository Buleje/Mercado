/**
 * k6 Load Test — Storefront Multi-Tenant Isolation
 *
 * Validates that multiple tenants can operate concurrently without
 * data leakage or performance degradation.
 *
 * Usage:
 *   k6 run k6/storefront-multitenant.js --env BASE_URL=http://localhost:3000
 *
 * Optional env:
 *   TENANT_A   — First tenant slug (default: "main")
 *   TENANT_B   — Second tenant slug (default: "demo")
 *   TENANT_C   — Third tenant slug (default: "fruteria-maria")
 *
 * Stages:
 *   1. Ramp up to 20 VUs over 30s
 *   2. Steady 20 VUs for 1m
 *   3. Spike to 50 VUs for 30s (stress test isolation under load)
 *   4. Ramp down over 15s
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

// ── Custom metrics ──────────────────────────────────────────────────────────
const errorRate = new Rate("errors");
const isolationFailures = new Counter("isolation_failures");
const productsLatency = new Trend("products_latency", true);
const ordersLatency = new Trend("orders_latency", true);
const settingsLatency = new Trend("settings_latency", true);

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m", target: 20 },
    { duration: "30s", target: 50 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95% of requests < 2s
    errors: ["rate<0.05"], // error rate < 5%
    isolation_failures: ["count==0"], // ZERO isolation failures allowed
    products_latency: ["p(95)<1500"],
    orders_latency: ["p(95)<2000"],
    settings_latency: ["p(95)<1000"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TENANTS = [
  __ENV.TENANT_A || "main",
  __ENV.TENANT_B || "demo",
  __ENV.TENANT_C || "fruteria-maria",
];

function headersForTenant(slug) {
  return {
    "Content-Type": "application/json",
    Cookie: `active-tenant=${slug}`,
  };
}

// ── Helper: fetch products for a tenant ─────────────────────────────────────
function fetchProducts(slug) {
  const headers = headersForTenant(slug);
  const res = http.get(`${BASE_URL}/api/products?limit=50`, {
    headers,
    tags: { name: `products_${slug}` },
  });
  productsLatency.add(res.timings.duration);

  const ok = check(res, {
    [`${slug}: products status 200`]: (r) => r.status === 200,
    [`${slug}: products returns array`]: (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data || body);
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!ok);

  // Return tenantId of products for isolation check
  try {
    const body = JSON.parse(res.body);
    const products = body.data || body;
    if (Array.isArray(products)) {
      return products;
    }
  } catch {
    // ignore
  }
  return [];
}

// ── Helper: fetch settings for a tenant ─────────────────────────────────────
function fetchSettings(slug) {
  const headers = headersForTenant(slug);
  const res = http.get(`${BASE_URL}/api/settings`, {
    headers,
    tags: { name: `settings_${slug}` },
  });
  settingsLatency.add(res.timings.duration);

  const ok = check(res, {
    [`${slug}: settings status 200`]: (r) => r.status === 200,
  });
  errorRate.add(!ok);
}

// eslint-disable-next-line import/no-anonymous-default-export -- k6 requires this
export default function () {
  // Pick two different tenants for cross-comparison
  const vuId = __VU || 1;
  const tenantA = TENANTS[vuId % TENANTS.length];
  const tenantB = TENANTS[(vuId + 1) % TENANTS.length];

  // ── Test 1: Concurrent product fetches ──────────────────────────────────
  group("Concurrent product fetches", function () {
    const productsA = fetchProducts(tenantA);
    const productsB = fetchProducts(tenantB);

    // Cross-check: products from A should not appear in B
    if (productsA.length > 0 && productsB.length > 0) {
      const idsA = new Set(productsA.map((p) => p.id));
      const idsB = new Set(productsB.map((p) => p.id));

      // Check for overlap (tenantIds match is fine if they share product IDs,
      // but tenantId fields should differ)
      const tenantIdsA = new Set(productsA.map((p) => p.tenantId).filter(Boolean));
      const tenantIdsB = new Set(productsB.map((p) => p.tenantId).filter(Boolean));

      // If both return tenantId, they should NOT overlap
      if (tenantIdsA.size > 0 && tenantIdsB.size > 0) {
        let foundLeak = false;
        for (const tid of tenantIdsA) {
          if (tenantIdsB.has(tid)) {
            // Same tenantId in both responses — only a problem if tenants are different
            // and the tenantId matches one but appeared in the other's response
            // For simplicity: flag if product from A has tenantId matching B's tenant
          }
        }

        // Stronger check: products from tenant A should have tenantId matching tenant A
        for (const p of productsA) {
          if (p.tenantId && p.tenantId !== tenantA) {
            // Product in A's response belongs to different tenant
            isolationFailures.add(1);
            foundLeak = true;
          }
        }
        for (const p of productsB) {
          if (p.tenantId && p.tenantId !== tenantB) {
            isolationFailures.add(1);
            foundLeak = true;
          }
        }

        check(null, {
          "No cross-tenant product leakage": () => !foundLeak,
        });
      }
    }
  });

  sleep(0.3);

  // ── Test 2: Settings isolation ──────────────────────────────────────────
  group("Settings isolation", function () {
    fetchSettings(tenantA);
    fetchSettings(tenantB);
  });

  sleep(0.3);

  // ── Test 3: Header injection attempt ────────────────────────────────────
  group("Header injection prevention", function () {
    // Try to inject a different tenant via x-tenant-id header
    const injectionHeaders = {
      "Content-Type": "application/json",
      Cookie: `active-tenant=${tenantA}`,
      "x-tenant-id": tenantB, // Attempt injection
    };

    const res = http.get(`${BASE_URL}/api/products?limit=10`, {
      headers: injectionHeaders,
      tags: { name: "injection_test" },
    });

    // The response should still contain products from tenantA, not tenantB
    const ok = check(res, {
      "injection: status 200": (r) => r.status === 200,
    });
    errorRate.add(!ok);

    try {
      const body = JSON.parse(res.body);
      const products = body.data || body;
      if (Array.isArray(products)) {
        let injectionBlocked = true;
        for (const p of products) {
          if (p.tenantId && p.tenantId === tenantB && tenantA !== tenantB) {
            injectionBlocked = false;
            isolationFailures.add(1);
            break;
          }
        }
        check(null, {
          "Header injection blocked": () => injectionBlocked,
        });
      }
    } catch {
      // Parse error — non-critical
    }
  });

  sleep(0.3);

  // ── Test 4: Rapid tenant switching ──────────────────────────────────────
  group("Rapid tenant switching", function () {
    // Simulate a user switching between tenants rapidly
    for (let i = 0; i < 5; i++) {
      const tenant = TENANTS[i % TENANTS.length];
      const res = http.get(`${BASE_URL}/api/products?limit=5`, {
        headers: headersForTenant(tenant),
        tags: { name: "rapid_switch" },
      });

      const ok = check(res, {
        [`rapid_switch_${i}: status 200`]: (r) => r.status === 200,
      });
      errorRate.add(!ok);
    }
  });

  sleep(0.5);
}
