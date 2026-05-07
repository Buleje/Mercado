/**
 * Critical Alerts — domain-specific Sentry helpers
 * --------------------------------------------------
 * Wrappers around `reportCriticalError` (lib/sentry-alerts.ts) that attach
 * **consistent tags** so the Sentry dashboard alert rules can route each
 * domain to the right destination (WhatsApp / Email / Slack / Discord).
 *
 * Tagging strategy (must match the rules documented in docs/SENTRY_ALERTS.md):
 *   - severity:    "critical" | "high" | "warning"
 *   - domain:      "payments" | "orders" | "db-drift" | "delivery" | "auth" | "infra"
 *   - cross_tenant "true"  (only when applicable)
 *   - alert_route: "p0" | "p1" | "p2"
 *
 * Dev-mode short-circuit: nothing is sent unless NODE_ENV === "production"
 * (sentry.*.config.ts also has `enabled: production`, but we double-guard
 * here so noisy local logs don't paint Brandon's phone red).
 *
 * Usage:
 *   import { alertHighSeverity, alertPaymentFailure } from "@/lib/critical-alerts";
 *   alertPaymentFailure({ orderId, amount, tenantId }, error);
 */

import { reportCriticalError } from "@/lib/sentry-alerts";
import { logger } from "@/lib/logger";

const IS_PROD = process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlertRoute = "p0" | "p1" | "p2";

interface BaseContext {
  module?: string;
  tenantId?: string;
  /** Override default p0/p1/p2 routing for this alert */
  route?: AlertRoute;
  /** Additional structured context — appears in Sentry "Additional Data" */
  extra?: Record<string, unknown>;
}

interface PaymentContext extends BaseContext {
  orderId?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: "yape" | "stripe" | "mercadopago" | "cash" | "card";
}

interface OrderTransitionContext extends BaseContext {
  orderId: string;
  fromStatus: string;
  toStatus: string;
}

// ---------------------------------------------------------------------------
// Internal dispatch
// ---------------------------------------------------------------------------

