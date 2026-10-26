import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { chequeoAvanzado } from "@/lib/forestal/loth-chequeo-server";
import { veTodoElDrive } from "@/lib/documents/doc-access";
import { AJUSTES_CHEQUEO_DEFECTO } from "@/lib/forestal/loth-chequeo-tipos";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/chequeo — el chequeo avanzado de Cumplimiento ›
 * Chequeo del Libro TH (26-10): guías, árboles y bloques, plan y papeles,
 * plazos y fechas, cada uno con su norma y sus casos (`loth-chequeo-server`).
 *
 * GET ?diasPreliminar=1..14&licencia=0|1&planId=… → ChequeoAvanzado. Sólo
 * lectura. Guard igual que el semáforo del libro: requireAdmin (los roles de
 * `GET /loth`) → rate limit con bucket propio → spec:forestal:loth-libro.
 *
 * Los chequeos de papeles (`papeles_*`) sólo para quien ve todo el Archivo
 * (dueño y administrador, `veTodoElDrive`): al almacenero no le salen ni le
 * cuentan en el puntaje — dirían el nombre de un papel con candado.
 */
const QuerySchema = z.object({
  diasPreliminar: z.coerce.number().int().min(1).max(14).default(AJUSTES_CHEQUEO_DEFECTO.diasPreliminar),
  licencia: z.enum(["0", "1"]).default(AJUSTES_CHEQUEO_DEFECTO.pedirLicencia ? "1" : "0"),
  planId: z.string().trim().min(1).max(64).optional(),
});

export const GET = withApiHandler("forestal-loth-chequeo", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth-chequeo");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", message: "Revisa los ajustes del chequeo.", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const { diasPreliminar, licencia, planId } = parsed.data;
    const r = await chequeoAvanzado(auth.tenantId, {
      ajustes: { diasPreliminar, pedirLicencia: licencia === "1" },
      planId: planId ?? null,
      verPapeles: veTodoElDrive(auth.role),
    });
    return NextResponse.json(r);
  } catch (err) {
    logger.error("[loth.chequeo.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
