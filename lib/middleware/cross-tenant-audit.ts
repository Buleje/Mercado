/**
 * lib/middleware/cross-tenant-audit.ts
 *
 * Fire-and-forget audit logger for potential x-tenant-id injection attempts.
 *
 * When a client sends an `x-tenant-id` header that differs from what the
 * server resolved from hostname / cookie / JWT, we log it to
 * `/api/internal/audit-log` with a small payload for forensics.
 *
 * This runs in the edge runtime, so we cannot import Prisma or any
 * Node-only module. We use global `fetch` and drop errors silently.
 *
 * Extracted from proxy.ts on 2026-04-08 as part of the TD-013 refactor
 * (see docs/adr/014-middleware-module-split.md).
 */

import type { NextRequest } from "next/server";

/**
 * Fire-and-forget call to /api/internal/audit-log when the client-sent
 * x-tenant-id does not match the server-resolved tenantId. No-op when:
 *   - the client header is missing
 *   - the client header matches the resolved tenant (no suspicion)
 *   - the request is not to /api/* (static pages don't log here)
 *   - there is no INTERNAL_API_KEY / CRON_SECRET env var set
 */
export function auditCrossTenantHeader(
  req: NextRequest,
  pathname: string,
  clientSentTenantHeader: string | null,
  resolvedTenantId: string,
  requestId: string,
): void {
  if (!clientSentTenantHeader) return;
  if (clientSentTenantHeader === resolvedTenantId) return;
  if (!pathname.startsWith("/api/")) return;

  const internalKey = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET;
  if (!internalKey) return;

  const auditUrl = new URL("/api/internal/audit-log", req.url);
  fetch(auditUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": internalKey,
    },
    body: JSON.stringify({
      event: "tenant_header_mismatch",
      resolvedTenantId,
      clientTenantHeader: clientSentTenantHeader.substring(0, 100),
      ip:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()?.substring(0, 45) ??
        "unknown",
      path: pathname.substring(0, 200),
      method: req.method,
      userAgent: req.headers.get("user-agent")?.substring(0, 200),
      requestId,
    }),
  }).catch(() => {
    /* fire-and-forget — edge runtime cannot retry */
  });
}
