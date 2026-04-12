#!/usr/bin/env node
/**
 * Bulk-fix @typescript-eslint/no-unused-vars warnings.
 *
 * Strategy:
 * - If the unused variable is inside an import statement → remove it from the import
 *   (or remove the whole import if it's the only specifier).
 * - Otherwise → prefix the identifier with `_` at the precise column so it matches
 *   the eslint config's `argsIgnorePattern: /^_/u`, which is the accepted escape hatch
 *   for "intentionally unused" according to the config.
 *
 * Run with: node scripts/fix-unused-vars.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();

function runEslintJson() {
  try {
    const out = execSync("npx eslint . --no-color -f json", {
      cwd: repoRoot,
      maxBuffer: 500 * 1024 * 1024,
    });
    return JSON.parse(out.toString());
  } catch (e) {
    // eslint exits non-zero when warnings are present; stdout still contains the JSON
    return JSON.parse(e.stdout.toString());
  }
}

function collectUnused(results) {
  const byFile = new Map();
  for (const r of results) {
    if (!r.messages?.length) continue;
    const unused = r.messages.filter(
      (m) => m.ruleId === "@typescript-eslint/no-unused-vars",
    );
    if (unused.length === 0) continue;
    byFile.set(r.filePath, unused);
  }
  return byFile;
}

function parseMessage(msg) {
  // messages look like: "'Foo' is defined but never used. Allowed unused vars must match /^_/u"
  const match = /'([^']+)' is (?:defined|assigned a value) but never used/.exec(
    msg.message,
  );
  if (!match) return null;
  return {
    name: match[1],
    line: msg.line,
    column: msg.column,
    endLine: msg.endLine ?? msg.line,
    endColumn: msg.endColumn ?? msg.column + match[1].length,
  };
}

function isInImport(lines, lineIdx) {
  // Walk backward to find `import`; if we hit `;` or start-of-file first → not import.
  for (let i = lineIdx; i >= Math.max(0, lineIdx - 20); i--) {
    const l = lines[i];
    if (!l) break;
    if (/^\s*import\b/.test(l)) return i;
    if (/;\s*$/.test(l) && i !== lineIdx) return -1;
  }
  return -1;
}

function findImportEndLine(lines, startLine) {
  for (let i = startLine; i < lines.length; i++) {
    if (/;\s*$/.test(lines[i])) return i;
  }
  return startLine;
}

function removeFromImportBlock(lines, startLine, endLine, name) {
  // Join the import block
  const block = lines.slice(startLine, endLine + 1).join("\n");
  // Remove the name in multiple possible forms:
  //   default: `import Foo from '...'` — if Foo is only specifier, drop whole line
  //   named:   `import { A, Foo, B } from '...'` → remove `Foo, ` or `, Foo` or `Foo`
  //   aliased: `import { A as Foo }` → `A as Foo`
  //   type:    `import type { Foo }`

  // 1) Try aliased named import like `OriginalName as Foo`
  const aliasRe = new RegExp(
    `\\b([A-Za-z_$][\\w$]*)\\s+as\\s+${name}\\b`,
  );
  if (aliasRe.test(block)) {
    let out = block.replace(new RegExp(`\\s*,\\s*${aliasRe.source}`), "");
    if (out === block) out = block.replace(new RegExp(`${aliasRe.source}\\s*,\\s*`), "");
    if (out === block) out = block.replace(aliasRe, "");
    return out;
  }

  // 2) Try plain named import `Foo`
  const nameRe = new RegExp(`\\b${name}\\b`);
  if (!nameRe.test(block)) return null;

  // remove `, Foo` or `Foo,` or `{ Foo }` (leaving `{}`) or `Foo` default
  let out = block;
  // default import: `import Foo,` → `import`
  out = out.replace(new RegExp(`import\\s+${name}\\s*,\\s*`), "import ");
  out = out.replace(new RegExp(`import\\s+type\\s+${name}\\s*,\\s*`), "import type ");
  // named list variants
  out = out.replace(new RegExp(`,\\s*${name}\\b`), "");
  out = out.replace(new RegExp(`\\b${name}\\s*,\\s*`), "");
  out = out.replace(new RegExp(`\\{\\s*${name}\\s*\\}`), "{}");
  out = out.replace(new RegExp(`\\b${name}\\b`), "");

  // cleanup: empty `{}` with other specifiers → remove entirely
  // empty default import: `import  from '...'` → delete whole line
  if (/^\s*import(?:\s+type)?\s+from\s+['"][^'"]+['"];?\s*$/m.test(out)) {
    return ""; // signal delete
  }
  // `import type { } from '...'` or `import { } from '...'` → delete
  if (/^\s*import(?:\s+type)?\s+\{\s*\}\s+from\s+['"][^'"]+['"];?\s*$/m.test(out)) {
    return "";
  }
  // Cleanup stray `, }` or `{ ,`
  out = out.replace(/\{\s*,\s*/g, "{ ");
  out = out.replace(/,\s*\}/g, " }");
  out = out.replace(/,\s*,/g, ",");
  return out;
}

function prefixIdentifier(lines, line, column, name) {
  const idx = line - 1;
  const src = lines[idx];
  if (!src) return false;
  // eslint columns are 1-based
  const col = column - 1;
  // confirm identifier at position
  if (src.slice(col, col + name.length) !== name) {
    // fall back: replace first exact-word occurrence
    const re = new RegExp(`\\b${name}\\b`);
    if (!re.test(src)) return false;
    lines[idx] = src.replace(re, `_${name}`);
    return true;
  }
  lines[idx] = src.slice(0, col) + `_${name}` + src.slice(col + name.length);
  return true;
}

function fixFile(filePath, warnings) {
  let content = readFileSync(filePath, "utf8");
  let lines = content.split(/\r?\n/);

  // Sort warnings bottom-to-top to avoid offset drift
  const sorted = [...warnings]
    .map(parseMessage)
    .filter(Boolean)
    .sort((a, b) => b.line - a.line || b.column - a.column);

  let changed = false;
  for (const w of sorted) {
    const lineIdx = w.line - 1;
    const importStart = isInImport(lines, lineIdx);
    if (importStart >= 0) {
      const importEnd = findImportEndLine(lines, importStart);
      const newBlock = removeFromImportBlock(lines, importStart, importEnd, w.name);
      if (newBlock === null) continue;
      if (newBlock === "") {
        // delete lines
        lines.splice(importStart, importEnd - importStart + 1);
        changed = true;
        continue;
      }
      const newBlockLines = newBlock.split("\n");
      lines.splice(importStart, importEnd - importStart + 1, ...newBlockLines);
      changed = true;
      continue;
    }
    // Non-import → prefix with `_`
    if (prefixIdentifier(lines, w.line, w.column, w.name)) {
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(filePath, lines.join("\n"), "utf8");
  }
  return changed;
}

console.log("Running ESLint to collect warnings…");
const results = runEslintJson();
const byFile = collectUnused(results);
console.log(`Found ${byFile.size} files with unused-vars warnings`);

let total = 0;
let fixed = 0;
for (const [file, warnings] of byFile) {
  total += warnings.length;
  try {
    if (fixFile(file, warnings)) fixed += warnings.length;
  } catch (e) {
    console.error(`Error fixing ${file}:`, e.message);
  }
}
console.log(`Fixed ${fixed}/${total} unused-vars warnings.`);
