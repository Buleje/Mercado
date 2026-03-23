export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { BatchesDB } from "@/lib/db";

// ── Schema ────────────────────────────────────────────────────────────────────

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
});

// ── GET /api/batches/expiring ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "GENEROUS", "batches-expiring");
  if (rl) return rl;

  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const batches = await BatchesDB.getExpiring(auth.tenantId, parsed.data.days);
    return NextResponse.json({ data: batches, days: parsed.data.days });
  } catch {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
