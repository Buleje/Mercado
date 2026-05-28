#!/usr/bin/env node
/**
 * claude-validate — chequeo de salud de la infraestructura .claude/
 *
 * Valida:
 * 1. SKILL.md — frontmatter v2 (name, description, model/allowed-tools si user-invocable)
 * 2. .claude/hooks/*.mjs — sintaxis JS válida (node --check)
 * 3. .claude/rubrics/*.json — JSON válido + estructura mínima
 * 4. .claude/settings.json — referencias a hooks que existen
 *
 * Uso:
 *   node scripts/claude-validate.mjs
 *   node scripts/claude-validate.mjs --fix    (auto-fix lo trivial)
 *
 * Exit 0 = todo OK; exit 1 = errores; warnings no fallan.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SKILLS_DIR = path.join(ROOT, ".claude", "skills");
const HOOKS_DIR = path.join(ROOT, ".claude", "hooks");
const RUBRICS_DIR = path.join(ROOT, ".claude", "rubrics");
const SETTINGS = path.join(ROOT, ".claude", "settings.json");

let errors = 0;
let warnings = 0;
const issues = [];

function err(msg) { errors++; issues.push(`✗ ${msg}`); }
function warn(msg) { warnings++; issues.push(`! ${msg}`); }
function ok(msg) { /* silent */ }

// ---------- 1. SKILLS ----------
function validateSkills() {
  console.log("→ Validating skills...");
  const skills = fs.readdirSync(SKILLS_DIR).filter((d) => {
    if (d.startsWith("_") || d.startsWith(".")) return false;
    const p = path.join(SKILLS_DIR, d);
    return fs.statSync(p).isDirectory();
  });

  let count = 0;
  for (const sk of skills) {
    const f = path.join(SKILLS_DIR, sk, "SKILL.md");
    if (!fs.existsSync(f)) {
      err(`skill ${sk}: SKILL.md missing`);
      continue;
    }
    const content = fs.readFileSync(f, "utf8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      err(`skill ${sk}: no frontmatter`);
      continue;
    }
    const fm = fmMatch[1];
    if (!/^name:\s*\S/m.test(fm)) err(`skill ${sk}: missing 'name:'`);
    if (!/^description:/m.test(fm)) err(`skill ${sk}: missing 'description:'`);

    // v2 fields (warning level — not blocking, but flag)
    const isUserInvocable = /^user-invocable:\s*true/m.test(fm);
    if (isUserInvocable) {
      if (!/^model:/m.test(fm)) warn(`skill ${sk}: user-invocable but no 'model:' field`);
      if (!/^allowed-tools:/m.test(fm)) warn(`skill ${sk}: user-invocable but no 'allowed-tools:' field`);
    }
    count++;
  }
  console.log(`  ${count} skills checked`);
}

// ---------- 2. HOOKS ----------
function validateHooks() {
  console.log("→ Validating hooks...");
  if (!fs.existsSync(HOOKS_DIR)) return;
  const hooks = fs.readdirSync(HOOKS_DIR).filter((f) => f.endsWith(".mjs"));
  for (const h of hooks) {
    const p = path.join(HOOKS_DIR, h);
    try {
      execSync(`node --check ${JSON.stringify(p)}`, { stdio: "pipe" });
    } catch (e) {
      err(`hook ${h}: syntax error\n    ${(e.stderr || e.stdout || "").toString().split("\n")[0]}`);
    }
    // Warn if not executable
    try {
      fs.accessSync(p, fs.constants.X_OK);
    } catch {
      warn(`hook ${h}: not executable (chmod +x)`);
    }
  }
  console.log(`  ${hooks.length} hooks checked`);
}

// ---------- 3. RUBRICS ----------
function validateRubrics() {
  console.log("→ Validating rubrics...");
  if (!fs.existsSync(RUBRICS_DIR)) return;
  const rubrics = fs.readdirSync(RUBRICS_DIR).filter((f) => f.endsWith(".json"));
  for (const r of rubrics) {
    const p = path.join(RUBRICS_DIR, r);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      err(`rubric ${r}: invalid JSON — ${e.message.split("\n")[0]}`);
      continue;
    }
    if (!data.name) err(`rubric ${r}: missing 'name'`);
    if (!Array.isArray(data.criteria)) err(`rubric ${r}: 'criteria' must be array`);
    else {
      for (const c of data.criteria) {
        if (!c.id) err(`rubric ${r}: criterion missing 'id'`);
        if (!c.weight) err(`rubric ${r}: criterion ${c.id} missing 'weight'`);
        if (!c.check_bash) err(`rubric ${r}: criterion ${c.id} missing 'check_bash'`);
        if (!c.fail_msg) warn(`rubric ${r}: criterion ${c.id} missing 'fail_msg'`);
      }
    }
    if (!data.pass_threshold) warn(`rubric ${r}: missing 'pass_threshold'`);
  }
  console.log(`  ${rubrics.length} rubrics checked`);
}

// ---------- 4. SETTINGS HOOKS REFERENCES ----------
function validateSettingsHookRefs() {
  console.log("→ Validating settings.json hook refs...");
  if (!fs.existsSync(SETTINGS)) return;
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  } catch (e) {
    err(`settings.json: invalid JSON — ${e.message.split("\n")[0]}`);
    return;
  }
  const events = settings.hooks || {};
  let refCount = 0;
  for (const [evt, entries] of Object.entries(events)) {
    for (const entry of entries) {
      for (const hook of entry.hooks || []) {
        refCount++;
        const cmd = hook.command || "";
        const m = cmd.match(/\.claude\/hooks\/([\w\-]+\.mjs)/);
        if (m) {
          const f = path.join(HOOKS_DIR, m[1]);
          if (!fs.existsSync(f)) {
            err(`settings.json [${evt}]: refs hook ${m[1]} (not found)`);
          }
        }
      }
    }
  }
  console.log(`  ${refCount} hook refs checked`);
}

// ---------- RUN ----------
console.log("");
validateSkills();
validateHooks();
validateRubrics();
validateSettingsHookRefs();
console.log("");

if (issues.length === 0) {
  console.log("✅ .claude/ infrastructure: OK");
  process.exit(0);
}

for (const i of issues) console.log(i);
console.log("");
console.log(`Result: ${errors} errors, ${warnings} warnings`);
process.exit(errors > 0 ? 1 : 0);
