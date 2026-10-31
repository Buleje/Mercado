import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import type { SessionPayload } from "@/lib/session";

/**
 * Guard de las guías guardadas (ADR-442): el mismo orden que los casilleros
 * (ADR-438) — sesión (admin/almacenero/dueño: el almacenero es quien recibe
 * los papeles) → CSRF en escrituras → rate limit → Libro CTP habilitado. El
 * tenant sale SIEMPRE de la sesión.
 */
const ROLES = ["admin", "almacenero", "owner"] as const;

export type Guard = { auth: SessionPayload } | { res: Response };

export async function guardGuias(req: NextRequest, escritura: boolean): Promise<Guard> {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return { res: auth };
  if (escritura) {
    const csrf = assertCsrf(req);
    if (csrf) return { res: csrf };
  }
  const rl = await applyRateLimit(req, escritura ? "DRIVE" : "DRIVE_READ", "forestal-guias-guardadas");
  if (rl) return { res: rl };
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return {
      res: NextResponse.json(
        { error: "specialization_disabled", message: "El Libro CTP no está habilitado para esta tienda." },
        { status: 403 },
      ),
    };
  }
  return { auth };
}

export const errorJson = (r: { status: number; error: string; message: string; id?: string }) =>
  NextResponse.json({ error: r.error, message: r.message, ...(r.id ? { id: r.id } : {}) }, { status: r.status });
