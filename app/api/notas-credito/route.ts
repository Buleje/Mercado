import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NotasCreditoDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";

const CreateNotaCreditoSchema = z.object({
  orderId: z.string().optional(),
  saleId: z.string().optional(),
  motivoCodigo: z.string().min(1).max(10),
  motivoDesc: z.string().min(1).max(500),
  monto: z.number().positive(),
  notas: z.string().max(2000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const data = await NotasCreditoDB.getAll(auth.tenantId, {
      status: sp.get("status") ?? undefined,
      orderId: sp.get("orderId") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    logger.error("[notas-credito] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = CreateNotaCreditoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const data = parsed.data;

  try {
    const numero = await NotasCreditoDB.siguienteNumero(auth.tenantId);

    // Calculate IGV over the monto
    const igv = data.monto * 0.18;
    const total = data.monto + igv;

    const nota = await NotasCreditoDB.create(auth.tenantId, {
      numero,
      orderId: data.orderId,
      saleId: data.saleId,
      motivoCodigo: data.motivoCodigo,
      motivoDesc: data.motivoDesc,
      monto: data.monto,
      igv,
      total,
      notas: data.notas,
      createdBy: auth.username,
    });

    logAudit({
      req,
      action: "CREATE",
      entity: "Order",
      entityId: nota.id,
      detail: `Nota de crédito ${numero} creada por S/${total.toFixed(2)} — ${data.motivoDesc}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json(nota, { status: 201 });
  } catch (e) {
    logger.error("[notas-credito] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
