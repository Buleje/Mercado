import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ContabilidadDB } from "@/lib/db/contabilidad.db";
import { auditar, responder, sesion } from "../../_comun";

const Id = z.string().trim().min(1).max(64);

/** DELETE /api/admin/contabilidad/asientos/<id> — anula un asiento a mano o de apertura de un mes abierto. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesion(req, true);
  if (s instanceof NextResponse) return s;
  const id = Id.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Falta el asiento." }, { status: 400 });
  return responder("asientos/anular", s, async () => {
    await ContabilidadDB.anular(s.tenantId, id.data);
    auditar(req, s, "DELETE", `anuló el asiento ${id.data}`, id.data);
    return { ok: true as const };
  });
}
