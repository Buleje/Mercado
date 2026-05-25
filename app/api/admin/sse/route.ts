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
 *  - Rate limit GENEROUS por IP: EventSource reconecta seguido (y en dev con
 *    Fast Refresh cada rebuild), STRICT (10/15min) daba 429 espurio. GENEROUS
 *    (100/min) frena spam real sin romper reconexiones legítimas.
 *  - Cap global de 1000 conexiones + cap por tenant de 50 (anti DoS).
 */
export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "admin-sse");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  if (totalAdminSSEConnections() > 1000) {
    return NextResponse.json({ error: "Capacity exceeded" }, { status: 503 });
  }
  if (tenantAdminSSEConnections(auth.tenantId) > 50) {
    return NextResponse.json({ error: "Tenant capacity exceeded" }, { status: 503 });
  }

  // SSE via TransformStream + writer (Next 16 + undici compat).
  // Patrón anterior usaba ReadableStream({ start(controller) }) + controller.enqueue
  // desde setInterval/subscriber, lo que disparaba en Next 16:
  //   TypeError: controller[kState].transformAlgorithm is not a function
  // El writer es async-safe y maneja correctamente el lifecycle del stream.
  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  let closed = false;

  const send = (data: string) => {
    if (closed) return;
    writer.write(encoder.encode(data)).catch(() => {
      closed = true;
    });
  };

  // Confirm connection
  send(": connected\n\n");

  const unsubscribe = subscribeAdminSSE(auth.tenantId, send);

  // Keep-alive every 20s — los proxies suelen matar conexiones idle a los 30s.
  const ping = setInterval(() => send(": ping\n\n"), 20_000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    unsubscribe?.();
    writer.close().catch((err) => {
      // Stream ya cerrado por el cliente — esperado en abort/disconnect.
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console -- dev-only diagnostic
        console.debug("[admin/sse] writer close (stream already terminated)", String(err));
      }
    });
  };

  req.signal.addEventListener("abort", cleanup);

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
