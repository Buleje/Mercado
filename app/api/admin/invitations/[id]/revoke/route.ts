import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { EmployeeInvitationsDb } from "@/lib/db/employee-invitations.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * POST /api/admin/invitations/[id]/revoke
 * Revoca una invitación pendiente — el token deja de servir.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-invitations-X-revoke"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const result = await EmployeeInvitationsDb.revoke(id, auth.tenantId);

  if (result === 0) {
    return NextResponse.json({ error: "No encontrada o ya procesada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
