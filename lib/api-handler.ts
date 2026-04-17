import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Wrapper para route handlers que estandariza:
 * 1. Try-catch global con logger.error (todo error queda en Sentry/logs)
 * 2. Nunca expone e.message al cliente (solo "Internal server error")
 * 3. Agrega requestId del header al contexto de log
 *
 * Uso:
 *   export const GET = withApiHandler("orders", async (req) => {
 *     const data = await OrdersDB.list(tenantId);
 *     return NextResponse.json(data);
 *   });
 */
export function withApiHandler(
  tag: string,
  handler: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      const requestId = req.headers.get("x-request-id") ?? undefined;
      logger.error(`[${tag}] Unhandled error`, {
        error: e instanceof Error ? e.message : String(e),
        method: req.method,
        path: req.nextUrl.pathname,
        requestId,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
