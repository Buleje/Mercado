import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { PATRON_DIA, instanteDeVencimiento } from "@/lib/adelantos/control-edicion";
import { AdelantosLoteDB } from "@/lib/db/adelantos-lote.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/** Hasta 200 adelantos, un solo día de Lima («AAAA-MM-DD»). */
const Schema = z
  .object({
    ids: z.array(z.string().min(1).max(40)).min(1).max(200),
    fechaVencimiento: z.string().regex(PATRON_DIA, "La fecha va como AAAA-MM-DD."),
  })
  .strict();

// POST /api/adelantos/fecha-en-lote — la misma fecha de cobro a varios adelantos abiertos
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "adelantos-fecha-lote"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "write");
  if (sinPermiso) return sinPermiso;
  try {
    const json = await req.json().catch(() => null);
    const parsed = Schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    if (!instanteDeVencimiento(parsed.data.fechaVencimiento)) {
      return NextResponse.json({ error: "Esa fecha no existe. Elígela del calendario." }, { status: 400 });
    }
    const r = await AdelantosLoteDB.ponerFechaDeCobro(auth.tenantId, parsed.data.ids, parsed.data.fechaVencimiento, auth.username);
    return NextResponse.json(r);
  } catch (e) {
    logger.error("[adelantos/fecha-en-lote] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
