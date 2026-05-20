import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { DailySummaryDB } from "@/lib/db/daily-summary.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const CierreDiarioSchema = z.object({
  fecha: z.string().min(1),
  totalVentas: z.number().nonnegative(),
  cantidadVentas: z.number().int().nonnegative(),
  ticketPromedio: z.number().nonnegative(),
  efectivoContado: z.number().nonnegative().nullable().optional(),
  efectivoEsperado: z.number().nonnegative(),
  diferenciaCaja: z.number(),
  fiadosCobrados: z.number().nonnegative().default(0),
  fiadosNuevos: z.number().nonnegative().default(0),
  fiadosVencidos: z.number().int().nonnegative().default(0),
  mejorHora: z.string().nullable().optional(),
  productoTop: z.string().nullable().optional(),
  stockAlertas: z.string().nullable().optional(),
  notas: z.string().max(2000).nullable().optional(),
});

// POST — Save daily summary
export async function POST(req: NextRequest) {
  const rateLimitResult = applyRateLimit(req, "STRICT", "cierre-diario-post");
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = CierreDiarioSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const summary = await DailySummaryDB.create(auth.tenantId, {
      ...data,
      creadoPor: auth.username,
    });

    logActivity(
      "Crear", "cierre-diario",
      `Cierre del día ${data.fecha} — Ventas: S/${data.totalVentas.toFixed(2)}`,
      summary.id, auth.username,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json(summary, { status: 201 });
  } catch (e) {
    logger.error("[cierre-diario] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al guardar cierre" }, { status: 503 });
  }
}

// GET — List last 30 daily summaries
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const summaries = await DailySummaryDB.listRecent(auth.tenantId, { take: 30 });
    return NextResponse.json(summaries);
  } catch (e) {
    logger.error("[cierre-diario] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al obtener cierres" }, { status: 503 });
  }
}
