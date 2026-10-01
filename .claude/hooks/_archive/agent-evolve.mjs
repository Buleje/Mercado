#!/usr/bin/env node
/**
 * agent-evolve.mjs — Self-evolving agent prompts.
 *
 * Analyzes metrics to suggest improvements to agent system prompts.
 * Run periodically or after each sprint:
 *   node .claude/hooks/agent-evolve.mjs
 *
 * Reads: .claude/hub-metrics/metrics.json
 * Outputs: Suggested prompt improvements for each agent
 *
 * Does NOT auto-modify agents — outputs suggestions for Director to review.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT = resolve(
  process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  "bodega-san-martin"
);
const METRICS_FILE = resolve(PROJECT, ".claude/hub-metrics/metrics.json");

if (!existsSync(METRICS_FILE)) {
  console.log(JSON.stringify({ status: "no_data", suggestions: [] }));
  process.exit(0);
}

const metrics = JSON.parse(readFileSync(METRICS_FILE, "utf8"));
const suggestions = [];

// Analyze agent performance
for (const [name, agent] of Object.entries(metrics.agents || {})) {
  const errorRate = agent.tasks > 0 ? agent.errors / agent.tasks : 0;
  const avgTokens = agent.tasks > 0 ? agent.tokens / agent.tasks : 0;

  // High error rate → suggest adding specific rules
  if (errorRate > 0.3 && agent.tasks >= 3) {
    suggestions.push({
      agent: name,
      type: "add_rule",
      priority: "high",
      suggestion: `Agent ${name} has ${Math.round(errorRate * 100)}% error rate. Review learnings and add preventive rules to ${name}.agent.md`,
    });
  }

  // Very high token usage → suggest context reduction
  if (avgTokens > 30000 && agent.tasks >= 2) {
    suggestions.push({
      agent: name,
      type: "reduce_context",
      priority: "medium",
      suggestion: `Agent ${name} averages ${Math.round(avgTokens / 1000)}K tokens/task. Consider: narrower scope, pre-loaded context, or splitting into smaller tasks`,
    });
  }

  // Very low token usage → suggest downgrade to Haiku
  if (avgTokens < 5000 && avgTokens > 0 && agent.tasks >= 3) {
    suggestions.push({
      agent: name,
      type: "model_downgrade",
      priority: "low",
      suggestion: `Agent ${name} averages only ${Math.round(avgTokens / 1000)}K tokens/task. Consider Haiku model for cost savings`,
    });
  }
}

// Analyze hub gate pass rates
for (const [hub, data] of Object.entries(metrics.hubs || {})) {
  if (data.gate_total >= 3) {
    const gateRate = data.gate_pass / data.gate_total;
    if (gateRate < 0.7) {
      suggestions.push({
        agent: `hub-${hub}`,
        type: "gate_improvement",
        priority: "high",
        suggestion: `Hub ${hub.toUpperCase()} gate pass rate is ${Math.round(gateRate * 100)}%. Add pre-checks or healer integration`,
      });
    }
  }
}

// Analyze learnings for patterns
for (const [hub, learnings] of Object.entries(metrics.learnings || {})) {
  if (learnings.length >= 3) {
    // Find repeated error patterns
    const errorCounts = {};
    for (const l of learnings) {
      const key = l.error?.substring(0, 50) || "unknown";
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
    for (const [pattern, count] of Object.entries(errorCounts)) {
      if (count >= 2) {
        suggestions.push({
          agent: `hub-${hub}`,
          type: "recurring_error",
          priority: "high",
          suggestion: `Recurring error in ${hub.toUpperCase()} (${count}x): "${pattern}". Add explicit prevention rule to relevant agent`,
        });
      }
    }
  }
}

const output = {
  status: suggestions.length > 0 ? "improvements_found" : "all_optimal",
  timestamp: new Date().toISOString(),
  total_suggestions: suggestions.length,
  suggestions: suggestions.sort((a, b) => {
    const pri = { high: 0, medium: 1, low: 2 };
    return (pri[a.priority] || 2) - (pri[b.priority] || 2);
  }),
};

console.log(JSON.stringify(output, null, 2));
