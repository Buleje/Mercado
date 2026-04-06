/**
 * k6 Load Test — SuperAdmin APIs
 *
 * Usage:
 *   k6 run k6/superadmin.js --env BASE_URL=http://localhost:3000 --env SA_COOKIE="sa_session=xxx"
 *
 * Environment variables:
 *   BASE_URL    — The target host (default: http://localhost:3000)
 *   SA_COOKIE   — SuperAdmin session cookie value (e.g. "sa_session=<token>")
 *
 * Stages:
 *   1. Ramp up to 10 VUs over 30s
 *   2. Steady 10 VUs for 1m
 *   3. Spike to 30 VUs for 30s
 *   4. Ramp down over 15s
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Custom metrics
const errorRate = new Rate("errors");
const analyticsLatency = new Trend("analytics_latency", true);
const activityLatency = new Trend("activity_latency", true);
const tenantsLatency = new Trend("tenants_latency", true);

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "1m",  target: 10 },
    { duration: "30s", target: 30 },
    { duration: "15s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<3000"],   // 95% of requests < 3s
    errors: ["rate<0.1"],                 // error rate < 10%
    analytics_latency: ["p(95)<2000"],
    activity_latency: ["p(95)<2000"],
    tenants_latency: ["p(95)<2000"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const HEADERS = {
  "Content-Type": "application/json",
  Cookie: __ENV.SA_COOKIE || "sa_session=test-token",
};

// eslint-disable-next-line import/no-anonymous-default-export -- k6 requires anonymous default export
export default function () {
  // 1. GET /api/superadmin/analytics
  {
    const res = http.get(`${BASE_URL}/api/superadmin/analytics`, { headers: HEADERS, tags: { name: "analytics" } });
    analyticsLatency.add(res.timings.duration);
    const ok = check(res, {
      "analytics status 200 or 429": (r) => r.status === 200 || r.status === 429,
    });
    errorRate.add(!ok);
  }

  sleep(0.5);

  // 2. GET /api/superadmin/activity?page=1&limit=30
  {
    const res = http.get(`${BASE_URL}/api/superadmin/activity?page=1&limit=30`, { headers: HEADERS, tags: { name: "activity" } });
    activityLatency.add(res.timings.duration);
    const ok = check(res, {
      "activity status 200 or 429": (r) => r.status === 200 || r.status === 429,
    });
    errorRate.add(!ok);
  }

  sleep(0.5);

  // 3. GET /api/superadmin/tenants
  {
    const res = http.get(`${BASE_URL}/api/superadmin/tenants`, { headers: HEADERS, tags: { name: "tenants" } });
    tenantsLatency.add(res.timings.duration);
    const ok = check(res, {
      "tenants status 200 or 429": (r) => r.status === 200 || r.status === 429,
    });
    errorRate.add(!ok);
  }

  sleep(1);

  // 4. GET /api/superadmin/activity with filters
  {
    const res = http.get(`${BASE_URL}/api/superadmin/activity?action=create&page=1&limit=10`, { headers: HEADERS, tags: { name: "activity-filtered" } });
    activityLatency.add(res.timings.duration);
    const ok = check(res, {
      "activity filtered status 200 or 429": (r) => r.status === 200 || r.status === 429,
    });
    errorRate.add(!ok);
  }

  sleep(0.5);
}
