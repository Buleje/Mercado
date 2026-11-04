import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { AlquileresDB } from "@/lib/db/alquileres.db";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import { aCrear, alquilerCrearSchema, filtroAlquileresSchema } from "./esquemas";
import { falla, leerCuerpo, ROLES_ALQUILERES } from "./_respuestas";

/**
 * /api/admin/alquileres — locales alquilados (ADR-524): contrato, renta,
 * garantía y pagos mes a mes. Es un REGISTRO: no mueve caja ni entra al P&L.
 * Admin/owner. El `resumen` (deuda, próximo pago, meses atrasados) lo calcula
 * el backend en céntimos.
 *
 * GET  ?estado&duenoParteId → { alquileres }
 * POST DTO sin derivados → 201 { alquiler }
 */

export const GET = withApiHandler("admin-alquileres-get", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-alquileres");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES_ALQUILERES);
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;
  const parsed = filtroAlquileresSchema.safeParse({
    estado: sp.get("estado") || undefined,
    duenoParteId: sp.get("duenoParteId") || undefined,
  });
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return NextResponse.json(r.body, { status: r.status });
  }
  try {
    const alquileres = await AlquileresDB.listar(auth.tenantId, parsed.data);
    return NextResponse.json({ alquileres });
  } catch (err) {
    logger.error("[alquileres.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("admin-alquileres-post", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-alquileres");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_ALQUILERES);
  if (auth instanceof NextResponse) return auth;
  const cuerpo = await leerCuerpo(req, alquilerCrearSchema);
  if (!cuerpo.ok) return cuerpo.res;
  try {
    const r = await AlquileresDB.crear(auth.tenantId, aCrear(cuerpo.data), auth.username ?? "unknown");
    return r.ok ? NextResponse.json({ alquiler: r.alquiler }, { status: 201 }) : falla(r);
  } catch (err) {
    logger.error("[alquileres.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
