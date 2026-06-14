import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";

// El componente manda open|in_progress|closed; storage usa open|replied|closed.
const StatusSchema = z.object({ status: z.enum(["open", "in_progress", "closed"]) });
const toStorage: Record<string, string> = { open: "open", in_progress: "replied", closed: "closed" };

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// PATCH /api/superadmin/support/[id]/status — cambiar estado de un ticket.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = applyRateLimit(req, "MODERATE", "sa-support-status"); if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const parsed = StatusSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  try {
    const exists = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, tenantId: true } });
    if (!exists) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

    await prisma.supportTicket.update({ where: { id }, data: { status: toStorage[parsed.data.status] } });
    logSuperadminAction("support_status", `Ticket ${id} -> ${parsed.data.status}`, { ticketId: id, tenantId: exists.tenantId }, session.username).catch((err) => logger.warn("[support/status] audit failed", { error: String(err) }));
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[superadmin/support/status] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
