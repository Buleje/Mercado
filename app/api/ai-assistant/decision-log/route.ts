export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ── Zod schemas ─────────────────────────────────────────────────────────────

const DecisionSchema = z.object({
  decision: z.string().min(1, "Decisión requerida").max(1000),
  impacto: z.string().max(500).optional(),
  resultado: z.string().max(500).optional(),
});

// ── Constants ───────────────────────────────────────────────────────────────

const DECISION_COLOR = "orange";

// We store decisions as Note records with title prefix "__DECISION_LOG__"
// Each note = one decision, content is JSON { decision, impacto, resultado }
const DECISION_PREFIX = "__DECISION_LOG__";

// ── Types ───────────────────────────────────────────────────────────────────

interface DecisionEntry {
  id: string;
  decision: string;
  impacto?: string;
  resultado?: string;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDecision(note: any): DecisionEntry {
  let data: { decision?: string; impacto?: string; resultado?: string } = {};
  try {
    data = JSON.parse(note.content || "{}");
  } catch {
    data = { decision: note.content || "" };
  }
  return {
    id: note.id,
    decision: data.decision ?? "",
    impacto: data.impacto,
    resultado: data.resultado,
    createdAt: note.createdAt instanceof Date ? note.createdAt.toISOString() : String(note.createdAt),
    updatedAt: note.updatedAt instanceof Date ? note.updatedAt.toISOString() : String(note.updatedAt),
  };
}

// ── GET: return last 50 decisions ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "analista"]);
  if (auth instanceof NextResponse) return auth;

  const rateLimited = applyRateLimit(req, "GENEROUS", "ai-decisions");
  if (rateLimited) return rateLimited;

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "50", 10) || 50, 1), 100);

  const notes = await prisma.note.findMany({
    where: {
      tenantId: auth.tenantId,
      title: { startsWith: DECISION_PREFIX },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    decisions: notes.map(mapDecision),
    total: notes.length,
  });
}

// ── POST: register a new decision ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const rateLimited = applyRateLimit(req, "MODERATE", "ai-decisions");
  if (rateLimited) return rateLimited;

  const raw = await req.json().catch(() => ({}));
  const parsed = DecisionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { decision, impacto, resultado } = parsed.data;
  const now = new Date();
  const dateLabel = now.toISOString().slice(0, 10);

  const note = await prisma.note.create({
    data: {
      tenantId: auth.tenantId,
      title: `${DECISION_PREFIX}${dateLabel}`,
      content: JSON.stringify({ decision, impacto, resultado }),
      color: DECISION_COLOR,
      pinned: false,
    },
  });

  logActivity(
    "create",
    "decision_log",
    `Decisión: ${decision.slice(0, 100)}`,
    note.id,
    auth.username
  ).catch(() => {});

  return NextResponse.json({ decision: mapDecision(note) }, { status: 201 });
}

// ── PATCH: update resultado/impacto of existing decision ────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json().catch(() => ({}));
  const id = raw.id as string | undefined;
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const existing = await prisma.note.findFirst({
    where: { id, tenantId: auth.tenantId, title: { startsWith: DECISION_PREFIX } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Decisión no encontrada" }, { status: 404 });
  }

  let currentData: Record<string, unknown> = {};
  try {
    currentData = JSON.parse(existing.content || "{}");
  } catch { /* ignore */ }

  const updateSchema = z.object({
    id: z.string(),
    decision: z.string().max(1000).optional(),
    impacto: z.string().max(500).optional(),
    resultado: z.string().max(500).optional(),
  });

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const merged = {
    ...currentData,
    ...(parsed.data.decision !== undefined && { decision: parsed.data.decision }),
    ...(parsed.data.impacto !== undefined && { impacto: parsed.data.impacto }),
    ...(parsed.data.resultado !== undefined && { resultado: parsed.data.resultado }),
  };

  const updated = await prisma.note.update({
    where: { id },
    data: { content: JSON.stringify(merged) },
  });

  logActivity(
    "update",
    "decision_log",
    `Actualizada decisión ${id}`,
    id,
    auth.username
  ).catch(() => {});

  return NextResponse.json({ decision: mapDecision(updated) });
}
