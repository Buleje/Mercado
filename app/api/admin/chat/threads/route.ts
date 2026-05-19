import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { ChatThreadsDB, type ThreadStatus } from "@/lib/db/chat.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

// Brandon 2026-05-16 (audit Info): force-dynamic obligatorio — depende
// de cookies + query params + datos en tiempo real (threads de chat).

const StatusSchema = z.enum(["open", "closed", "archived", "blocked"]);

const CloseBody = z.object({
  threadId: z.string().min(1).max(100),
  reason:   z.string().max(300).optional(),
});

/**
 * GET /api/admin/chat/threads
 * Lista hilos del tenant ordenados por actividad reciente.
 * Filtros opcionales: ?status=open&storeId=...&limit=50
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const statusRaw = req.nextUrl.searchParams.get("status");
  const storeId = req.nextUrl.searchParams.get("storeId") ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);

  const status =
    statusRaw && StatusSchema.safeParse(statusRaw).success
      ? (statusRaw as ThreadStatus)
      : undefined;

  try {
    const threads = await ChatThreadsDB.listByTenant(auth.tenantId, {
      status,
      storeId,
      limit,
    });
    return NextResponse.json(
      { data: threads },
      {
        headers: { "X-Total-Count": String(threads.length) },
      },
    );
  } catch (err) {
    logger.error("[chat/threads] list failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/chat/threads",
      tenantId: auth.tenantId,
      extra: { verb: "GET" },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/chat/threads
 * Cerrar un hilo. El admin puede cerrarlo con una razón opcional.
 */
export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-chat-threads"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CloseBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await ChatThreadsDB.close(auth.tenantId, parsed.data.threadId, parsed.data.reason);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[chat/threads] close failed", { err: String(err) });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/chat/threads",
      tenantId: auth.tenantId,
      extra: { verb: "PATCH", threadId: parsed.data.threadId },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
