#!/usr/bin/env node
/**
 * skill-usage-telemetry — registra cada invocación de skill a .skill-usage.jsonl.
 *
 * Triggers en PostToolUse, matcher Skill.
 *
 * Cada línea es un evento:
 *   { t: <ms>, skill: "<name>", trigger: "manual|auto" }
 *
 * Usos:
 *   - pre-compact-skill-suggester lo lee para ranking
 *   - dreaming lo usa para decidir qué archivar
 *   - agent-report dashboard
 *
 * Non-blocking siempre.
 */
import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const TELEMETRY_FILE = path.join(PROJECT_ROOT, ".claude", ".skill-usage.jsonl");
const MAX_BYTES = 1_000_000; // 1MB, rotar si crece más

function readPayload() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(TELEMETRY_FILE)) return;
    const st = fs.statSync(TELEMETRY_FILE);
    if (st.size < MAX_BYTES) return;
    const backup = TELEMETRY_FILE + ".1";
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    fs.renameSync(TELEMETRY_FILE, backup);
  } catch {}
}

function appendEvent(rec) {
  try {
    fs.mkdirSync(path.dirname(TELEMETRY_FILE), { recursive: true });
    fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(rec) + "\n");
  } catch {}
}

function main() {
  const payload = readPayload();
  if (!payload) process.exit(0);

  const tool = payload.tool_name || "";
  if (tool !== "Skill") process.exit(0);

  const ti = payload.tool_input || {};
  const skill = ti.skill || ti.name || "unknown";
  const args = ti.args || ti.arguments || "";

  rotateIfNeeded();

  appendEvent({
    t: Date.now(),
    skill,
    args: args ? String(args).slice(0, 80) : null,
    trigger: "skill-tool",
  });

  process.exit(0);
}

try {
  main();
} catch {
  process.exit(0);
}
