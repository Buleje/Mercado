import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { StockoutPredictionsDB, type StockoutSeverity } from "@/lib/db/stockout-predictions.db";
import { logger } from "@/lib/logger";

const SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;

const QuerySchema = z.object({
  storeSlug: z.string().min(1),
  severity: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parts = v.split(",").map((s) => s.trim()) as StockoutSeverity[];
      const valid = parts.filter((p): p is StockoutSeverity =>
        (SEVERITY_VALUES as readonly string[]).includes(p),
      );
      return valid.length > 0 ? valid : undefined;
    }),
});

export async function GET(req: NextRequest) {
  // Next 16 Cache Components: opt-out de pre-render estático porque el
  // handler lee cookies via requireAdmin (dinámico por sesión). Debe ir
  // FUERA del try/catch — connection() lanza una excepción especial durante
  // prerender que React captura internamente. ADR-019 (2026-04-09).
  await connection();
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero", "tienda_owner"]);
    if (auth instanceof NextResponse) return auth;
    const url = new URL(req.url);
    const queryParams = {
      storeSlug: url.searchParams.get("storeSlug") || "",
      severity: url.searchParams.get("severity"),
    };
    const parsed = QuerySchema.safeParse(queryParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId, slug: parsed.data.storeSlug },
      select: { id: true },
    });
    if (!store) {
      return NextResponse.json({ error: "Store no encontrado" }, { status: 404 });
    }
    const predictions = await StockoutPredictionsDB.getByStore(auth.tenantId, store.id, {
      severity: parsed.data.severity,
      limit: 100,
    });
    return NextResponse.json({ data: predictions });
  } catch (err) {
    logger.error("[marketplace/predictions] GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}