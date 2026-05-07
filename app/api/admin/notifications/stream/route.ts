import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * SSE endpoint for real-time admin notifications.
 * Polls DB every 5 seconds for new orders since last check.
 * Client connects via EventSource and receives order events.
 *
 * FIX 2026-05-07 (P0 #4): migrado de ReadableStream + controller.enqueue
 * a TransformStream + writer.write. El patrón anterior tiraba en Next 16
 * + Node 22 / undici:
 *   TypeError: controller[kState].transformAlgorithm is not a function
 * El error ocurre dentro del stream engine, no en el callback de enqueue,
 * así que un try/catch en torno a controller.enqueue NO lo captura.
 * El writer expone una promesa por write y un .closed que sí podemos manejar.
 * Mismo patrón que app/api/admin/sse/route.ts (commit 84db5a3f).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "owner", "manager"]).catch((err) => {
    logger.warn("[notifications/stream] requireAdmin threw", { err: String(err) });
    return null;
  });
  if (!auth || auth instanceof Response) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tenantId = auth.tenantId;
  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  let closed = false;
  let lastCheck = new Date();

  const send = (data: string) => {
    if (closed) return;
    writer.write(encoder.encode(data)).catch(() => {
      closed = true;
    });
  };

  send(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  const interval = setInterval(async () => {
    if (closed) {
      clearInterval(interval);
      return;
    }

    try {
      const newOrders = await prisma.order.findMany({
        where: {
          tenantId,
          createdAt: { gt: lastCheck },
        },
        select: {
          id: true,
          customerName: true,
          total: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      const lowStock = await prisma.product.count({
        where: {
          tenantId,
          active: true,
          deletedAt: null,
          stock: { lte: 5 },
        },
      });

      if (closed) {
        clearInterval(interval);
        return;
      }

      lastCheck = new Date();

      if (newOrders.length > 0 || lowStock > 0) {
        const payload = {
          type: "update",
          newOrders: newOrders.map((o) => ({
            id: o.id,
            customer: o.customerName ?? "Cliente",
            total: Number(o.total),
            status: o.status,
          })),
          lowStockCount: lowStock,
          timestamp: lastCheck.toISOString(),
        };
        send(`data: ${JSON.stringify(payload)}\n\n`);
      } else {
        send(`: heartbeat\n\n`);
      }
    } catch {
      // Silently ignore DB errors during polling
    }
  }, 5000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    writer.close().catch((err) => {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console -- dev-only diagnostic
        console.debug("[notifications/stream] writer close (already terminated)", String(err));
      }
    });
  };

  req.signal.addEventListener("abort", cleanup);

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
