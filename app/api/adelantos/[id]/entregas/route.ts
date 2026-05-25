import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

const EntregaSchema = z
  .object({
    tipo: z.enum(["LIBRE", "PRODUCTO"]),
    descripcion: z.string().max(300).optional(),
    productId: z.number().int().positive().optional(),
    cantidad: z.number().positive().max(9999999).optional(),
    valorManual: z.number().positive().max(9999999999).optional(),
    sumarAStock: z.boolean().optional(),
    pactadaId: z.string().max(40).optional(),
    notas: z.string().max(500).optional(),
    comprobanteUrl: z.string().url().max(500).optional(),
    fecha: z.string().optional(),
  })
  .refine((d) => (d.tipo === "PRODUCTO" ? d.productId != null || d.valorManual != null : d.valorManual != null), {
    message: "Entrega LIBRE requiere valorManual; PRODUCTO requiere productId o valorManual",
  });

// POST /api/adelantos/[id]/entregas — registrar liquidación (atómico)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-entrega"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const parsed = EntregaSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    let adelanto;
    try {
      adelanto = await AdelantosDB.registrarEntrega(auth.tenantId, id, parsed.data);
    } catch (bizErr) {
      // Errores de negocio (producto inexistente, valor 0, adelanto cancelado) → 400 claro.
      return NextResponse.json({ error: bizErr instanceof Error ? bizErr.message : "Error de validación" }, { status: 400 });
    }
    if (!adelanto) return NextResponse.json({ error: "Adelanto no encontrado" }, { status: 404 });
    logActivity("Liquidar", "adelanto", `Entrega registrada en adelanto ${id} — saldo S/${adelanto.saldoPendiente.toFixed(2)}`, id, auth.username).catch((err) => logger.error("[adelantos] logActivity failed", { error: String(err) }));
    return NextResponse.json(adelanto, { status: 201 });
  } catch (e) {
    logger.error("[adelantos/entregas] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
