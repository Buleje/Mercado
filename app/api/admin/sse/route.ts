import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  subscribeAdminSSE,
  totalAdminSSEConnections,
  tenantAdminSSEConnections,
} from "@/lib/sse-emitter";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/sse
 * Server-Sent Events stream para admin notifications en tiempo real.
 *
 * SECURITY 2026-05-06 (audit notifs #1+#3+#10):
 *  - Tenant-scoped: cada admin solo recibe eventos de su propio tenant.
 *  - Rate limit STRICT por IP para frenar spam de conexiones.
 *  - Cap global de 1000 conexiones + cap por tenant de 50 (anti DoS).
 */
export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "STRICT", "admin-sse");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  if (totalAdminSSEConnections() > 1000) {
    return NextResponse.json({ error: "Capacity exceeded" }, { status: 503 });
  }
  if (tenantAdminSSEConnections(auth.tenantId) > 50) {
    return NextResponse.json({ error: "Tenant capacity exceeded" }, { status: 503 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // client disconnected — will be cleaned up on abort
        }
      };

      unsubscribe = subscribeAdminSSE(auth.tenantId, send);

      // Confirm connection
      controller.enqueue(encoder.encode(`: connected\n\n`));

      // Keep-alive comment every 20s so proxies don't kill idle connections
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 20_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe?.();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
