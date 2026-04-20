/**
 * lib/telemetry/spans.ts
 *
 * Thin wrapper around @opentelemetry/api that gracefully degrades to a stub
 * when OTel is unavailable (dev, test) or OTEL_DISABLED=1.
 *
 * Design invariants:
 *  - Never throws from telemetry itself — errors propagate from `fn` only.
 *  - Works with the active tracer registered by instrumentation.ts (no coupling).
 *  - Zero imports from Prisma or Next.js — pure OTel API.
 */

import { trace, SpanStatusCode, type Tracer, type Span } from "@opentelemetry/api";

// ─────────────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────────────

/** Subset of Span exposed to callers — hides the full OTel Span surface. */
export interface SpanApi {
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
  setStatus(status: "ok" | "error", message?: string): void;
}

export interface WithSpanOptions {
  attributes?: Record<string, string | number | boolean>;
  /** Name of the service/tracer. Defaults to "bodega-san-martin". */
  tracerName?: string;
}

/**
 * Runs `fn` inside an OTel span named `name`.
 *
 * Usage:
 * ```ts
 * const result = await withSpan("orders.create", async (span) => {
 *   span.setAttribute(ATTR.TENANT_ID, tenantId);
 *   return ordersDB.create(tenantId, data);
 * }, { attributes: { [ATTR.ORDER_ID]: orderId } });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: SpanApi) => Promise<T>,
  opts?: WithSpanOptions,
): Promise<T> {
  if (isOtelDisabled()) {
    return fn(stubSpan());
  }

  const tracer = getTracer(opts?.tracerName);
  const span = tracer.startSpan(name);

  // Apply initial attributes from options
  if (opts?.attributes) {
    for (const [key, value] of Object.entries(opts.attributes)) {
      span.setAttribute(key, value);
    }
  }

  const api = toSpanApi(span);

  try {
    const result = await fn(api);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message });
    throw err;
  } finally {
    span.end();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function isOtelDisabled(): boolean {
  return process.env.OTEL_DISABLED === "1";
}

function getTracer(name = "bodega-san-martin"): Tracer {
  return trace.getTracer(name);
}

/** Adapts the full OTel Span to the leaner SpanApi surface. */
function toSpanApi(span: Span): SpanApi {
  return {
    setAttribute(key, value) {
      span.setAttribute(key, value);
    },
    addEvent(name, attributes) {
      span.addEvent(name, attributes);
    },
    setStatus(status, message) {
      span.setStatus({
        code: status === "ok" ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        message,
      });
    },
  };
}

/** No-op span used when OTel is disabled or unavailable. */
function stubSpan(): SpanApi {
  return {
    setAttribute() {},
    addEvent() {},
    setStatus() {},
  };
}
