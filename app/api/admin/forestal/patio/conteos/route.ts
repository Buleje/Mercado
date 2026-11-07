import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ForestPatioConteoDB, LIMITE_HISTORIAL_CONTEOS } from "@/lib/db/forest-patio-conteo.db";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { guardarConteoSchema } from "@/lib/forestal/conteo-patio-guardado";

/**
 * /api/admin/forestal/patio/conteos — las actas del conteo físico del patio
 * (Brandon 2026-09-26, sobre ADR-436).
 *
 * GET           — el historial: los últimos 50 con su resumen (esperadas,
 *                 contadas, cuántas faltan / sobran / códigos desconocidos, m³).
 *                 `?limite=` lo acota (1-50).
 * GET  ?id=     — el acta entera: faltantes, sobrantes, sorpresas y el conteo
 *                 del equipo (`conteo`) para reimprimirla con `actaDelConteo`.
 * POST          — guarda el acta. Body `{ conteo: ConteoPatio, notas? }`: el
 *                 MISMO objeto que el equipo tiene en localStorage. Los totales
 *                 los recalcula el servidor. Mismo `iniciadoEn` = misma acta
 *                 (actualiza, no duplica). 201 si la creó, 200 si la actualizó.
 */

async function guard(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

const Query = z.object({
  id: z.string().trim().min(1).max(60).optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_HISTORIAL_CONTEOS).optional(),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:patio-conteos");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const denegado = await guard(auth.tenantId);
  if (denegado) return denegado;

  const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    if (parsed.data.id) {
      const acta = await ForestPatioConteoDB.porId(auth.tenantId, parsed.data.id);
      if (!acta) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json(acta);
    }
    const conteos = await ForestPatioConteoDB.listar(auth.tenantId, parsed.data.limite);
    return NextResponse.json({ conteos });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.patio.conteos.GET", auth.tenantId);
  }
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "ctp:patio-conteos");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const denegado = await guard(auth.tenantId);
  if (denegado) return denegado;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = guardarConteoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const r = await ForestPatioConteoDB.guardar(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json(r, { status: r.creada ? 201 : 200 });
  } catch (e) {
    return ctpErrorResponse(e, "forestal.patio.conteos.POST", auth.tenantId);
  }
}
