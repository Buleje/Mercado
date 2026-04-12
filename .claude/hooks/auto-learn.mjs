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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const projectRoot =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.BSM_PROJECT_ROOT ||
  process.cwd();

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

try {
  const input = readFileSync(process.stdin.fd, "utf8");
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
  let editLog = readJSON(logPath) || {
    edits: [],
    sessionEdits: [],
    coEditClusters: [],
    lastUpdated: null
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
    let patterns = readJSON(patternsPath) || {
      patterns: [],
      totalScanned: 0,
      totalLearned: 0,
      lastScan: null
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

} catch {
  // Silent — never break the flow
}

process.exit(0);
