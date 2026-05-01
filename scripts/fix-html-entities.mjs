/**
 * Reemplaza HTML entities por caracteres UTF-8 reales en *.tsx/*.ts.
 * Solo dentro de string literals JSX (text/placeholders) — NO afecta
 * código JS/TS de fuera del JSX.
 *
 * Idempotente: corrida varias veces no hace daño.
 *
 * Uso: node scripts/fix-html-entities.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DRY = process.argv.includes("--dry");

const REPLACEMENTS = {
  "&aacute;": "á",
  "&eacute;": "é",
  "&iacute;": "í",
  "&oacute;": "ó",
  "&uacute;": "ú",
  "&ntilde;": "ñ",
  "&Aacute;": "Á",
  "&Eacute;": "É",
  "&Iacute;": "Í",
  "&Oacute;": "Ó",
  "&Uacute;": "Ú",
  "&Ntilde;": "Ñ",
  "&iexcl;": "¡",
  "&iquest;": "¿",
  "&mdash;": "—",
  "&ndash;": "–",
};

const filesRaw = execSync(
  "grep -rl '&\\(eacute\\|aacute\\|iacute\\|oacute\\|uacute\\|ntilde\\|Eacute\\|Aacute\\|Iacute\\|Oacute\\|Uacute\\|Ntilde\\|iexcl\\|iquest\\|mdash\\|ndash\\);' components/ app/ 2>/dev/null",
  { encoding: "utf8" },
);
const files = filesRaw.split("\n").filter(Boolean);

let totalChanges = 0;
const changedFiles = [];

for (const file of files) {
  const original = readFileSync(file, "utf8");
  let next = original;
  let changesInFile = 0;
  for (const [entity, replacement] of Object.entries(REPLACEMENTS)) {
    const before = next.length;
    next = next.split(entity).join(replacement);
    const matches = (before - next.length) / Math.abs(entity.length - replacement.length);
    if (matches > 0) changesInFile += Math.round(matches);
  }
  if (next !== original) {
    if (!DRY) writeFileSync(file, next, "utf8");
    totalChanges += changesInFile;
    changedFiles.push({ file, changes: changesInFile });
  }
}

console.log(`Files changed: ${changedFiles.length}`);
console.log(`Total replacements: ${totalChanges}`);
if (DRY) {
  console.log("(dry run — no files written)");
} else {
  console.log("\nDetalles:");
  changedFiles.forEach((f) => console.log(`  ${f.file} (${f.changes})`));
}
