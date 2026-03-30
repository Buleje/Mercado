export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TreasuryDB } from "@/lib/db/treasury.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const CreateMovimientoSchema = z.object({
  cuentaId: z.string().min(1),
  tipo: z.enum(["INGRESO", "EGRESO"]),
  monto: z.number().positive().max(99999999),
  descripcion: z.string().max(500).optional(),
  categoria: z.string().max(100).optional(),
  referencia: z.string().max(200).optional(),
});

// GET /api/treasury/movimientos
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const sp = req.nextUrl.searchParams;
    const filters = {
      cuentaId: sp.get("cuentaId") ?? undefined,
      tipo: (sp.get("tipo") as "INGRESO" | "EGRESO") ?? undefined,
      origen: sp.get("origen") as never ?? undefined,
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      categoria: sp.get("categoria") ?? undefined,
      search: sp.get("search") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    };

    const movimientos = await TreasuryDB.listMovimientos(auth.tenantId, filters);
    return NextResponse.json(movimientos);
  } catch (e) {
    logger.error("[treasury/movimientos] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/treasury/movimientos
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CreateMovimientoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const mov = await TreasuryDB.registrarMovimiento({
      tenantId: auth.tenantId,
      ...parsed.data,
    });

    const label = parsed.data.tipo === "INGRESO"
      ? `Ingreso S/${parsed.data.monto.toFixed(2)} en ${mov.cuentaNombre ?? "cuenta"}`
      : `Egreso S/${parsed.data.monto.toFixed(2)} de ${mov.cuentaNombre ?? "cuenta"}`;

    logActivity("Registrar", "treasury", label, mov.id, auth.username).catch(() => {});

    return NextResponse.json(mov, { status: 201 });
  } catch (e) {
    logger.error("[treasury/movimientos] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 503 });
  }
}
