#!/usr/bin/env node
/**
 * stop-checkpoint.mjs v2 — AUTO-LEARN + SESSION SAVE (Stop hook, async)
 *
 * Al terminar cada turn de Claude:
 * 1. Guarda checkpoint de archivos dirty (v1)
 * 2. NEW: Auto-captura metricas de la sesion para compound-learning
 * 3. NEW: Detecta patrones repetidos en los ultimos commits
 * 4. NEW: Actualiza evolution-log.json con stats del turn
 * 5. NEW: Guarda session-state.json para handoff
 *
 * Async → no afecta latencia. Silent failures.
 */
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const projectRoot =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.BSM_PROJECT_ROOT ||
  process.cwd();

function runGit(cmd) {
  try {
    return execSync(`git -C "${projectRoot}" ${cmd}`, {
      encoding: "utf8",
      timeout: 3_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function readJSON(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJSON(path, data) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
  } catch { /* silent */ }
}

// ── 1. Git status (original v1) ──────────────────────────────────
const branch = runGit("branch --show-current") || "unknown";
const statusPorcelain = runGit("status --porcelain");
const dirtyLines = statusPorcelain
  ? statusPorcelain.split("\n").filter((l) => l.trim())
  : [];

const staged = dirtyLines.filter((l) => /^[AMDR]/.test(l)).length;
const unstaged = dirtyLines.filter((l) => /^.[MD]/.test(l)).length;
const untracked = dirtyLines.filter((l) => l.startsWith("??")).length;

// Save checkpoint (v1 behavior)
const checkpoint = {
  timestamp: new Date().toISOString(),
  branch,
  staged,
  unstaged,
  untracked,
  totalDirty: dirtyLines.length,
  sample: dirtyLines.slice(0, 10),
};

writeJSON(join(projectRoot, ".claude/.last-stop-checkpoint.json"), checkpoint);

// ── 2. Auto-capture session metrics ──────────────────────────────
const recentCommits = runGit("log --oneline -10 --since='8 hours ago'");
const commitCount = recentCommits ? recentCommits.split("\n").filter(l => l.trim()).length : 0;

// Detect file patterns from recent commits
const filesChanged = runGit("log --name-only --oneline -10 --since='8 hours ago'");
const fileFrequency = {};
if (filesChanged) {
  filesChanged.split("\n").forEach(line => {
    if (line && !line.match(/^[a-f0-9]{7,}/)) { // skip commit hash lines
      const file = line.trim();
      if (file) fileFrequency[file] = (fileFrequency[file] || 0) + 1;
    }
  });
}

// Find files edited 3+ times (candidate for compound-learning)
const hotFiles = Object.entries(fileFrequency)
  .filter(([, count]) => count >= 3)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

// ── 3. Update learning patterns ──────────────────────────────────
const patternsPath = join(projectRoot, ".claude/learning/patterns.json");
// Fallback robusto por-array (mismo fix que auto-learn.mjs): patterns.json puede
// existir pero estar parcial → readJSON devuelve objeto truthy sin `.patterns` →
// `.push`/`.find` sobre undefined. Garantizamos la array explícitamente.
const rawPatterns = readJSON(patternsPath) || {};
const patterns = {
  patterns: Array.isArray(rawPatterns.patterns) ? rawPatterns.patterns : [],
  totalScanned: rawPatterns.totalScanned ?? 0,
  totalLearned: rawPatterns.totalLearned ?? 0,
  lastScan: rawPatterns.lastScan ?? null,
};

if (hotFiles.length > 0) {
  hotFiles.forEach(([file, count]) => {
    // Check if pattern already exists
    const existing = patterns.patterns.find(p =>
      p.type === "hot_file" && p.files && p.files.includes(file)
    );
    if (!existing) {
      patterns.patterns.push({
        id: `pat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "hot_file",
        files: [file],
        occurrences: count,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        artifactGenerated: null,
        status: "detected"
      });
      patterns.totalLearned++;
    } else {
      existing.occurrences += count;
      existing.lastSeen = new Date().toISOString();
    }
  });
  patterns.totalScanned++;
  patterns.lastScan = new Date().toISOString();
  writeJSON(patternsPath, patterns);
}

// ── 4. Update session state for handoff ──────────────────────────
const sessionStatePath = join(projectRoot, ".claude/session-state.json");
const existingState = readJSON(sessionStatePath) || {};

const sessionState = {
  ...existingState,
  timestamp: new Date().toISOString(),
  branch,
  commitsThisSession: commitCount,
  filesUncommitted: dirtyLines.length,
  hotFilesDetected: hotFiles.map(([f, c]) => ({ file: f, edits: c })),
  patternsActive: patterns.patterns.filter(p => p.status !== "resolved").length,
  lastUpdated: new Date().toISOString()
};

writeJSON(sessionStatePath, sessionState);

// ── 5. Output ────────────────────────────────────────────────────
const messageParts = [];

if (dirtyLines.length > 0) {
  messageParts.push(
    `📸 ${dirtyLines.length} archivos sin commitear en \`${branch}\` (staged=${staged}, unstaged=${unstaged}, untracked=${untracked}).`
  );
}

if (commitCount > 0) {
  messageParts.push(`📊 ${commitCount} commits en esta sesion.`);
}

if (hotFiles.length > 0) {
  messageParts.push(
    `🧬 Patrones detectados: ${hotFiles.map(([f, c]) => `${f}(${c}x)`).join(", ")} — candidatos para compound-learning.`
  );
}

messageParts.push("💾 Session state guardado para handoff.");

const response = {
  continue: true,
  suppressOutput: false,
  systemMessage: messageParts.join(" "),
};

process.stdout.write(JSON.stringify(response));
process.exit(0);
