import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { EmployeeInvitationsDb } from "@/lib/db/employee-invitations.db";

/**
 * GET /api/invitations/[token]
 * Endpoint público — la página de aceptación lo llama para validar el token
 * y mostrar el rol al invitado antes de que cree el usuario.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
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
  return NextResponse.json({
    name: inv.name,
    role: inv.role,
    tenantId: inv.tenantId,
    expiresAt: inv.expiresAt,
  });
}
