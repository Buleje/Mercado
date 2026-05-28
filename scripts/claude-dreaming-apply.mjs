#!/usr/bin/env node
/**
 * claude-dreaming-apply — aplica el output del skill /dreaming.
 *
 * Lee `reorganized/CHANGES.md` y ejecuta los moves/merges propuestos.
 * Modos:
 *   --dry-run  (default) — imprime qué haría
 *   --apply              — ejecuta los moves
 *   --safe               — SOLO archivar (skip merges, skip overwrite MEMORY.md)
 *
 * Ubicación del memory dir es auto-detectada a partir del proyecto activo.
 * Backup automático antes de aplicar.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// Memory dir = ~/.claude/projects/<encoded-path>/memory/
const PROJ_NAME = PROJECT_ROOT.replace(/\//g, "-");
const MEMORY_DIR = path.join(
  process.env.HOME,
  ".claude",
  "projects",
  PROJ_NAME,
  "memory"
);

const REORG = path.join(MEMORY_DIR, "reorganized");
const args = process.argv.slice(2);
const mode = args.includes("--apply")
  ? "apply"
  : args.includes("--safe")
  ? "safe"
  : "dry-run";

console.log(`Mode: ${mode}`);
console.log(`Memory dir: ${MEMORY_DIR}`);
console.log(`Reorganized dir: ${REORG}`);

if (!fs.existsSync(REORG)) {
  console.error(`✗ No hay output de dreaming en ${REORG}`);
  console.error(`  Ejecutá /dreaming primero (genera CHANGES.md + MEMORY.md.next)`);
  process.exit(1);
}

const changesPath = path.join(REORG, "CHANGES.md");
if (!fs.existsSync(changesPath)) {
  console.error(`✗ Falta ${changesPath}`);
  process.exit(1);
}

const changes = fs.readFileSync(changesPath, "utf8");

// Parse: section heading determines target subdir, then collect filenames from rows
const moves = [];
const merges = [];
let currentSection = null;
let currentTarget = null;

const SECTION_RX = /^###\s+([A-Z])\.\s+(\w+)/;

for (const line of changes.split("\n")) {
  // Detect section start
  const sec = line.match(SECTION_RX);
  if (sec) {
    currentSection = sec[2].toUpperCase();
    if (currentSection === "STALE") currentTarget = "_archive/stale/";
    else if (currentSection === "NOISE") currentTarget = "_archive/sessions/";
    else if (currentSection === "DUPLICATE") currentTarget = null; // merges, no archive
    else currentTarget = "_archive/";
    continue;
  }

  // Detect table row with a .md filename in backticks
  // Format A: `file.md` | ARCHIVE → `_archive/stale/` | reason
  // Format C: `file.md` | reason  (target implied by section)
  // Format B: `file1.md` + `file2.md` | MERGE → target | reason
  const fileMatch = line.match(/^\|\s*`([^`]+\.md)`/);
  if (!fileMatch) continue;
  const file1 = fileMatch[1];

  // Check if it's a merge (two files)
  const mergeMatch = line.match(/^\|\s*`([^`]+\.md)`\s*\+\s*`([^`]+\.md)`/);
  if (mergeMatch && currentSection === "DUPLICATE") {
    merges.push({ files: [mergeMatch[1], mergeMatch[2]], reason: "duplicate-merge" });
    continue;
  }

  // Otherwise it's an archive move
  if (currentTarget) {
    // Avoid duplicates (header rows like "| Archivo | Razón |")
    if (file1 === "Archivos" || file1 === "Archivo" || moves.some((m) => m.file === file1)) continue;
    moves.push({ file: file1, target: currentTarget });
  }
}

console.log(`\nDetected ${moves.length} archive moves + ${merges.length} merges`);

if (mode === "dry-run") {
  console.log("\n[DRY-RUN] Would execute:");
  for (const m of moves.slice(0, 5)) {
    console.log(`  mv ${m.file} → ${m.target}`);
  }
  if (moves.length > 5) console.log(`  ... +${moves.length - 5} more moves`);
  for (const m of merges.slice(0, 3)) {
    console.log(`  merge ${m.files.join(" + ")}`);
  }
  if (merges.length > 3) console.log(`  ... +${merges.length - 3} more merges`);
  console.log("\nPara ejecutar:");
  console.log("  node scripts/claude-dreaming-apply.mjs --safe   (solo archive, sin merges)");
  console.log("  node scripts/claude-dreaming-apply.mjs --apply  (todo)");
  process.exit(0);
}

// APPLY MODE
// Backup primero
const ts = new Date().toISOString().slice(0, 10);
const backupDir = path.join(MEMORY_DIR, `.backup-pre-dreaming-${ts}`);
console.log(`\nCreating backup at ${backupDir}...`);
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  for (const f of fs.readdirSync(MEMORY_DIR)) {
    if (f.startsWith(".") || f === "reorganized") continue;
    const src = path.join(MEMORY_DIR, f);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(backupDir, f));
    }
  }
}
console.log(`✓ Backup done`);

// Archive moves
let applied = 0, skipped = 0;
for (const m of moves) {
  const src = path.join(MEMORY_DIR, m.file);
  if (!fs.existsSync(src)) {
    skipped++;
    continue;
  }
  // Determine target subdir
  let tgtDir;
  if (m.target.includes("_archive/sessions")) tgtDir = path.join(MEMORY_DIR, "_archive", "sessions");
  else if (m.target.includes("_archive/stale")) tgtDir = path.join(MEMORY_DIR, "_archive", "stale");
  else tgtDir = path.join(MEMORY_DIR, "_archive");
  fs.mkdirSync(tgtDir, { recursive: true });
  fs.renameSync(src, path.join(tgtDir, m.file));
  applied++;
}
console.log(`✓ Archive: ${applied} applied, ${skipped} skipped (file missing)`);

if (mode === "safe") {
  console.log(`\nSAFE mode: skip merges + skip MEMORY.md.next overwrite.`);
  console.log(`Brandon revisa los archivos en reorganized/ para decidir sobre merges.`);
  process.exit(0);
}

// Full apply: also overwrite MEMORY.md and install patterns
const memNext = path.join(REORG, "MEMORY.md.next");
if (fs.existsSync(memNext)) {
  fs.copyFileSync(memNext, path.join(MEMORY_DIR, "MEMORY.md"));
  console.log(`✓ MEMORY.md replaced with .next version`);
}

// Install pattern-memories
const patternsFile = path.join(REORG, "PATTERNS.md");
if (fs.existsSync(patternsFile)) {
  console.log(`! PATTERNS.md tiene contenido para instalar — revisión manual recomendada`);
}

console.log(`\n✓ Apply complete. Backup en ${backupDir}.`);
console.log(`Para rollback: cp ${backupDir}/* ${MEMORY_DIR}/`);
