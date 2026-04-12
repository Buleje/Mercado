import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { SalesAnomaliesDB, type AnomalySeverity } from "@/lib/db/sales-anomalies.db";
import { logger } from "@/lib/logger";

const SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;

const QuerySchema = z.object({
  storeSlug: z.string().min(1),
  severity: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parts = v.split(",").map((s) => s.trim()) as AnomalySeverity[];
      const valid = parts.filter((p): p is AnomalySeverity =>
        (SEVERITY_VALUES as readonly string[]).includes(p),
      );
      return valid.length > 0 ? valid : undefined;
    }),
  direction: z.enum(["drop", "spike"]).optional(),
  acknowledged: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
});

export async function GET(req: NextRequest) {
  // Next 16 Cache Components: opt-out de pre-render estático porque el
  // handler lee cookies via requireAdmin (dinámico por sesión). Debe ir
  // FUERA del try/catch — connection() lanza una excepción especial durante
  // prerender que React captura internamente, no debemos interceptarla.
  // ADR-019 (2026-04-09).
  await connection();
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero", "tienda_owner"]);
    if (auth instanceof NextResponse) return auth;
    const url = new URL(req.url);
    const queryParams = {
      storeSlug: url.searchParams.get("storeSlug") || "",
      severity: url.searchParams.get("severity"),
      direction: url.searchParams.get("direction"),
      acknowledged: url.searchParams.get("acknowledged"),
    };
    const parsed = QuerySchema.safeParse(queryParams);
    if (!parsed.success) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });
    }
    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId, slug: parsed.data.storeSlug },
      select: { id: true },
    });
    if (!store) {
      return NextResponse.json({ error: "Store no encontrado" }, { status: 404 });
    }
    const anomalies = await SalesAnomaliesDB.getRecent(auth.tenantId, store.id, {
      severity: parsed.data.severity,
      direction: parsed.data.direction,
      acknowledged: parsed.data.acknowledged,
      limit: 50,
    });
    return NextResponse.json({ data: anomalies });
  } catch (err) {
    logger.error("[marketplace/anomalies] GET error", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}