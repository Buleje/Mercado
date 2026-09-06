import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  getHistorialVelocidad,
  registrarMuestras,
  resumirPorDia,
} from "@/lib/documentos/historial-velocidad";

/**
 * GET  → cuánto viene tardando el drive, día por día.
 * POST → el drive reporta cuánto tardó esta vez.
 */

const MuestraSchema = z.object({
  tramo: z.enum(["listado", "miniaturas", "visor", "subida"]),
  ms: z.number().nonnegative().max(120_000),
  docs: z.number().int().nonnegative().max(5000).optional(),
});

const ReporteSchema = z.object({
  muestras: z.array(MuestraSchema).min(1).max(10),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const historial = await getHistorialVelocidad(auth.tenantId);
    return NextResponse.json({ dias: resumirPorDia(historial) });
  } catch (e) {
    logger.error("[documents/velocidad] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "no_disponible" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  // GENEROUS: el drive reporta una vez por apertura, no por documento.
  const rl = await applyRateLimit(req, "GENEROUS", "documents:velocidad");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReporteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    await registrarMuestras(auth.tenantId, parsed.data.muestras);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Que falle guardar una medición no puede romperle el drive a nadie.
    logger.warn("[documents/velocidad] no se pudo guardar", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
