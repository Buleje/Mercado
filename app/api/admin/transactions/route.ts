import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { TransactionsDB } from "@/lib/db/transactions.db";

/**
 * GET /api/admin/transactions
 *
 * Listado consolidado de TODAS las transacciones de venta del tenant:
 *  - POS (modelo Sale) — ventas en mostrador, kiosk, ventas-caja
 *  - Tienda online (modelo Order, source=direct/wholesale) — pedidos del storefront
 *  - Marketplace (modelo Order, source=marketplace) — pedidos cross-store
 *
 * Toda la lógica de queries vive en `lib/db/transactions.db.ts` (regla #1
 * CLAUDE.md: no prisma directo desde routes). El handler solo valida, llama
 * a la DB layer y serializa.
 */

const QuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  source: z.enum(["pos", "tienda", "marketplace", "all"]).default("all"),
  q: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { from, to, source, q, page, limit } = parsed.data;

  // Guard explícito: si auth.tenantId fuera undefined Prisma omitiría el
  // filtro y devolveríamos data cross-tenant. Defense in depth.
  const tenantId = auth.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Default range: últimos 30 días si no se pasa nada
  const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dateTo = to ? new Date(to) : new Date();

  try {
    const result = await TransactionsDB.list(tenantId, {
      from: dateFrom,
      to: dateTo,
      source,
      q,
      page,
      limit,
    });

    return NextResponse.json({
      ...result,
      page,
      limit,
    });
  } catch (e) {
    logger.error("[admin/transactions] GET error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId,
    });
    return NextResponse.json({ error: "Error al cargar transacciones" }, { status: 500 });
  }
}
