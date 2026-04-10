import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";

/**
 * Squad Dashboard Status Endpoint
 *
 * Returns a minimal summary of the Alpha/Beta/Gamma autonomous squad for the
 * engineering dashboard. This endpoint exposes INTERNAL engineering state and
 * must NEVER be reachable by customer admins in a multi-tenant production
 * deployment. Defense in depth (HOTFIX-007):
 *
 *   1. `requireAdmin(req, ["admin"])` — baseline role gate.
 *   2. `NODE_ENV !== "production"` OR an explicit `SQUAD_STATUS_ALLOWLIST`
 *      username match — hard wall against tenant admins in prod.
 *   3. Any unmet condition answers with 404 (not 401/403/503) so the route
 *      itself is indistinguishable from an unknown path.
 *   4. Response body is intentionally minimal: no locked_files, no raw
 *      events log, no file paths, no task titles, no assignees, no roadmap.
 *
 * Access: superadmin allowlist only. Not tenant-scoped — the orchestrator
 * is a global engineering artifact, not per-tenant data. `requireAdmin`
 * reads cookies, so Next 16 auto-detects this route as dynamic.
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
  status: TaskStatus;
}

interface OrchestratorFile {
  tasks: OrchestratorTask[];
}

const ORCHESTRATOR_PATH = path.join(
  process.cwd(),
  ".claude",
  "squad",
  "orchestrator.json",
);

const NOT_FOUND_BODY = { error: "not found" } as const;

function notFound(): NextResponse {
  return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
}

async function readOrchestrator(): Promise<OrchestratorFile | null> {
  try {
    const raw = await readFile(ORCHESTRATOR_PATH, "utf8");
    return JSON.parse(raw) as OrchestratorFile;
  } catch {
    return null;
  }
}

/**
 * Gate callers behind NODE_ENV or an explicit allowlist. In dev/preview the
 * endpoint is open to any admin; in production it is only reachable by
 * usernames listed in `SQUAD_STATUS_ALLOWLIST` (comma separated).
 */
function isCallerAllowed(username: string): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  const raw = process.env.SQUAD_STATUS_ALLOWLIST ?? "";
  const allowlist = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  if (allowlist.length === 0) return false;
  return allowlist.includes(username.toLowerCase());
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) {
    // Mask 401/403 as 404 — the existence of this route is itself secret.
    return notFound();
  }

  if (!isCallerAllowed(auth.username)) {
    logger.warn("[squad-status] Caller outside allowlist", {
      username: auth.username,
      role: auth.role,
    });
    return notFound();
  }

  const data = await readOrchestrator();
  if (!data) {
    // 404 (not 503) to avoid an existence oracle for the orchestrator path.
    return notFound();
  }

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

  // Minimal task summary — task_id, status, module only. No titles, no files,
  // no assignees, no timestamps.
  const tasksSummary = data.tasks.map((t) => ({
    task_id: t.task_id,
    status: t.status,
    module: t.module,
  }));

  // Audit trail: record every successful caller.
  logger.info("[squad-status] Access granted", {
    username: auth.username,
    role: auth.role,
  });

  return NextResponse.json({
    ok: true,
    counts,
    total_tasks: data.tasks.length,
    tasks: tasksSummary,
  });
}
