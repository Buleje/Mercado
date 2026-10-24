import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

/**
 * POST /api/admin/forestal/trozas/retrozar
 *
 * Corta una troza en pedazos — el **Apartado 2 del formato LO-CTP** (ADR-313).
 *
 * Las medidas se validan en el servidor con la misma función pura que usa el
 * modal para avisar antes de guardar: lo que el operador ve rechazado en
 * pantalla es lo que la base rechaza, y no hay forma de saltear la validación
 * mandando el POST a mano.
 */

const Pedazo = z.object({
  d1Cm: z.coerce.number().positive().max(500),
  d2Cm: z.coerce.number().positive().max(500),
  largoM: z.coerce.number().positive().max(60),
  /** Opcional: si no viene se calcula. Si viene, manda — el operador midió. */
  volumenM3: z.coerce.number().positive().max(999).nullable().optional(),
  observaciones: z.string().trim().max(300).nullable().optional(),
  descarte: z.boolean().optional(),
});

const Body = z.object({
  trozaId: z.string().trim().min(1).max(60),
  fecha: z.coerce.date().optional(),
  // Un corte real da 2 o 3 pedazos; 20 es un techo generoso que igual frena un
  // POST absurdo antes de que abra la transacción.
  pedazos: z.array(Pedazo).min(1).max(20),
});

export async function POST(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "ctp:retrozar");
    if (rl) return rl;
    const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
    if (auth instanceof NextResponse) return auth;
    const habilitado = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
    if (!habilitado) return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
    }

    const r = await WoodEntriesDB.retrozar(auth.tenantId, parsed.data.trozaId, parsed.data.pedazos, {
      fecha: parsed.data.fecha,
      usuario: auth.username ?? "unknown",
    });

    return NextResponse.json({ ok: true, ...r }, { status: 201 });
  } catch (e) {
    if (e instanceof CtpInvariantError) {
      return NextResponse.json({ error: e.code, message: e.message, detail: e.detail }, { status: 409 });
    }
    logger.error("[forestal.retrozar] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
