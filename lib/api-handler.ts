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
export function withApiHandler<C = { params: Promise<Record<string, string>> }>(
  tag: string,
  handler: (req: NextRequest, ctx: C) => Promise<Response>,
) {
  // Genérico C: handlers de rutas dinámicas ([id]) requieren ctx con sus params;
  // handlers estáticos lo ignoran. El RETORNO hace ctx opcional para que
  // tests/callers que invocan con 1 argumento (req) no fallen tipos — Next
  // siempre provee ctx en runtime (de ahí el cast).
  return async (req: NextRequest, ctx?: C): Promise<Response> => {
    try {
      return await handler(req, ctx as C);
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
