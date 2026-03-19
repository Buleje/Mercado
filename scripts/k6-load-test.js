/**
 * k6 Load Test — Bodega San Martín
 *
 * Tests the two highest-traffic API endpoints:
 *   1. GET /api/products  — Product catalog (read-heavy)
 *   2. POST /api/orders   — Order creation (write path)
 *
 * Usage:
 *   k6 run scripts/k6-load-test.js
 *   BASE_URL=https://staging.bodegasanmartin.pe k6 run scripts/k6-load-test.js
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 *
 * Stages:
 *   1. Ramp up   — 0 → 20 VUs over 30 s
 *   2. Sustain   — 20 VUs for 1 min (normal traffic)
 *   3. Spike     — 20 → 50 VUs over 10 s (burst traffic)
 *   4. Recovery  — 50 → 0 VUs over 30 s
 *
 * Thresholds (SLOs):
 *   - p95 response time < 500 ms for GET /products
 *   - p95 response time < 1000 ms for POST /orders
 *   - Error rate < 1%
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Config ─────────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// ── Custom metrics ─────────────────────────────────────────────────────────────

const errorRate = new Rate("error_rate");
const productsLatency = new Trend("products_latency", true);
const ordersLatency = new Trend("orders_latency", true);

// ── Test options ───────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: "30s", target: 20 },   // ramp up
    { duration: "1m",  target: 20 },   // sustain
    { duration: "10s", target: 50 },   // spike
    { duration: "30s", target: 0 },    // ramp down
  ],
  thresholds: {
    products_latency: ["p(95)<500"],   // 95th percentile < 500 ms
    orders_latency:   ["p(95)<1000"],  // 95th percentile < 1 s
    error_rate:        ["rate<0.01"],  // < 1% errors
    http_req_duration: ["p(99)<2000"], // hard cap: 99th percentile < 2 s
  },
};

// ── Scenario helpers ───────────────────────────────────────────────────────────

function testGetProducts() {
  const res = http.get(`${BASE_URL}/api/products`, {
    headers: { "Accept": "application/json" },
    tags: { name: "GET /api/products" },
  });

  const ok = check(res, {
    "products: status 200": (r) => r.status === 200,
    "products: has data":   (r) => r.body && r.body.length > 10,
  });

  productsLatency.add(res.timings.duration);
  errorRate.add(!ok);
}

function testPostOrder() {
  const payload = JSON.stringify({
    customer: {
      name:      "k6 Test User",
      phone:     "900000001",
      location:  "Av. Test 123, Pucallpa",
      reference: "Referencia de prueba",
    },
    items: [
      { productId: 1, name: "Producto de prueba", price: 5.00, quantity: 2, unit: "unidad", image: "" },
    ],
    paymentMethod: "efectivo",
    total:         10.00,
    // Use a unique idempotency key so each VU iteration doesn't conflict
    idempotencyKey: `k6-${__VU}-${__ITER}-${Date.now()}`,
  });

  const res = http.post(`${BASE_URL}/api/orders`, payload, {
    headers: { "Content-Type": "application/json" },
    tags: { name: "POST /api/orders" },
  });

  const ok = check(res, {
    // 200 (success) or 429 (rate limited) or 409 (duplicate key) are all
    // expected during high-concurrency tests — 5xx is the real error.
    "orders: not 5xx": (r) => r.status < 500,
    "orders: not 4xx except 409/429": (r) =>
      r.status < 400 || r.status === 409 || r.status === 429,
  });

  ordersLatency.add(res.timings.duration);
  errorRate.add(res.status >= 500);
}

// ── Main scenario ──────────────────────────────────────────────────────────────

export default function () {
  // 80% of traffic is read (catalog browsing), 20% is write (order creation)
  const rand = Math.random();
  if (rand < 0.80) {
    testGetProducts();
  } else {
    testPostOrder();
  }

  // Think time: 0.5 – 2 s between requests (simulate real users)
  sleep(0.5 + Math.random() * 1.5);
}

// ── Setup: verify the server is reachable before the test ─────────────────────

export function setup() {
  const res = http.get(`${BASE_URL}/api/products`);
  if (res.status !== 200) {
    throw new Error(`Server not reachable at ${BASE_URL} (HTTP ${res.status})`);
  }
  console.log(`✓ Server reachable at ${BASE_URL}`);
}
