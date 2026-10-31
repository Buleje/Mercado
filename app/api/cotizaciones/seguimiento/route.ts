/**
 * Recordatorios a clientes de cotizaciones abiertas (F31).
 *
 * GET                          → { recordatorios: { "<cotizacionId>": Recordatorio[] } }
 * POST {cotizacionId, forzar?} → { recordatorios } · 409 `reciente` si ya se
 *                                recordó hace menos de 24 h (no se anota dos veces).
 *
 * El mensaje lo manda la persona desde su WhatsApp: esto sólo deja constancia
 * de quién recordó y cuándo, para que el equipo no le escriba dos veces.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CotizacionesDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { CotizacionesEquipoDB } from "@/lib/db/cotizaciones-equipo.db";

const ROLES = ["admin", "owner", "manager"] as const;

const RecordarSchema = z.object({
  cotizacionId: z.string().min(1).max(40),
  forzar: z.boolean().optional(),
});

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ recordatorios: await CotizacionesEquipoDB.recordatorios(auth.tenantId) });
  } catch (e) {
    logger.error("[cotizaciones] seguimiento GET", { err: err(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo traer el seguimiento" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "cotizaciones-seguimiento");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  const parsed = RecordarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Falta la cotización" }, { status: 400 });
  try {
    const cot = await CotizacionesDB.getById(parsed.data.cotizacionId, auth.tenantId);
    if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    const r = await CotizacionesEquipoDB.registrarRecordatorio(auth.tenantId, cot.id, auth.username, {
      forzar: parsed.data.forzar,
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: `Ya se le recordó hace menos de 24 h (${r.ultimo.por}).`, motivo: r.motivo, ultimo: r.ultimo },
        { status: 409 },
      );
    }
    return NextResponse.json({ recordatorios: r.recordatorios });
  } catch (e) {
    logger.error("[cotizaciones] seguimiento POST", { err: err(e), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se pudo anotar el recordatorio" }, { status: 503 });
  }
}
