#!/usr/bin/env node
/**
 * post-edit-rubric-check — auto-corre la rubric correspondiente al archivo
 * editado y emite WARNING si fallan criterios CRITICAL.
 *
 * Triggers en Edit/Write/MultiEdit sobre:
 *   - app/api/**\/route.ts       → .claude/rubrics/api-endpoint.json
 *   - lib/db/**\/*.db.ts         → .claude/rubrics/db-class.json
 *   - prisma/migrations/**       → .claude/rubrics/prisma-migration.json
 *   - components/**\/*.tsx       → .claude/rubrics/ui-component.json
 *
 * Severity: WARNING (non-blocking).
 * Solo corre checks de weight=critical para performance.
 * Output al stderr para que el agente lo lea en el próximo turno.
 *
 * Diseño:
 * - Debounce 3s (no spamea en edits rápidos consecutivos)
 * - Skip si el archivo no existe (delete)
 * - Skip tests/stories
 * - Timeout 5s total
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const RUBRICS_DIR = path.join(PROJECT_ROOT, ".claude", "rubrics");
const DEBOUNCE_FILE = "/tmp/bsm-rubric-check-debounce";
const DEBOUNCE_MS = 3000;

const RUBRIC_ROUTES = [
  { rubric: "api-endpoint.json",     match: /^app\/api\/.*\/route\.ts$/ },
  { rubric: "db-class.json",          match: /^lib\/db\/.*\.db\.ts$/ },
  { rubric: "prisma-migration.json",  match: /^prisma\/migrations\/.*\/migration\.sql$/ },
  { rubric: "ui-component.json",      match: /^components\/.*\.tsx$/ },
];

const SKIP_FILES = [
  /\.test\.(t|j)sx?$/,
  /\.spec\.(t|j)sx?$/,
  /\.stories\.tsx?$/,
  /\.d\.ts$/,
];

function debouncePassed() {
  try {
    const last = parseInt(fs.readFileSync(DEBOUNCE_FILE, "utf8"), 10);
    if (Date.now() - last < DEBOUNCE_MS) return false;
  } catch {}
  fs.writeFileSync(DEBOUNCE_FILE, String(Date.now()));
  return true;
}

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractFilePath(payload) {
  const ti = payload?.tool_input || {};
  return ti.file_path || ti.notebook_path || null;
}

function pickRubric(relPath) {
  for (const route of RUBRIC_ROUTES) {
    if (route.match.test(relPath)) return route.rubric;
  }
  return null;
}

function runCriticalChecks(rubricPath, absFilePath) {
  const rubric = JSON.parse(fs.readFileSync(rubricPath, "utf8"));
  const critical = rubric.criteria.filter((c) => c.weight === "critical");
  const failed = [];

  for (const c of critical) {
    try {
      const cmd = c.check_bash.replace(/\$FILE/g, JSON.stringify(absFilePath));
      execSync(cmd, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: "/bin/bash",
        timeout: 1500,
      });
      // exit 0 = passed
    } catch (err) {
      failed.push({ id: c.id, msg: c.fail_msg });
    }
  }

  return { rubric: rubric.name, total: critical.length, failed };
}

function main() {
  const payload = readHookPayload();
  if (!payload) process.exit(0);

  const tool = payload.tool_name || "";
  if (!["Edit", "Write", "MultiEdit"].includes(tool)) process.exit(0);

  const absFile = extractFilePath(payload);
  if (!absFile) process.exit(0);

  // Skip if file deleted
  if (!fs.existsSync(absFile)) process.exit(0);

  const relPath = path.relative(PROJECT_ROOT, absFile);
  if (relPath.startsWith("..")) process.exit(0); // fuera del proyecto

  if (SKIP_FILES.some((rx) => rx.test(relPath))) process.exit(0);

  const rubricFile = pickRubric(relPath);
  if (!rubricFile) process.exit(0);

  if (!debouncePassed()) process.exit(0);

  const rubricPath = path.join(RUBRICS_DIR, rubricFile);
  if (!fs.existsSync(rubricPath)) process.exit(0);

  const { rubric, total, failed } = runCriticalChecks(rubricPath, absFile);

  if (failed.length === 0) process.exit(0);

  // Emit warning to stderr (Claude reads this in next turn)
  const lines = [
    "",
    `⚠️  Rubric check FAIL (${failed.length}/${total} critical) en ${relPath}`,
    `   Rubric: ${rubric}`,
    ...failed.map((f) => `   ✗ ${f.id}: ${f.msg}`),
    `   Fix: ver .claude/rubrics/${rubricFile} o correr /outcome-evaluator`,
    "",
  ];
  console.error(lines.join("\n"));
  process.exit(0); // non-blocking
}

try {
  main();
} catch (err) {
  // Silencioso para no romper edits
  process.exit(0);
}
