import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listEnabledSpecializations, SPECIALIZATIONS } from "@/lib/specializations";

/**
 * GET /api/admin/me/specializations
 *
 * Lista las especializaciones HABILITADAS para el tenant del admin actual.
 * Usado por el sidebar admin (hook useEnabledSpecs) para mostrar/ocultar
 * tabs de especialización (ADR-124).
 *
 * Response:
 *   { keys: string[], moduleIds: string[] }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const keys = await listEnabledSpecializations(auth.tenantId);
  const moduleIds = keys
    .map((k) => SPECIALIZATIONS[k]?.moduleId)
    .filter((m): m is string => Boolean(m));

  return NextResponse.json({ keys, moduleIds });
}
