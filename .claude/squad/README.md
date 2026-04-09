# Squad — Autonomous Multi-Agent Environment

> Three Claude Code instances (Alpha, Beta, Gamma) work in parallel on the
> Bodega San Martin ERP, coordinating through a shared JSON brain.
> Created 2026-04-09.

## What is this

This directory contains everything needed to run an autonomous squad of three
specialized Claude Code instances that pick up tasks from a shared backlog,
implement them, and hand off between each other without stepping on each
other's toes.

The three roles are:

| Agent | Role | Responsibilities |
|---|---|---|
| **Alpha** | Architect Lead | ADRs, Prisma schema, domain interfaces, orchestrator.json health |
| **Beta** | Builder | API routes, DB classes, components, domain implementations |
| **Gamma** | QA + Security | Tests, e2e, security audit, coverage gates, final merge gate |

## Files in this directory

| File | Purpose |
|---|---|
| `orchestrator.json` | The shared brain. Tasks, agent registry, locked files, state machine |
| `agent_roles.md` | The three system prompts (Alpha, Beta, Gamma) + global rules |
| `start_squad.sh` | Launch all three agents as separate Warp / Windows Terminal tabs |
| `launch-alpha.sh` | Stand-alone launcher for Agent Alpha (used by start_squad.sh) |
| `launch-beta.sh` | Stand-alone launcher for Agent Beta |
| `launch-gamma.sh` | Stand-alone launcher for Agent Gamma |
| `monitor-dashboard.sh` | Live color-coded dashboard of the squad state |
| `.alpha.prompt` | Extracted Alpha system prompt (auto-generated, gitignored) |
| `.beta.prompt` | Extracted Beta system prompt (auto-generated, gitignored) |
| `.gamma.prompt` | Extracted Gamma system prompt (auto-generated, gitignored) |
| `events.log` | Append-only launch and coordination log |
| `logs/` | Per-run output from each agent in headless mode |

## Quick start

### Interactive mode (3 tabs)

```bash
cd .claude/squad
./start_squad.sh
```

This opens three tabs in Windows Terminal (or Warp / gnome-terminal / osascript)
and boots one Claude Code instance per tab, each with its role prompt appended
to the default system prompt. Each instance runs in `acceptEdits` permission
mode.

### Single agent

```bash
./start_squad.sh alpha    # launch only Alpha
./start_squad.sh beta     # launch only Beta
./start_squad.sh gamma    # launch only Gamma
```

### Dry run

```bash
./start_squad.sh --dry-run
```

Prints the launch commands without executing. Use this to verify the Warp / wt
detection and the per-agent launcher paths before spawning real processes.

### Headless mode (no GUI)

For environments without a GUI terminal (CI, sandbox, remote sessions), spawn
a single-run agent with `claude -p`:

```bash
cd bodega-san-martin
claude --print \
  --append-system-prompt "$(cat .claude/squad/.beta.prompt)" \
  --permission-mode bypassPermissions \
  --max-budget-usd 3 \
  --model claude-opus-4-6 \
  "MISSION: Claim and execute TASK-002 from .claude/squad/orchestrator.json. Flip to review and exit." \
  > .claude/squad/logs/beta-run1.log 2>&1 &
```

The `bypassPermissions` mode is required in headless runs because `claude -p`
cannot prompt interactively. Always set `--max-budget-usd` as a safety cap.

## Monitoring

### Live dashboard

```bash
./monitor-dashboard.sh           # refresh every 3s (default)
./monitor-dashboard.sh 10        # refresh every 10s
./monitor-dashboard.sh --once    # single snapshot
```

### Raw watchers

```bash
tail -f events.log
```

### API endpoint (from the admin panel)

```
GET /api/squad/status
```

Returns the full orchestrator state as JSON. Protected by `requireAdmin`.
Useful for building a React dashboard inside the admin app.

## Shared state protocol

### The orchestrator.json contract

```
tasks[]
  task_id          — stable identifier (TASK-001, TASK-002, ...)
  module           — bounded context (ai/persistence, checkout/discounts, ...)
  priority         — high | medium | low
  status           — pending | in_progress | review | done | blocked
  assigned_agent   — null | alpha | beta | gamma
  allowed_agents   — subset of [alpha, beta, gamma]
  dependencies     — list of task_ids that must be done first
  files_to_modify  — whitelist of paths the agent may touch
  acceptance_criteria — the Definition of Done for this task
  verification_commands — shell commands Gamma will run to validate
  work_log[]       — append-only log of actions taken
```

