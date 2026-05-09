/**
 * ADR-047 — POST /api/billing/wire-up/ai-hook
 *
 * Endpoint interno que recibe tokens usados por una llamada LLM y emite
 * el evento correspondiente al MeteringBus. Llamado por wrappers de IA
 * que no pueden importar el bus directamente (ej: edge functions).
 *
 * Seguridad: protegido con INTERNAL_API_SECRET header.
 * El tenantId NUNCA se toma del body — viene validado en el header auth.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeCompare } from "@/lib/timing-safe";
import { emitMeteringEvent } from "@/lib/billing/wire-up/metering-bus";
import { logActivity } from "@/lib/activity-logger";

const AI_SOURCES = [
  "ai.llm.call",
  "ai.recommend.call",
  "ai.insight.call",
] as const;

const BodySchema = z.object({
  tenantId: z.string().min(1).max(128),
  source: z.enum(AI_SOURCES),
  tokens: z.number().int().positive().max(10_000),
  requestId: z.string().min(1).max(128).optional(),
  model: z.string().max(64).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth: INTERNAL_API_SECRET header
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "INTERNAL_API_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("x-internal-secret") ?? "";
  if (!timingSafeCompare(authHeader, secret)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const { tenantId, source, tokens, requestId, model } = parsed.data;

  emitMeteringEvent({
    source,
    tenantId,
    amount: tokens,
    idempotencyKey: requestId,
    metadata: model ? { model } : undefined,
  });

  logActivity(
    "metering.ai.hook",
    "usage.meter",
    JSON.stringify({ source, tokens, model }),
    requestId,
    "system",
    undefined,
    tenantId,
  ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

  return NextResponse.json({ queued: true }, { status: 202 });
}
