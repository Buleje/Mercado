import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DeclaracionesDB } from "@/lib/db/declaraciones.db";

const UpsertSchema = z.object({
  periodo: z.string().regex(/^\d{4}(-\d{2})?$/, "periodo inválido (YYYY o YYYY-MM)"),
  tipo: z.enum(["igv-renta", "plame", "renta-anual"]),
  estado: z.enum(["pendiente", "presentada", "pagada"]),
  montoDeclarado: z.number().nonnegative().optional(),
  notas: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const yearParam = new URL(req.url).searchParams.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? yearParam : String(new Date().getFullYear());

  try {
    const list = await DeclaracionesDB.listByYear(auth.tenantId, year);
    return NextResponse.json(list);
  } catch (e) {
    logger.error("[declaraciones] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "declaraciones");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsed = UpsertSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.flatten() }, { status: 400 });
    }
    const saved = await DeclaracionesDB.upsertEstado(auth.tenantId, parsed.data);
    return NextResponse.json(saved);
  } catch (e) {
    logger.error("[declaraciones] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
