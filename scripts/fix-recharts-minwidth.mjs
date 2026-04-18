/**
 * fix-recharts-minwidth.mjs
 *
 * Agrega minWidth={0} a todos los ResponsiveContainer en components/admin/**
 * que NO lo tengan. Resuelve el warning "width(-1) and height(-1)" que sale
 * cuando un chart se monta antes de que el layout le dé dimensiones.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const TARGET_DIRS = [
  "components/admin",
];
const EXCLUDE_DIRS = [
  "components/admin/inicio", // touched by parallel agent
];

async function* walk(dir) {
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) {
      if (EXCLUDE_DIRS.some((ex) => full.replace(/\\/g, "/").startsWith(ex))) continue;
      yield* walk(full);
    } else if (/\.tsx?$/.test(name)) {
      yield full;
    }
  }
}

let totalFiles = 0;
let totalChanges = 0;

for (const root of TARGET_DIRS) {
  for await (const file of walk(root)) {
    const content = readFileSync(file, "utf8");
    if (!content.includes("ResponsiveContainer")) continue;

    // Match <ResponsiveContainer ...> where "..." does NOT contain minWidth
    const pattern = /<ResponsiveContainer\s+([^>]*?)>/g;
    let changed = false;
    const next = content.replace(pattern, (match, attrs) => {
      if (attrs.includes("minWidth")) return match;
      changed = true;
      return `<ResponsiveContainer minWidth={0} ${attrs.trim()}>`;
    });

    if (changed) {
      writeFileSync(file, next, "utf8");
      const delta = (next.match(/minWidth=\{0\}/g) || []).length - (content.match(/minWidth=\{0\}/g) || []).length;
      totalChanges += delta;
      totalFiles += 1;
      console.log(`  +${delta} in ${file.replace(/\\/g, "/")}`);
    }
  }
}

console.log(`\nDone. Files: ${totalFiles} · Changes: ${totalChanges}`);
