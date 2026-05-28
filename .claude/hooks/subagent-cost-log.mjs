#!/usr/bin/env node
/**
 * SubagentStop hook — appendea linea JSON por agente terminado al log
 * de metricas Y agrega totales en agent-metrics.json para que skills
 * como /agent-report y /evolve consuman data real.
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
 * Outputs:
 *   1) Append a .claude/metrics/agents.jsonl (live stream, append-only)
 *   2) Update .claude/agent-metrics.json (aggregated totals consumed by skills)
 *
 * Budget: <50ms. Errors loggeados a .claude/metrics/cost-log.errors.log
 * para diagnostico (NO silent — el silent fue lo que rompio la telemetria).
 */

import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const metricsDir = join(projectDir, ".claude", "metrics");
const jsonlFile = join(metricsDir, "agents.jsonl");
const aggFile = join(projectDir, ".claude", "agent-metrics.json");
const errFile = join(metricsDir, "cost-log.errors.log");

function logErr(msg, err) {
  try {
    mkdirSync(metricsDir, { recursive: true });
    appendFileSync(
      errFile,
      `${new Date().toISOString()} ${msg}: ${String(err?.stack ?? err ?? "")}\n`,
      "utf-8",
    );
  } catch {
    /* last-resort no-op */
  }
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 40);
  });
}

function readAgg() {
  if (!existsSync(aggFile)) {
    return {
      _comment:
        "Auto-populated by subagent-cost-log.mjs. Consumed by /agent-report and /evolve.",
      version: 1,
      startedTracking: new Date().toISOString().slice(0, 10),
      agents: {},
      sessions: [],
      totals: {
        totalDispatches: 0,
        totalTokens: 0,
        totalSuccesses: 0,
        totalFailures: 0,
      },
    };
  }
  try {
    return JSON.parse(readFileSync(aggFile, "utf-8"));
  } catch (err) {
    logErr("readAgg parse failed, reinitializing", err);
    return null;
  }
}

try {
  const raw = await readStdin();
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* parsed stays {} */
  }

  const tokensIn = parsed.tokens_in ?? parsed.input_tokens ?? 0;
  const tokensOut = parsed.tokens_out ?? parsed.output_tokens ?? 0;
  const tokens = (tokensIn || 0) + (tokensOut || 0);
  const success = parsed.success ?? null;
  const agent = parsed.agent_name ?? parsed.agent ?? "unknown";
  const durationMs = parsed.duration_ms ?? null;

  const entry = {
    ts: new Date().toISOString(),
    agent,
    id: parsed.agent_id ?? null,
    duration_ms: durationMs,
    tokens_in: tokensIn || null,
    tokens_out: tokensOut || null,
    tool_uses: parsed.tool_uses ?? null,
    success,
  };

  // 1) JSONL append-only
  mkdirSync(metricsDir, { recursive: true });
  appendFileSync(jsonlFile, JSON.stringify(entry) + "\n", "utf-8");

  // 2) Aggregated JSON for skills
  const agg = readAgg() ?? {
    version: 1,
    startedTracking: new Date().toISOString().slice(0, 10),
    agents: {},
    sessions: [],
    totals: {
      totalDispatches: 0,
      totalTokens: 0,
      totalSuccesses: 0,
      totalFailures: 0,
    },
  };

  if (!agg.agents) agg.agents = {};
  if (!agg.totals) {
    agg.totals = {
      totalDispatches: 0,
      totalTokens: 0,
      totalSuccesses: 0,
      totalFailures: 0,
    };
  }
  if (!agg.agents[agent]) {
    agg.agents[agent] = {
      dispatches: 0,
      tokens: 0,
      successes: 0,
      failures: 0,
      avgDurationMs: 0,
      lastSeen: null,
    };
  }
  const a = agg.agents[agent];
  a.dispatches += 1;
  a.tokens += tokens;
  if (success === true) a.successes += 1;
  if (success === false) a.failures += 1;
  if (durationMs != null) {
    a.avgDurationMs = Math.round(
      (a.avgDurationMs * (a.dispatches - 1) + durationMs) / a.dispatches,
    );
  }
  a.lastSeen = entry.ts;

  agg.totals.totalDispatches += 1;
  agg.totals.totalTokens += tokens;
  if (success === true) agg.totals.totalSuccesses += 1;
  if (success === false) agg.totals.totalFailures += 1;

  mkdirSync(dirname(aggFile), { recursive: true });
  writeFileSync(aggFile, JSON.stringify(agg, null, 2), "utf-8");
} catch (err) {
  logErr("subagent-cost-log fatal", err);
}
process.exit(0);
