export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { sseAdminClients } from "@/lib/sse-emitter";

/**
 * GET /api/admin/sse
 * Server-Sent Events stream for real-time admin notifications.
 * Events emitted: new_order, order_status_changed
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const encoder = new TextEncoder();
  let send: ((data: string) => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // client disconnected — will be cleaned up on abort
        }
      };

      sseAdminClients.add(send);

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
        if (send) sseAdminClients.delete(send);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      if (send) sseAdminClients.delete(send);
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
