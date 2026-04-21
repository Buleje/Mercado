#!/usr/bin/env node
/**
 * list-danger-zones — lista archivos marcados como zona de peligro por el
 * hook `.claude/hooks/danger-zone.mjs`. Útil para onboarding y awareness
 * antes de un refactor.
 *
 * Uso:
 *   npm run dev:dangers
 *
 * Salida: tabla con path, skill requerido, último commit.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const HOOK = join(process.cwd(), ".claude", "hooks", "danger-zone.mjs");

function lastCommit(file) {
  try {
    return execSync(`git log -1 --format="%h %s" -- ${file}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "(no git history)";
  }
}

let src;
try {
  src = readFileSync(HOOK, "utf8");
} catch {
  console.error("dev:dangers: no pude leer", HOOK);
  process.exit(1);
}

// Extrae entries del shape real del hook:
//   { pattern: /regex/, skill: '...', label: '...', agent: '...', reason: '...' }
const entries = [];
const rx = /\{\s*pattern:\s*\/([^/]+)\/\s*,\s*skill:\s*['"]([^'"]+)['"]\s*,\s*label:\s*['"]([^'"]+)['"]/g;
let m;
while ((m = rx.exec(src)) !== null) {
  entries.push({ path: m[1].replace(/\\\./g, ".").replace(/\\\//g, "/"), skill: m[2], description: m[3] });
}

if (entries.length === 0) {
  console.log("dev:dangers: no danger zones encontradas en danger-zone.mjs.");
  process.exit(0);
}

const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
console.log(
  `\ndev:dangers — ${entries.length} zona(s) de peligro:\n`,
);
console.log(
  `${pad("FILE", 42)} ${pad("SKILL", 22)} LAST COMMIT`,
);
console.log(`${"".padEnd(42, "-")} ${"".padEnd(22, "-")} ${"".padEnd(40, "-")}`);

for (const e of entries) {
  const commit = lastCommit(e.path);
  console.log(`${pad(e.path, 42)} ${pad(e.skill, 22)} ${commit}`);
}

console.log(
  `\nPara editar cualquiera, lee primero el skill en .github/instructions/<skill>.instructions.md\n`,
);
