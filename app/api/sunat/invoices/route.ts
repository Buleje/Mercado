/**
 * GET /api/sunat/invoices
 *
 * Lista los comprobantes electrónicos del tenant con filtros opcionales.
 * Query params: status, type, limit, offset
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { SunatDB } from "@/lib/db/sunat.db";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  status: z
    .enum(["pending", "accepted", "rejected", "voided", "retrying"])
    .optional(),
  type: z.enum(["boleta", "factura", "nota_credito", "baja"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  const rawQuery = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = QuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { status, type, limit, offset } = parsed.data;

  try {
    const { invoices, total } = await SunatDB.listInvoices(tenantId, {
      status,
      type,
      limit,
      offset,
    });

    return NextResponse.json({ invoices, total, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[SUNAT invoices GET] Error", { tenantId, error: message });
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
