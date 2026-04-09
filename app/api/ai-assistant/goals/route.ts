import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// ── Zod schemas ─────────────────────────────────────────────────────────────

const GoalSchema = z.object({
  id: z.string().optional(),
  tipo: z.enum(["semanal", "mensual"]),
  meta: z.number().min(0),
  actual: z.number().min(0).default(0),
  categoria: z.enum(["ventas", "clientes", "margen"]),
  descripcion: z.string().max(500).default(""),
  activa: z.boolean().default(true),
});

type Goal = z.infer<typeof GoalSchema>;

// ── Helpers: goals stored in Note with title="__AI_GOALS__" ─────────────────

const GOALS_TITLE = "__AI_GOALS__";

async function getGoalsNote(tenantId: string) {
  return prisma.note.findFirst({
    where: { tenantId, title: GOALS_TITLE },
  });
}

async function readGoals(tenantId: string): Promise<Goal[]> {
  const note = await getGoalsNote(tenantId);
  if (!note || !note.content) return [];
  try {
    return JSON.parse(note.content) as Goal[];
  } catch {
    return [];
  }
}

async function writeGoals(tenantId: string, goals: Goal[]): Promise<void> {
  const existing = await getGoalsNote(tenantId);
  const content = JSON.stringify(goals);
  if (existing) {
    await prisma.note.update({
      where: { id: existing.id },
      data: { content },
    });
  } else {
    await prisma.note.create({
      data: {
        tenantId,
        title: GOALS_TITLE,
        content,
        color: "blue",
        pinned: true,
      },
    });
  }
}

// ── GET: return active goals ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager", "analista"]);
  if (auth instanceof NextResponse) return auth;

  const rateLimited = applyRateLimit(req, "GENEROUS", "ai-goals");
  if (rateLimited) return rateLimited;

  const goals = await readGoals(auth.tenantId);
  const activeOnly = req.nextUrl.searchParams.get("all") !== "true";

  return NextResponse.json({
    goals: activeOnly ? goals.filter((g) => g.activa !== false) : goals,
  });
}

// ── POST: create or update a goal ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const rateLimited = applyRateLimit(req, "MODERATE", "ai-goals");
  if (rateLimited) return rateLimited;

  const raw = await req.json().catch(() => ({}));
  const parsed = GoalSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const goal = parsed.data;
  const goals = await readGoals(auth.tenantId);

  if (goal.id) {
    // Update existing
    const idx = goals.findIndex((g) => g.id === goal.id);
    if (idx === -1) {
      return NextResponse.json({ error: "Meta no encontrada" }, { status: 404 });
    }
    goals[idx] = { ...goals[idx], ...goal };
  } else {
    // Create new
    goal.id = crypto.randomUUID();
    goals.push(goal);
  }

  await writeGoals(auth.tenantId, goals);

  logActivity(
    goal.id ? "update" : "create",
    "ai-goal",
    `${goal.tipo} ${goal.categoria}: meta S/${goal.meta}`,
    goal.id,
    auth.username
  ).catch(() => {});

  return NextResponse.json({ goal, goals });
}

// ── DELETE: remove a goal ───────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  const goals = await readGoals(auth.tenantId);
  const filtered = goals.filter((g) => g.id !== id);

  if (filtered.length === goals.length) {
    return NextResponse.json({ error: "Meta no encontrada" }, { status: 404 });
  }

  await writeGoals(auth.tenantId, filtered);

  logActivity("delete", "ai-goal", `Eliminada meta ${id}`, id, auth.username).catch(() => {});

  return NextResponse.json({ success: true, goals: filtered });
}
