// Mueve "use client" al top de archivos donde quedó después de imports.
// Causado por auto-import inyectado por migrate-to-ds.mjs antes del directive.
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "glob";

const PATTERNS = [
  "components/admin/**/*.tsx",
  "components/admin/**/*.ts",
  "components/superadmin/**/*.tsx",
  "components/superadmin/**/*.ts",
  "components/store/**/*.tsx",
  "components/customer/**/*.tsx",
  "app/admin/**/*.tsx",
  "app/admin/**/*.ts",
  "app/superadmin/**/*.tsx",
  "app/superadmin/**/*.ts",
  "app/t/**/*.tsx",
  "app/(store)/**/*.tsx",
  "app/marketplace/**/*.tsx",
];

const USE_CLIENT_RE = /^["']use client["']\s*;?\s*$/;

let fixedFiles = 0;
const patched = [];

for (const pattern of PATTERNS) {
  const files = globSync(pattern, { cwd: process.cwd() });
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    // Strip BOM for detection
    const noBom = content.replace(/^\uFEFF/, "");
    const lines = noBom.split("\n");

    // Find position of "use client"
    let useClientIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const trimmed = lines[i].trim();
      if (USE_CLIENT_RE.test(trimmed)) {
        useClientIdx = i;
        break;
      }
    }

    if (useClientIdx === -1) continue; // No use client → skip
    if (useClientIdx === 0) continue; // Already at top → skip

    // Check if lines before are only imports/comments/blank lines
    let allImportsOrBlank = true;
    for (let i = 0; i < useClientIdx; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === "") continue;
      if (trimmed.startsWith("//")) continue;
      if (trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.endsWith("*/")) continue;
      if (trimmed.startsWith("import ")) continue;
      // anything else → abort, unsafe to move
      allImportsOrBlank = false;
      break;
    }

    if (!allImportsOrBlank) continue;

    // Move "use client" to the top
    const useClientLine = lines[useClientIdx];
    const before = lines.slice(0, useClientIdx);
    const after = lines.slice(useClientIdx + 1);
    const newLines = [useClientLine, "", ...before, ...after];
    // Trim consecutive blank lines between directive and imports
    const newContent = newLines.join("\n").replace(/^("use client";?\s*\n)\n+/, "$1\n");

    writeFileSync(file, newContent, "utf-8");
    fixedFiles++;
    patched.push(file);
  }
}

console.log(`Fixed "use client" position in ${fixedFiles} files.`);
if (patched.length > 0 && patched.length <= 30) {
  patched.forEach((f) => console.log(`  ${f}`));
} else if (patched.length > 30) {
  patched.slice(0, 20).forEach((f) => console.log(`  ${f}`));
  console.log(`  ... and ${patched.length - 20} more`);
}
