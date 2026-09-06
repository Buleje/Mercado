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
    // 40ms truncaba el payload bajo carga → 1503 entradas "unknown" en el
    // jsonl. El hook corre async con timeout 2s; 1500ms deja margen.
    setTimeout(() => resolve(data), 1500);
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

/**
 * El payload de SubagentStop (verificado empíricamente 2026-06-29) NO trae tokens
 * ni duración: trae `agent_transcript_path` (el JSONL del subagente). Lo parseamos
 * para sacar tokens (input no-cacheado + cache_creation + output), tool_uses y
 * duración (timestamp último − primero). Best-effort: si falla, devolvemos null.
 */
function parseAgentTranscript(path) {
  try {
    if (!path || !existsSync(path)) return null;
    const lines = readFileSync(path, "utf-8").trim().split("\n");
    let tokensIn = 0;
    let tokensOut = 0;
    let toolUses = 0;
    let first = null;
    let last = null;
    for (const line of lines) {
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (o.timestamp) {
        last = o.timestamp;
        if (!first) first = o.timestamp;
      }
      const u = o.message?.usage;
      if (o.type === "assistant" && u) {
        // input_tokens = entrada nueva no-cacheada; cache_creation = tokens nuevos
        // escritos al cache (costo real). Excluimos cache_read (re-lecturas baratas)
        // para no inflar la métrica que /evolve usa para evaluar eficiencia.
        tokensIn += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        tokensOut += u.output_tokens || 0;
        if (Array.isArray(o.message.content)) {
          toolUses += o.message.content.filter((c) => c?.type === "tool_use").length;
        }
      }
    }
    const durationMs =
      first && last ? new Date(last).getTime() - new Date(first).getTime() : null;
    return { tokensIn, tokensOut, toolUses, durationMs };
  } catch {
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

  // El nombre del agente viene en `agent_type` (no `agent_name`). Los tokens/
  // duración se leen del transcript del subagente (no están en el payload).
  const tx = parseAgentTranscript(parsed.agent_transcript_path);

  const tokensIn = parsed.tokens_in ?? parsed.input_tokens ?? tx?.tokensIn ?? 0;
  const tokensOut = parsed.tokens_out ?? parsed.output_tokens ?? tx?.tokensOut ?? 0;
  const tokens = (tokensIn || 0) + (tokensOut || 0);
  const success =
    parsed.success ?? (parsed.stop_reason ? parsed.stop_reason === "completed" : null);
  // `agent_type` puede venir como string VACÍO (?? no cae al fallback con "")
  // → 95 líneas {"agent":""} en el jsonl + bucket "" en los agregados.
  const agent =
    [parsed.agent_type, parsed.agent_name, parsed.agent, parsed.subagent_type]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .find(Boolean) || "unknown";
  const durationMs = parsed.duration_ms ?? tx?.durationMs ?? null;
  const toolUses = parsed.tool_uses ?? tx?.toolUses ?? null;

  // Payload fantasma (sin nombre, sin transcript legible, sin tokens): descartar
  // la línea y dejar muestra del raw en el errors.log para diagnóstico.
  if (agent === "unknown" && !tx && !tokens && durationMs == null) {
    logErr("payload sin datos, línea descartada", raw.slice(0, 400));
    process.exit(0);
  }

  const entry = {
    ts: new Date().toISOString(),
    agent,
    id: parsed.agent_id ?? null,
    duration_ms: durationMs,
    tokens_in: tokensIn || null,
    tokens_out: tokensOut || null,
    tool_uses: toolUses,
    success,
  };

  // 1) JSONL append-only (rotación: >1MB → conservar últimas 1500 líneas)
  mkdirSync(metricsDir, { recursive: true });
  try {
    if (existsSync(jsonlFile)) {
      const prev = readFileSync(jsonlFile, "utf-8");
      if (prev.length > 1_000_000) {
        writeFileSync(
          jsonlFile,
          prev.trim().split("\n").slice(-1500).join("\n") + "\n",
          "utf-8",
        );
      }
    }
  } catch (err) {
    logErr("rotate jsonl", err);
  }
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
