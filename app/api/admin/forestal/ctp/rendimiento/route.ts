import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { isSpecializationEnabled } from "@/lib/specializations";
import { leerRendimientoAserradero } from "@/lib/forestal/rendimiento-lectura";

/**
 * GET /api/admin/forestal/ctp/rendimiento — el rendimiento del aserradero por
 * especie y por corrida, con su estado «parcial» y (para quien ve plata) el
 * rendimiento comercial y el costo por PT aserrado. Contrato K4 (a), 08-10.
 * La lectura vive en `lib/forestal/rendimiento-lectura.ts`.
 *
 * Roles: los del GET del libro (admin, almacenero, owner). La PLATA sólo para
 * admin/owner/manager — mismo criterio que las rutas de plata de la guía; el
 * almacenero recibe `plataVisible: false` y las corridas sin `plata`.
 * `?plata=0` (radar, Cuadro 3) salta la parte cara.
 */
const ROLES_PLATA = new Set(["admin", "owner", "manager"]);
const querySchema = z.object({ plata: z.enum(["0", "1"]).optional() });

export const GET = withApiHandler("forestal-ctp-rendimiento", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
      { status: 403 },
    );
  }
  const q = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ error: "invalid_query", message: "Parámetros inválidos." }, { status: 400 });

  const plata = q.data.plata !== "0" && ROLES_PLATA.has(auth.role);
  return NextResponse.json(await leerRendimientoAserradero(auth.tenantId, { plata }));
});
