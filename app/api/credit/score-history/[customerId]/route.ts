/**
 * app/api/credit/score-history/[customerId]/route.ts
 *
 * Fiado Digital Ola 2 — Phase 1 scaffold.
 *
 * Endpoint GET que eventualmente devolverá el timeline inmutable de
 * `CreditScoreHistory` para un cliente (US-F1-02 y US-F1-03).
 *
 * Ver plan: `docs/fiado-digital-ola2-plan.md` §3 (tabla de endpoints,
 * fila `/api/credit/score-history/[customerId]`).
 * Ver ADR: `docs/adr/021-fiado-digital-ola2.md` §Principios §3.
 *
 * ### Estado actual: stub controlado por feature flag
 *
 * Este handler está **deliberadamente vacío** porque depende de:
 *
 * 1. TD-030 `LoyaltyTransaction` aplicado en prod (bloqueante duro).
 * 2. Tabla `CreditScoreHistory` en `schema.prisma` (Phase 1 migration).
 * 3. Helper `snapshotCreditScore()` en `lib/credit/scoring-engine.ts`.
 *
 * Mientras esas 3 piezas no existan, el endpoint:
 *
 * - Exige auth (`requireAdmin` con roles `admin` + `cajero`).
 * - Valida el feature flag `FIADO_DIGITAL_V2_PHASE1`.
 * - Retorna 404 si la fase 1 está apagada (para no filtrar que existe).
 * - Retorna 200 con `history: []` + mensaje explícito si la fase 1 está on
 *   pero el schema aún no tiene la tabla. Esto permite que el frontend
 *   muestre "timeline vacío" sin romper.
 *
 * Cuando TD-030 aterrice, reemplazar el stub por una query real:
 *
 * ```ts
 * const history = await prisma.creditScoreHistory.findMany({
 *   where: { tenantId: auth.tenantId, customerId },
 *   orderBy: { createdAt: "desc" },
 *   take: 50,
 * });
 * ```
 *
 * ### ADRs respetados
 *
 * - ADR-019: no usa `export const dynamic = "force-dynamic"`. El runtime
 *   auto-detecta dinámica al leer cookies via `requireAdmin`.
 * - ADR-014: middleware valida tenant previamente.
 * - CLAUDE.md §3: cualquier query nueva usará `tenantId` como primer filtro.
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { isFiadoDigitalPhase1Enabled } from "@/lib/feature-flags/fiado-digital";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { customerId } = await params;

  // Feature flag gate: si la fase 1 no está activa, 404 silencioso —
  // evitamos filtrar que el endpoint existe pre-lanzamiento.
  if (!isFiadoDigitalPhase1Enabled()) {
    logger.info("[credit/score-history] Phase 1 disabled — 404", {
      customerId,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(
      { error: "Fiado Digital Phase 1 no habilitado" },
      { status: 404 },
    );
  }

  // TODO(TD-030): reemplazar este stub con query real a CreditScoreHistory
  // una vez que:
  //   1. prisma.creditScoreHistory.findMany esté disponible (schema merged)
  //   2. snapshotCreditScore() esté poblando la tabla
  //   3. Filtro por tenantId sea obligatorio como primer WHERE (CLAUDE.md §3)
  logger.info("[credit/score-history] Phase 1 scaffold hit", {
    customerId,
    tenantId: auth.tenantId,
  });

  return NextResponse.json({
    history: [],
    currentScore: null,
    currentLimit: null,
    message:
      "Phase 1 scaffolding — awaiting TD-030 LoyaltyTransaction + CreditScoreHistory table. Endpoint listo; schema pendiente.",
  });
}