### Claim protocol

1. Agent reads `orchestrator.json`.
2. Agent finds a task with `status: "pending"` and its role in `allowed_agents`.
3. Agent writes `status: "in_progress"`, `assigned_agent: <role>`, `started_at: <now>`.
4. Agent saves the file.
5. If a second agent tries to claim the same task, the last writer wins — the
   loser picks another task.

### Locking protocol

1. Before editing a file, agent appends `{path, agent, since}` to
   `shared_state.locked_files`.
2. On finish, the agent removes its entries.
3. If a file the agent needs is already locked, it moves to another task.

### Review protocol

1. Beta finishes its task, flips `status` to `review`.
2. Gamma polls for `status: "review"` and picks the oldest first (FIFO).
3. Gamma writes `reviewed_by: "gamma"` and runs the `verification_commands`.
4. If verification passes, Gamma flips to `done` and sets `completed_at`.
5. If verification fails, Gamma writes `review_notes` and flips back to
   `in_progress` for Beta to address.

## State machine

```
pending ──claim──> in_progress ──finish──> review ──approve──> done
                       ^                       │
                       └──────reject───────────┘
```

Only Gamma can set `done`. Only Beta can go from `in_progress` to `review`.
Alpha can reset any task back to `pending` or split it into smaller tasks.

## Rules the agents must respect

All three agents inherit the rules from `CLAUDE.md` at the project root:

1. Never import Prisma directly — always go through `lib/db/*.db.ts`.
2. `tenantId` is the first parameter of every multi-tenant DB call.
3. Zod `safeParse()` only. Never `.parse()`.
4. Invalidate cache after writes (`invalidate(key)` or `invalidateByPrefix`).
5. No `dynamic = "force-dynamic"` — Next 16 auto-detects dynamic routes.
6. Never compute totals on the client. Server is the source of truth.
7. `requireAdmin(req, ["admin","cajero"])` with explicit roles on protected routes.
8. Raw SQL only with positional parameters (`$1`, `$2`).
9. Fire-and-forget tasks end with `.catch(() => {})`.
10. All code and comments in English. Status updates in Spanish.

See `CLAUDE.md` for the complete list.

## Adding a new task

Add a new entry under `tasks[]` in `orchestrator.json`:

```json
{
  "task_id": "TASK-006",
  "module": "inventory/declaration",
  "title": "Short description in English",
  "description": "One paragraph explaining the goal and any links to tech-debt or roadmap items",
  "priority": "high",
  "status": "pending",
  "assigned_agent": null,
  "allowed_agents": ["beta"],
  "dependencies": [],
  "files_to_modify": ["app/api/.../route.ts", "lib/db/....db.ts"],
  "acceptance_criteria": ["..."],
  "verification_commands": ["npx tsc --noEmit", "npm run test -- inventory"],
  "created_at": "2026-04-09T00:00:00Z",
  "started_at": null,
  "completed_at": null,
  "reviewed_by": null,
  "references": ["docs/TECH-DEBT.md#TD-XXX"]
}
```

Keep `task_id` globally unique. Alpha owns the backlog and may re-number or
split tasks that grow too big.

## Troubleshooting

### `wt` opens tabs but they close immediately

Windows Terminal may not find `bash` in the default path. The `launch-*.sh`
scripts use `#!/usr/bin/env bash` which requires bash to be reachable from the
subprocess spawned by wt. Fix by explicitly setting the shell in wt:

```bash
wt -w 0 nt -d "$PROJECT_ROOT" bash.exe -lc "./path/to/launch-beta.sh; exec bash"
```

### Claude CLI not found

The `claude` CLI must be in `PATH`. Install with:

```bash
npm i -g @anthropic-ai/claude-code
```

### Agents racing on orchestrator.json

If two agents write the file at the same time, the last writer wins. To reduce
races, use the `work_log` array instead of replacing fields — append-only
edits are less likely to collide. A proper file-locking wrapper is TODO.

### Headless agent hangs

`claude -p` waits for the model to finish before printing anything. Use
`--output-format stream-json` if you need incremental progress, or watch the
file system changes via `monitor-dashboard.sh`.

### Budget cap hit

Each headless run takes `--max-budget-usd` as a hard cap. If the agent exits
before finishing, check `logs/<agent>-run<n>.log` for a budget error, raise
the cap, and retry.

## Version history

| Date | Change |
|---|---|
| 2026-04-09 | Initial squad setup with 5 tasks. Alpha/Beta/Gamma roles defined. Headless launch verified with Beta on TASK-002. |
