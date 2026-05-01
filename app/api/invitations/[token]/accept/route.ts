import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { EmployeeInvitationsDb } from "@/lib/db/employee-invitations.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * POST /api/invitations/[token]/accept
 * Body: { username, password }
 *
 * Crea AdminUser con el rol de la invitación y marca la invitación
 * como accepted. Rate-limit AUTH por IP.
 */
const Body = z.object({
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, "username inválido"),
  password: z.string().min(8).max(80),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const rl = applyRateLimit(req, "AUTH", "invitations-accept");
  if (rl) return rl;

  const { token } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const inv = await EmployeeInvitationsDb.findByToken(token);
  if (!inv) {
    return NextResponse.json({ error: "Invitación inválida" }, { status: 404 });
  }
  if (inv.status !== "pending") {
    return NextResponse.json({ error: `Invitación ${inv.status}` }, { status: 410 });
  }
  if (new Date(inv.expiresAt).getTime() < Date.now()) {
    await EmployeeInvitationsDb.markExpired(inv.id);
    return NextResponse.json({ error: "Invitación vencida" }, { status: 410 });
  }

  const exists = await EmployeeInvitationsDb.usernameExists(inv.tenantId, parsed.data.username);
  if (exists) {
    return NextResponse.json({ error: "Ese usuario ya existe en la tienda" }, { status: 409 });
  }

  await EmployeeInvitationsDb.acceptAndCreateAdminUser({
    invitationId: inv.id,
    tenantId: inv.tenantId,
    name: inv.name,
    role: inv.role,
    username: parsed.data.username,
    password: parsed.data.password,
  });

  logger.info("[invitations] accepted", {
    tenantId: inv.tenantId,
    role: inv.role,
    username: parsed.data.username,
  });

  return NextResponse.json({ ok: true, tenantId: inv.tenantId });
}
