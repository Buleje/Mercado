import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { notifyTenantOwnerSecurity } from "@/lib/auth/security-alerts";
import { logger } from "@/lib/logger";

const ReplySchema = z.object({ body: z.string().min(1).max(4000) });

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// POST /api/superadmin/support/[id]/reply — responder un ticket.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = applyRateLimit(req, "MODERATE", "sa-support-reply"); if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
  const session = await requirePlatform(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const parsed = ReplySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Respuesta inválida" }, { status: 400 });

  try {
    const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, tenantId: true, subject: true } });
    if (!ticket) return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });

    await prisma.supportTicket.update({
      where: { id },
      data: { reply: parsed.data.body, repliedAt: new Date(), status: "replied" },
    });

    logSuperadminAction("support_reply", `Respuesta a ticket "${ticket.subject}" (${id})`, { ticketId: id, tenantId: ticket.tenantId }, session.username).catch((err) => logger.warn("[support/reply] audit failed", { error: String(err) }));
    // Avisar al dueño que tiene respuesta de soporte (fire-and-forget).
    notifyTenantOwnerSecurity(ticket.tenantId, {
      title: "💬 Soporte de Buleje respondió tu consulta",
      body: `Tu ticket "${ticket.subject}" tiene una respuesta. Entra al panel para verla.`,
      url: "/admin",
    }).catch((err) => logger.error("[support/reply] owner alert failed", { error: String(err) }));

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[superadmin/support/reply] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
