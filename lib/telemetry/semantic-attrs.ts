/**
 * lib/telemetry/semantic-attrs.ts
 *
 * Buleje-specific OTel semantic attribute keys.
 *
 * Convention: "buleje.<domain>.<field>"
 * — keeps attributes namespaced and sortable in Jaeger / Tempo / Honeycomb.
 *
 * Usage:
 * ```ts
 * span.setAttribute(ATTR.TENANT_ID, tenantId);
 * span.setAttribute(ATTR.PAYMENT_PROVIDER, "yape");
 * ```
 */

export const ATTR = {
  // ── Tenant / auth ────────────────────────────────────────────────────────
  TENANT_ID: "buleje.tenant.id",
  USER_ID: "buleje.user.id",
  USER_ROLE: "buleje.user.role",
  SESSION_ID: "buleje.session.id",

  // ── Orders / payments ────────────────────────────────────────────────────
  ORDER_ID: "buleje.order.id",
  ORDER_STATUS: "buleje.order.status",
  ORDER_TOTAL: "buleje.order.total",
  PAYMENT_PROVIDER: "buleje.payment.provider",
  PAYMENT_STATUS: "buleje.payment.status",
  COUPON_CODE: "buleje.coupon.code",

  // ── Products ─────────────────────────────────────────────────────────────
  PRODUCT_ID: "buleje.product.id",
  PRODUCT_SKU: "buleje.product.sku",
  CATEGORY_ID: "buleje.category.id",

  // ── Events ───────────────────────────────────────────────────────────────
  EVENT_TYPE: "buleje.event.type",
  EVENT_ID: "buleje.event.id",
  EVENT_SOURCE: "buleje.event.source",

  // ── HTTP / API ────────────────────────────────────────────────────────────
  HTTP_ROUTE: "buleje.http.route",
  HTTP_TENANT_SLUG: "buleje.http.tenant_slug",

  // ── Internal tracing ─────────────────────────────────────────────────────
  /** Set automatically by @traced decorator */
  CLASS_NAME: "buleje.class",
  /** Set automatically by @traced decorator */
  METHOD_NAME: "buleje.method",

  // ── AI / ML ───────────────────────────────────────────────────────────────
  AI_MODEL: "buleje.ai.model",
  AI_TOKENS_USED: "buleje.ai.tokens_used",
  AI_LATENCY_MS: "buleje.ai.latency_ms",
} as const;

/** Union of all ATTR values — useful for typed span setters. */
export type AttrKey = (typeof ATTR)[keyof typeof ATTR];
