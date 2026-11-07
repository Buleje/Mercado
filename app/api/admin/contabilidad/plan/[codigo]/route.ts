import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { PatchCuentaSchema } from "@/lib/contabilidad/esquemas";
import { auditar, leerBody, responder, sesion } from "../../_comun";

const Codigo = z.string().regex(/^\d{3,10}$/);

/** PATCH /api/admin/contabilidad/plan/<codigo> — nombre o baja de una cuenta PROPIA. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const s = await sesion(req, true);
  if (s instanceof NextResponse) return s;
  const codigo = Codigo.safeParse((await params).codigo);
  if (!codigo.success) return NextResponse.json({ error: "El código de cuenta son 3 a 10 números." }, { status: 400 });
  const b = await leerBody(req, PatchCuentaSchema);
  if (b instanceof NextResponse) return b;
  return responder("plan/editar", s, async () => {
    const c = await ContabilidadDB.editarCuenta(s.tenantId, codigo.data, b);
    auditar(req, s, "UPDATE", `cuenta propia ${c.codigo}: ${JSON.stringify(b)}`, c.codigo);
    return c;
  });
}