function dispatch(
  error: Error | unknown,
  domain: string,
  route: AlertRoute,
  ctx: BaseContext,
  extraTags: Record<string, string> = {},
): string {
  // Always log locally so devs see something in dev mode.
  logger.error(`[critical-alert] ${domain} (${route})`, {
    domain,
    route,
    tenantId: ctx.tenantId,
    module: ctx.module,
    error: error instanceof Error ? error.message : String(error),
    ...ctx.extra,
  });

  if (!IS_PROD) {
    // Don't page Brandon during local dev. Return a fake event id so callers
    // can still do `if (eventId) ...` for their own logging.
    return "dev-skip";
  }

  return reportCriticalError(error, {
    module: ctx.module,
    tenantId: ctx.tenantId,
    extra: ctx.extra,
    tags: {
      domain,
      alert_route: route,
      ...extraTags,
    },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * P0 — Generic high-severity error. Use when no more specific helper fits.
 * Tags: severity:critical, alert_route:p0
 */
export function alertHighSeverity(
  context: BaseContext & { description?: string },
  error: Error | unknown,
): string {
  const route = context.route ?? "p0";
  const err =
    error instanceof Error
      ? error
      : new Error(context.description ?? "High severity event");
  return dispatch(err, context.module ?? "unknown", route, context);
}

/**
 * P0 — Cross-tenant data leak detected. ALWAYS routes to p0.
 * Tags: severity:critical, domain:auth, cross_tenant:true, alert_route:p0
 *
 * Call this whenever a query returns rows belonging to a tenant other than
 * the one in the request context (defense-in-depth on top of `lib/db/*` guards).
 */
export function alertCrossTenantLeak(
  tenantA: string,
  tenantB: string,
  context: BaseContext & { resource?: string; userId?: string },
): string {
  const err = new Error(
    `Cross-tenant leak detected: tenant ${tenantA} accessed data from ${tenantB}`,
  );
  return dispatch(
    err,
    "auth",
    "p0",
    {
      ...context,
      tenantId: tenantA,
      extra: {
        ...context.extra,
        tenantA,
        tenantB,
        resource: context.resource,
        userId: context.userId,
      },
    },
    { cross_tenant: "true" },
  );
}

/**
 * P0 — Payment failure (Yape/Stripe/MP). Routes to p0 because money is involved.
 * Tags: severity:critical, domain:payments, alert_route:p0
 */
export function alertPaymentFailure(
  context: PaymentContext,
  error: Error | unknown,
): string {
  const err =
    error instanceof Error
      ? error
      : new Error("Payment processing failed");
  return dispatch(
    err,
    "payments",
    context.route ?? "p0",
    {
      ...context,
      module: context.module ?? "checkout",
      extra: {
        ...context.extra,
        orderId: context.orderId,
        amount: context.amount,
        currency: context.currency ?? "PEN",
        paymentMethod: context.paymentMethod,
      },
    },
    context.paymentMethod ? { payment_method: context.paymentMethod } : {},
  );
}

/**
 * P0 — Schema drift: code expects a column that does not exist in DB
 * (e.g. ProductAnalytics columns missing). This bricks endpoints — page now.
 * Tags: severity:critical, domain:db-drift, alert_route:p0
 */
export function alertSchemaDrift(
  missingColumns: string[],
  context: BaseContext & { table?: string } = {},
): string {
  const err = new Error(
    `Schema drift: missing columns ${missingColumns.join(", ")}${context.table ? ` on table ${context.table}` : ""}`,
  );
  return dispatch(err, "db-drift", "p0", {
    ...context,
    module: context.module ?? "prisma",
    extra: {
      ...context.extra,
      table: context.table,
      missingColumns,
    },
  });
}

/**
 * P1 — Invalid order status transition (state-machine bug).
 * Tags: severity:high, domain:orders, alert_route:p1
 */
export function alertInvalidOrderTransition(
  context: OrderTransitionContext,
  error?: Error | unknown,
): string {
  const err =
    error instanceof Error
      ? error
      : new Error(
          `Invalid order transition ${context.fromStatus} -> ${context.toStatus}`,
        );
  return dispatch(
    err,
    "orders",
    context.route ?? "p1",
    {
      ...context,
      module: context.module ?? "orders",
      extra: {
        ...context.extra,
        orderId: context.orderId,
        fromStatus: context.fromStatus,
        toStatus: context.toStatus,
      },
    },
    {
      from_status: context.fromStatus,
      to_status: context.toStatus,
    },
  );
}

/**
 * P0 — Payment-proof upload failure (Yape capture flow).
 * Tags: severity:critical, domain:payments, sub_domain:proof_upload, alert_route:p0
 */
export function alertPaymentProofUploadFailure(
  context: BaseContext & { orderId?: string; conversationId?: string; fileName?: string },
  error: Error | unknown,
): string {
  const err =
    error instanceof Error ? error : new Error("Payment proof upload failed");
  return dispatch(
    err,
    "payments",
    "p0",
    {
      ...context,
      module: context.module ?? "yape-capture",
      extra: {
        ...context.extra,
        orderId: context.orderId,
        conversationId: context.conversationId,
        fileName: context.fileName,
      },
    },
    { sub_domain: "proof_upload" },
  );
}

/**
 * P1 — Health-check / endpoint repeatedly returning 5xx.
 * Tags: severity:high, domain:infra, alert_route:p1
 */
export function alertEndpointDown(
  endpoint: string,
  status: number,
  context: BaseContext & { consecutiveFailures?: number } = {},
): string {
  const err = new Error(
    `Endpoint ${endpoint} responding ${status}${
      context.consecutiveFailures ? ` (${context.consecutiveFailures}x consecutive)` : ""
    }`,
  );
  return dispatch(
    err,
    "infra",
    context.route ?? "p1",
    {
      ...context,
      module: context.module ?? "health-check",
      extra: {
        ...context.extra,
        endpoint,
        status,
        consecutiveFailures: context.consecutiveFailures,
      },
    },
    { endpoint },
  );
}
