#!/usr/bin/env node
/**
 * Merge Vercel env pull into .env.local preserving local-only vars.
 *
 * Strategy:
 *  1. Parse local .env.local → ordered list of (comment | kv) entries
 *  2. Parse .env.vercel.pull → dict of key→value (filtered)
 *  3. For each local kv: if key in Vercel dict → use Vercel value (report change)
 *  4. Append Vercel keys not in local at the end (skipping system/git vars)
 *  5. Write result to .env.local
 */
import fs from "node:fs";

const LOCAL = ".env.local";
const VERCEL = ".env.vercel.pull";

// System vars that shouldn't leak into local .env.local
const SKIP_KEYS = new Set([
  "VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_TARGET_ENV",
  "NX_DAEMON", "TURBO_CACHE", "TURBO_DOWNLOAD_LOCAL_ENABLED",
  "TURBO_REMOTE_ONLY", "TURBO_RUN_SUMMARY",
]);
const SKIP_PREFIXES = ["VERCEL_GIT_"];

function shouldSkip(key) {
  if (SKIP_KEYS.has(key)) return true;
  return SKIP_PREFIXES.some((p) => key.startsWith(p));
}

function parseEnvLine(line) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!m) return null;
  let [, key, value] = m;
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function parseEnvFile(path) {
  const content = fs.readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/);
  const entries = [];
  const keys = new Set();
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) {
      entries.push({ type: "raw", line });
      continue;
    }
    const parsed = parseEnvLine(line);
    if (parsed) {
      entries.push({ type: "kv", key: parsed.key, value: parsed.value });
      keys.add(parsed.key);
    } else {
      entries.push({ type: "raw", line });
    }
  }
  return { entries, keys };
}

const local = parseEnvFile(LOCAL);
const vercel = parseEnvFile(VERCEL);
const vercelDict = {};
for (const e of vercel.entries) {
  if (e.type === "kv" && !shouldSkip(e.key)) vercelDict[e.key] = e.value;
}

const changes = { updated: [], added: [], localOnly: [] };
const out = [];

for (const e of local.entries) {
  if (e.type === "raw") {
    out.push(e.line);
    continue;
  }
  if (vercelDict[e.key] !== undefined && vercelDict[e.key] !== e.value) {
    changes.updated.push({ key: e.key, from: e.value, to: vercelDict[e.key] });
    out.push(`${e.key}="${vercelDict[e.key]}"`);
  } else {
    if (vercelDict[e.key] === undefined) changes.localOnly.push(e.key);
    out.push(`${e.key}="${e.value}"`);
  }
}

// Append Vercel-only keys at the end
const vercelOnlyKeys = Object.keys(vercelDict).filter((k) => !local.keys.has(k));
if (vercelOnlyKeys.length > 0) {
  out.push("");
  out.push("# ── Added from Vercel pull ─────────────────────────────────────────");
  for (const k of vercelOnlyKeys) {
    out.push(`${k}="${vercelDict[k]}"`);
    changes.added.push(k);
  }
}

fs.writeFileSync(LOCAL, out.join("\n"));

console.log("=== Merge report ===");
console.log(`UPDATED (Vercel value replaced local): ${changes.updated.length}`);
for (const c of changes.updated) {
  const mask = (v) => (v.length > 20 ? v.slice(0, 6) + "…" + v.slice(-4) : v);
  console.log(`  ${c.key}: ${mask(c.from)} → ${mask(c.to)}`);
}
console.log(`ADDED (new from Vercel): ${changes.added.length}`);
for (const k of changes.added) console.log(`  ${k}`);
console.log(`LOCAL-ONLY (preserved, not in Vercel): ${changes.localOnly.length}`);
for (const k of changes.localOnly) console.log(`  ${k}`);
