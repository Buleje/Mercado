#!/usr/bin/env node
/**
 * auto-learn.mjs — PostToolUse hook (async, matcher: Edit|Write|MultiEdit)
 *
 * REAL auto-learning hook that fires after EVERY file edit.
 * Tracks which files get edited, detects co-edit patterns,
 * and auto-updates the learning system.
 *
 * This is what makes the system get SMARTER every session automatically.
 *
 * Data flows:
 *   Edit event → track in edit-log.json → detect co-edits →
 *   update patterns.json → compound-learning reads patterns →
 *   generates new skills/hooks → system improves
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const projectRoot =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.BSM_PROJECT_ROOT ||
  process.cwd();

const errLogPath = join(projectRoot, ".claude/learning/auto-learn.errors.log");

function logErr(scope, err) {
  try {
    mkdirSync(dirname(errLogPath), { recursive: true });
    appendFileSync(
      errLogPath,
      `${new Date().toISOString()} [${scope}] ${String(err?.stack ?? err ?? "unknown")}\n`,
      "utf-8",
    );
  } catch {
    /* last-resort no-op */
  }
}

function readJSON(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    logErr(`readJSON ${path}`, err);
    return null;
  }
}

function writeJSON(path, data) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    logErr(`writeJSON ${path}`, err);
  }
}

function readStdinSync() {
  // WSL deja stdin no-bloqueante bajo ráfagas de edits → readFileSync tira
  // EAGAIN (672 errores acumulados). Retry con sleep bloqueante corto.
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return readFileSync(process.stdin.fd, "utf8");
    } catch (err) {
      if (err?.code !== "EAGAIN") throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  return "";
}

try {
  const input = readStdinSync();
  const event = JSON.parse(input);

  // Only process Edit/Write/MultiEdit
  const toolName = event.tool_name || "";
  if (!["Edit", "Write", "MultiEdit"].includes(toolName)) {
    process.exit(0);
  }

  const filePath = event.tool_input?.file_path || event.tool_input?.path || "";
  if (!filePath) {
    process.exit(0);
  }

  // Skip .claude/ infrastructure files (we don't learn from our own config)
  if (filePath.includes(".claude/") || filePath.includes("node_modules/")) {
    process.exit(0);
  }

  const fileName = basename(filePath);
  const relativePath = filePath.replace(projectRoot, "").replace(/\\/g, "/").replace(/^\//, "");

  // ── Track edit in edit-log ──────────────────────────────────
  const logPath = join(projectRoot, ".claude/learning/edit-log.json");
  // Fallback robusto por-array: edit-log.json puede existir pero estar parcial
  // o vacío ({}) → readJSON devuelve un objeto truthy sin las arrays, y el
  // antiguo `|| {default}` no aplicaba → `.push` sobre undefined (TypeError que
  // erroreaba en CADA edit). Garantizamos cada array explícitamente.
  const rawEditLog = readJSON(logPath) || {};
  const editLog = {
    edits: Array.isArray(rawEditLog.edits) ? rawEditLog.edits : [],
    sessionEdits: Array.isArray(rawEditLog.sessionEdits) ? rawEditLog.sessionEdits : [],
    coEditClusters: Array.isArray(rawEditLog.coEditClusters) ? rawEditLog.coEditClusters : [],
    lastUpdated: rawEditLog.lastUpdated ?? null,
  };

  const now = new Date().toISOString();
  const editEntry = {
    file: relativePath,
    timestamp: now,
    tool: toolName
  };

  // Add to session edits (last 100 only)
  editLog.sessionEdits.push(editEntry);
  if (editLog.sessionEdits.length > 100) {
    editLog.sessionEdits = editLog.sessionEdits.slice(-100);
  }

  // Add to historical edits (last 500 only)
  editLog.edits.push(editEntry);
  if (editLog.edits.length > 500) {
    editLog.edits = editLog.edits.slice(-500);
  }

  // ── Detect co-edit patterns ─────────────────────────────────
  // If 2 files are edited within 60 seconds of each other, they're co-edited
  const recentEdits = editLog.sessionEdits.filter(e => {
    const diff = new Date(now) - new Date(e.timestamp);
    return diff < 60_000 && diff > 0; // within 60 seconds
  });

  if (recentEdits.length >= 2) {
    const coEditFiles = [...new Set(recentEdits.map(e => e.file))];
    if (coEditFiles.length >= 2) {
      // Check if this cluster already exists
      const existingCluster = editLog.coEditClusters.find(c =>
        JSON.stringify(c.files.sort()) === JSON.stringify(coEditFiles.sort())
      );

      if (existingCluster) {
        existingCluster.count++;
        existingCluster.lastSeen = now;
      } else {
        editLog.coEditClusters.push({
          files: coEditFiles,
          count: 1,
          firstSeen: now,
          lastSeen: now
        });
      }
    }
  }

  // ── Promote strong co-edit patterns to learning/patterns.json ──
  const strongClusters = editLog.coEditClusters.filter(c => c.count >= 3);

  if (strongClusters.length > 0) {
    const patternsPath = join(projectRoot, ".claude/learning/patterns.json");
    const rawPatterns = readJSON(patternsPath) || {};
    const patterns = {
      patterns: Array.isArray(rawPatterns.patterns) ? rawPatterns.patterns : [],
      totalScanned: rawPatterns.totalScanned ?? 0,
      totalLearned: rawPatterns.totalLearned ?? 0,
      lastScan: rawPatterns.lastScan ?? null,
    };

    strongClusters.forEach(cluster => {
      const existing = patterns.patterns.find(p =>
        p.type === "co_edit_cluster" &&
        JSON.stringify((p.files || []).sort()) === JSON.stringify(cluster.files.sort())
      );

      if (!existing) {
        patterns.patterns.push({
          id: `pat-coedit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "co_edit_cluster",
          files: cluster.files,
          occurrences: cluster.count,
          firstSeen: cluster.firstSeen,
          lastSeen: cluster.lastSeen,
          artifactGenerated: null,
          status: "active",
          suggestedSkill: `Files [${cluster.files.join(", ")}] are always edited together. Consider creating a skill that pre-loads all ${cluster.files.length} files.`
        });
        patterns.totalLearned++;
      }
    });

    patterns.lastScan = now;
    writeJSON(patternsPath, patterns);
  }

  editLog.lastUpdated = now;
  writeJSON(logPath, editLog);

} catch (err) {
  logErr("main", err);
}

process.exit(0);
