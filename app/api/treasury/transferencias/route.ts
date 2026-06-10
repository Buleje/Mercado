import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TreasuryDB } from "@/lib/db/treasury.db";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";

const TransferenciaSchema = z.object({
  origenId: z.string().min(1),
  destinoId: z.string().min(1),
  monto: z.number().positive().max(99999999),
  descripcion: z.string().max(500).optional(),
});

// GET /api/treasury/transferencias
export const GET = withApiHandler("treasury-transferencias-get", async (req: NextRequest) => {
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
});

// POST /api/treasury/transferencias
export const POST = withApiHandler("treasury-transferencias-post", async (req: NextRequest) => {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
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
    // Audit 2026-06-10 P1: solo errores de negocio (Error plano lanzado por
    // TreasuryDB con mensaje user-facing, ej. "Saldo insuficiente") llegan al
    // cliente. Internos (Prisma*, TypeError, etc.) responden genérico.
    const businessMessage = e instanceof Error && e.constructor === Error ? e.message : null;
    return NextResponse.json({ error: businessMessage ?? "Database error" }, { status: 503 });
  }
});
