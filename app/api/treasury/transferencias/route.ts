import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TreasuryDB } from "@/lib/db/treasury.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

const TransferenciaSchema = z.object({
  origenId: z.string().min(1),
  destinoId: z.string().min(1),
  monto: z.number().positive().max(99999999),
  descripcion: z.string().max(500).optional(),
});

// GET /api/treasury/transferencias
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
    const transferencias = await TreasuryDB.listTransferencias(auth.tenantId, limit);
    return NextResponse.json(transferencias);
  } catch (e) {
    logger.error("[treasury/transferencias] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

// POST /api/treasury/transferencias
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "treasury-transferencias"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = TransferenciaSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const transfer = await TreasuryDB.transferir({
      tenantId: auth.tenantId,
      ...parsed.data,
    });

    logActivity(
      "Transferir", "treasury",
      `S/${parsed.data.monto.toFixed(2)} de ${transfer.origenNombre ?? "origen"} a ${transfer.destinoNombre ?? "destino"}`,
      transfer.id, auth.username,
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json(transfer, { status: 201 });
  } catch (e) {
    logger.error("[treasury/transferencias] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 503 });
  }
}
