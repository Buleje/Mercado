import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { IaConversacionesDB } from "@/lib/db/ia-conversaciones.db";

/** GET /api/admin/ia/conversaciones → `{ items: ConversacionResumen[] }` (solo las de quien pide). */
export async function GET(req: NextRequest) {
  const limitado = await applyRateLimit(req, "SHELL_POLL", "ia-conversaciones");
  if (limitado) return limitado;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const items = await IaConversacionesDB.listar(auth.tenantId, auth.username);
  return NextResponse.json({ items });
}
