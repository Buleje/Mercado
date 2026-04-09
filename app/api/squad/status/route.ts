import { NextResponse, type NextRequest } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Squad Dashboard Status Endpoint
 *
 * Exposes the current state of the Alpha/Beta/Gamma autonomous squad for the
 * admin panel. Reads `.claude/squad/orchestrator.json` from disk (it is the
 * shared brain, not a database record) and returns a summarized view with
 * per-task status, agent state, and recent events.
 *
 * Access: admin + superadmin only. Not tenant-scoped because the orchestrator
 * is a global engineering artifact, not per-tenant data.
 *
 * Caching: intentionally not cached. This endpoint must reflect the latest
 * squad state on every call. `requireAdmin` reads cookies, so Next 16 will
 * auto-detect this route as dynamic (no need for a segment config).
 */

type TaskStatus =
  | "pending"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

interface OrchestratorTask {
  task_id: string;
  module: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  status: TaskStatus;
  assigned_agent: string | null;
  allowed_agents: string[];
  started_at: string | null;
  completed_at: string | null;
  reviewed_by: string | null;
  files_to_modify?: string[];
  acceptance_criteria?: string[];
}

interface OrchestratorFile {
  version: string;
  project: string;
  last_updated: string;
  shared_state: {
    current_sprint: number;
    sprint_name?: string;
    active_agents: unknown[];
    locked_files: Array<{ path: string; agent: string; since: string }>;
  };
  agents: Record<
    string,
    { role: string; status: string; owns?: string[] }
  >;
  tasks: OrchestratorTask[];
}

const ORCHESTRATOR_PATH = path.join(
  process.cwd(),
  ".claude",
  "squad",
  "orchestrator.json",
);
const EVENTS_PATH = path.join(
  process.cwd(),
  ".claude",
  "squad",
  "events.log",
);

async function readOrchestrator(): Promise<OrchestratorFile | null> {
  try {
    const raw = await readFile(ORCHESTRATOR_PATH, "utf8");
    return JSON.parse(raw) as OrchestratorFile;
  } catch {
    return null;
  }
}

async function readRecentEvents(limit = 20): Promise<string[]> {
  try {
    const raw = await readFile(EVENTS_PATH, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(-limit);
  } catch {
    return [];
  }
}

async function readFileMtime(absPath: string): Promise<string | null> {
  try {
    const info = await stat(absPath);
    return info.mtime.toISOString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const data = await readOrchestrator();
  if (!data) {
    return NextResponse.json(
      {
        ok: false,
        error: "orchestrator.json not found or unparseable",
      },
      { status: 503 },
    );
  }

  const events = await readRecentEvents(20);
  const orchestratorMtime = await readFileMtime(ORCHESTRATOR_PATH);

  const counts: Record<TaskStatus, number> = {
    pending: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    blocked: 0,
  };
  for (const t of data.tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  }

  const tasksSummary = data.tasks.map((t) => ({
    task_id: t.task_id,
    module: t.module,
    title: t.title,
    priority: t.priority,
    status: t.status,
    assigned_agent: t.assigned_agent,
    allowed_agents: t.allowed_agents,
    started_at: t.started_at,
    completed_at: t.completed_at,
    reviewed_by: t.reviewed_by,
  }));

  return NextResponse.json({
    ok: true,
    project: data.project,
    version: data.version,
    last_updated: data.last_updated,
    orchestrator_file_mtime: orchestratorMtime,
    sprint: {
      number: data.shared_state.current_sprint,
      name: data.shared_state.sprint_name ?? null,
    },
    agents: data.agents,
    locked_files: data.shared_state.locked_files,
    counts,
    total_tasks: data.tasks.length,
    tasks: tasksSummary,
    recent_events: events,
  });
}
