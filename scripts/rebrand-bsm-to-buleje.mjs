#!/usr/bin/env node
/**
 * Rebrand script — reemplaza "Bodega San Martín" / "Bodega San Martin" / "BSM"
 * por "Buleje" en todo el proyecto. Idempotente y safe (exclude binarios + lockfiles).
 *
 * Uso: node scripts/rebrand-bsm-to-buleje.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  "lib/generated",
  "playwright-report",
  "test-results",
  ".claude/agents-dashboard",
  ".vercel",
  ".superpowers",
]);

const EXCLUDE_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
]);

const EXCLUDE_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".pdf", ".zip", ".gz", ".tar", ".woff", ".woff2", ".ttf",
  ".mp4", ".mp3", ".wav", ".mov",
]);

const REPLACEMENTS = [
  // Order matters: longest first
  { from: /Bodega San Martín/g, to: "Buleje" },
  { from: /Bodega San Martin/g, to: "Buleje" },
  // BSM is tricky — only replace when it's a standalone token (word boundary)
  // to avoid matching "BSM_SOMETHING" accidentally. But we DO want SKU like
  // `BSM-123` → `BULEJE-123`. Use (?<![A-Z0-9_]) and (?![A-Z0-9_]) lookbehinds
  // but preserve alphanumeric boundaries — use \b.
  { from: /\bBSM\b/g, to: "Buleje" },
];

let totalFiles = 0;
let totalReplacements = 0;

function walk(dir, relative = "") {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const rel = relative ? `${relative}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name) || EXCLUDE_DIRS.has(rel)) continue;
      walk(fullPath, rel);
      continue;
    }

    if (!entry.isFile()) continue;
    if (EXCLUDE_FILES.has(entry.name)) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (EXCLUDE_EXT.has(ext)) continue;

    // Skip this script itself
    if (rel === "scripts/rebrand-bsm-to-buleje.mjs") continue;

    let content;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }

    // Skip binary-ish files
    if (content.includes("\0")) continue;

    let newContent = content;
    let fileReplacements = 0;
    for (const { from, to } of REPLACEMENTS) {
      const matches = newContent.match(from);
      if (matches) {
        fileReplacements += matches.length;
        newContent = newContent.replace(from, to);
      }
    }

    if (fileReplacements > 0) {
      fs.writeFileSync(fullPath, newContent, "utf8");
      totalFiles += 1;
      totalReplacements += fileReplacements;
      console.log(`  ${rel}: ${fileReplacements} replacement(s)`);
    }
  }
}

console.log("🎨 Rebranding Bodega San Martín / BSM → Buleje");
console.log(`Root: ${ROOT}\n`);
walk(ROOT);
console.log(`\n✓ ${totalFiles} files modified, ${totalReplacements} total replacements.`);
