/**
 * k6/checkout-load.js
 *
 * Load test del flujo de checkout — anti-fraude + idempotency bajo presión.
 *
 * Escenarios:
 *  - 50 VUs concurrentes durante 2 minutos
 *  - Cada VU: crea carrito → aplica cupón → genera orden con x-idempotency-key
 *  - Mide: p50, p95, p99 latencia + error rate + duplicate orders
 *
 * Uso:
 *   k6 run k6/checkout-load.js
 *   k6 run k6/checkout-load.js -e BASE_URL=https://buleje.pe -e TENANT=main
 *
 * Threshold de fallo:
 *  - p95 latencia /api/orders >2s = fail
 *  - error rate >1% = fail
 *  - duplicate orders >0 = fail (idempotency rota)
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TENANT = __ENV.TENANT || "main";

const duplicateOrders = new Counter("duplicate_orders");
const checkoutLatency = new Trend("checkout_latency", true);

export const options = {
  stages: [
    { duration: "30s", target: 10 }, // ramp up
    { duration: "1m", target: 50 },  // sostenido 50 VUs
    { duration: "30s", target: 0 },  // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"], // <1% error rate
    "http_req_duration{name:checkout}": ["p(95)<2000"], // p95 <2s
    duplicate_orders: ["count==0"], // ZERO duplicates (idempotency)
  },
};

const productIds = [1, 2, 3, 4, 5]; // adjust al seed real

export default function () {
  const vuId = __VU;
  const iter = __ITER;
  const idempotencyKey = `k6-test-${vuId}-${iter}-${Date.now()}`;

  // 1. Crear orden con idempotency key
  const orderPayload = JSON.stringify({
    items: [
      {
        productId: productIds[iter % productIds.length],
        quantity: 1 + (iter % 3),
        price: 5.5,
      },
    ],
    customerName: `LoadTest VU${vuId}`,
    customerPhone: `994${String(vuId).padStart(7, "0")}`,
    paymentMethod: "yape",
    address: "Pucallpa - Test",
    notes: `k6 test iter ${iter}`,
  });

  const headers = {
    "Content-Type": "application/json",
    "x-tenant-id": TENANT,
    "x-idempotency-key": idempotencyKey,
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/orders`, orderPayload, {
    headers,
    tags: { name: "checkout" },
  });
  checkoutLatency.add(Date.now() - start);

  const ok = check(res, {
    "checkout 201 or 200": (r) => [200, 201].includes(r.status),
    "checkout returns orderId": (r) => {
      try { return Boolean(r.json()?.id || r.json()?.orderId); }
      catch { return false; }
    },
  });

  // 2. Segunda llamada con misma idempotency-key — debe retornar el mismo ID
  const res2 = http.post(`${BASE_URL}/api/orders`, orderPayload, {
    headers,
    tags: { name: "checkout_idempotent_retry" },
  });

  check(res2, {
    "retry idempotent — same orderId": (r) => {
      try {
        const id1 = res.json()?.id || res.json()?.orderId;
        const id2 = r.json()?.id || r.json()?.orderId;
        if (id1 && id2 && id1 !== id2) {
          duplicateOrders.add(1);
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    console.error(`VU${vuId} iter${iter} failed: status=${res.status} body=${res.body?.slice(0, 200)}`);
  }

  sleep(1 + Math.random()); // jitter
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    "reports/k6-checkout-summary.json": JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const p50 = m["http_req_duration{name:checkout}"]?.values?.["p(50)"];
  const p95 = m["http_req_duration{name:checkout}"]?.values?.["p(95)"];
  const p99 = m["http_req_duration{name:checkout}"]?.values?.["p(99)"];
  const errors = m.http_req_failed?.values?.rate ?? 0;
  const dupes = m.duplicate_orders?.values?.count ?? 0;
  return `
============================================================
k6 Checkout Load Test — Summary
============================================================
  p50 latency: ${p50?.toFixed(0)}ms
  p95 latency: ${p95?.toFixed(0)}ms  ${p95 > 2000 ? "❌ FAIL" : "✅"}
  p99 latency: ${p99?.toFixed(0)}ms
  Error rate:  ${(errors * 100).toFixed(2)}%  ${errors > 0.01 ? "❌ FAIL" : "✅"}
  Duplicate orders (idempotency): ${dupes}  ${dupes > 0 ? "❌ FAIL" : "✅"}
============================================================
`;
}
