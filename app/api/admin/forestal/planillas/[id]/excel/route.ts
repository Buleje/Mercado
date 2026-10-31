import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/require-admin";
import { isSpecializationEnabled } from "@/lib/specializations";
import { planillaPorId } from "@/lib/forestal/planillas/catalogo";
import { excelDePlanilla, nombreArchivoPlanilla } from "@/lib/forestal/planillas/excel";

/**
 * GET /api/admin/forestal/planillas/[id]/excel — el Excel de la planilla:
 * hoja 1 con los encabezados que su importador reconoce tal cual (se llena y se
 * sube por el «Importar» de su destino), hoja 2 con cabecera, método y guía.
 * No lee ni escribe datos del negocio.
 */

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:herramientas");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = await applyRateLimit(req, "MODERATE", "planillas-excel");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const { id } = await params;
  const planilla = planillaPorId(id);
  if (!planilla) return NextResponse.json({ error: "Planilla desconocida" }, { status: 404 });

  const buf = await excelDePlanilla(planilla);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoPlanilla(planilla)}"`,
      "Cache-Control": "no-store",
    },
  });
}
