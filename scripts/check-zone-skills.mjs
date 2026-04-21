#!/usr/bin/env node
/**
 * check-zone-skills — verifica que todas las danger zones del hook
 * `.claude/hooks/danger-zone.mjs` tengan su skill correspondiente en
 * `.github/instructions/<skill>.instructions.md`.
 *
 * Uso:
 *   node scripts/check-zone-skills.mjs
 *   npm run dev:dangers:check   (si cableado en package.json)
 *
 * Exit codes:
 *   0 — OK, todos los skills existen
 *   1 — ERROR, falta al menos un skill
 *
 * Pensado para usar en CI + como paso opcional de pre-commit.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const HOOK = join(process.cwd(), ".claude", "hooks", "danger-zone.mjs");
const SKILLS_DIR = join(process.cwd(), ".github", "instructions");

function extractSkills(src) {
  const skills = new Set();
  const rx = /skill:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = rx.exec(src)) !== null) {
    skills.add(m[1]);
  }
  return [...skills];
}

let src;
try {
  src = readFileSync(HOOK, "utf8");
} catch (err) {
  console.error(`check-zone-skills: no pude leer ${HOOK}:`, err.message);
  process.exit(1);
}

const skills = extractSkills(src);
if (skills.length === 0) {
  console.log("check-zone-skills: el hook no declara ningún skill. OK.");
  process.exit(0);
}

const missing = [];
const present = [];
for (const skill of skills) {
  const file = join(SKILLS_DIR, `${skill}.instructions.md`);
  if (existsSync(file)) present.push(skill);
  else missing.push({ skill, expected: file });
}

console.log(`check-zone-skills — ${skills.length} skill(s) declarado(s):`);
for (const s of present) console.log(`  ✅ ${s}.instructions.md`);
for (const m of missing) console.log(`  ❌ ${m.skill}.instructions.md  (falta: ${m.expected})`);

if (missing.length > 0) {
  console.error(
    `\nFAIL: ${missing.length} skill(s) sin documentación. Crea los archivos o elimina la referencia en .claude/hooks/danger-zone.mjs.`,
  );
  process.exit(1);
}

console.log("\nOK: todos los skills están documentados.");
process.exit(0);
