import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * SSE endpoint for real-time admin notifications.
 * Polls DB every 5 seconds for new orders since last check.
 * Client connects via EventSource and receives order events.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "owner", "manager"]).catch(() => null);
  if (!auth || auth instanceof Response) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tenantId = auth.tenantId;
  const encoder = new TextEncoder();
  let lastCheck = new Date();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        try {
          // Check for new orders since last check
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

          // Check low stock alerts
          const lowStock = await prisma.product.count({
            where: {
              tenantId,
              active: true,
              deletedAt: null,
              stock: { lte: 5 },
            },
          });

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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } else {
            // Heartbeat to keep connection alive
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          }
        } catch {
          // Silently ignore DB errors during polling
        }
      }, 5000);

      // Cleanup on abort
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
