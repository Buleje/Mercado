#!/usr/bin/env node
/**
 * SubagentStop hook — appendea linea JSON por agente terminado al log
 * de metricas. Permite que el skill `agent-report` / `finops-guard`
 * calcule costos y rendimiento por agente en tiempo real.
 *
 * Input stdin JSON (Claude Code provee):
 *   {
 *     "agent_name": "Explore",
 *     "agent_id": "...",
 *     "duration_ms": 12345,
 *     "tokens_in": 1234,
 *     "tokens_out": 456,
 *     "tool_uses": 7,
 *     "success": true
 *   }
 *
 * Output: exit 0 siempre. Append a .claude/metrics/agents.jsonl.
 * Budget: <50ms.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const outFile = join(projectDir, ".claude", "metrics", "agents.jsonl");

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 40);
  });
}

try {
  const raw = await readStdin();
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    // no-op, parsed stays {}
  }

  const entry = {
    ts: new Date().toISOString(),
    agent: parsed.agent_name ?? parsed.agent ?? "unknown",
    id: parsed.agent_id ?? null,
    duration_ms: parsed.duration_ms ?? null,
    tokens_in: parsed.tokens_in ?? parsed.input_tokens ?? null,
    tokens_out: parsed.tokens_out ?? parsed.output_tokens ?? null,
    tool_uses: parsed.tool_uses ?? null,
    success: parsed.success ?? null,
  };

  mkdirSync(join(projectDir, ".claude", "metrics"), { recursive: true });
  appendFileSync(outFile, JSON.stringify(entry) + "\n", "utf-8");
} catch {
  // never block
}
process.exit(0);
