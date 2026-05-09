/**
 * migrate-bg-white-admin.mjs
 * Reemplaza `bg-white` sin override dark: por `bg-white dark:bg-[var(--color-card)]`
 * en todos los archivos components/admin/** /*.tsx
 *
 * EXCLUSIONES:
 *   - unified/MarketplaceModule.tsx       (ya migrado)
 *   - GoalsTab.tsx                        (ya migrado)
 *   - MassMessageSender.tsx               (ya migrado)
 *   - ContentCalendar.tsx                 (ya migrado)
 *   - DailyGoalTracker.tsx                (ya migrado)
 *   - archivos >2000 LOC → skip + log
 *
 * NO toca:
 *   - bg-white/N  (con opacidad / slash)
 *   - bg-whitesmoke
 *   - bg-white ya con dark: adyacente (50 chars antes o después)
 *   - "use client" directive
 */

import fs from "fs";
import path from "path";
import { globSync } from "fs"; // Node 22+
import { execSync } from "child_process";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function walkTsx(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...walkTsx(full));
    } else if (e.isFile() && e.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

function countLines(content) {
  return content.split("\n").length;
}

// Verifica si en un radio de 50 chars alrededor del match ya hay `dark:`
function hasDarkNearby(content, matchIndex) {
  const start = Math.max(0, matchIndex - 50);
  const end = Math.min(content.length, matchIndex + "bg-white".length + 50);
  const window = content.slice(start, end);
  return window.includes("dark:");
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ADMIN_DIR = path.resolve("components/admin");

// Rutas exactas (relativas al repo root) a excluir
const EXCLUDED_PATHS = new Set([
  path.resolve("components/admin/unified/MarketplaceModule.tsx"),
  path.resolve("components/admin/GoalsTab.tsx"),
  path.resolve("components/admin/MassMessageSender.tsx"),
  path.resolve("components/admin/ContentCalendar.tsx"),
  path.resolve("components/admin/DailyGoalTracker.tsx"),
]);

const MAX_LINES = 2000;
const REPLACEMENT = "bg-white dark:bg-[var(--color-card)]";

// ─── Main ─────────────────────────────────────────────────────────────────────

const files = walkTsx(ADMIN_DIR);

let totalFilesModified = 0;
let totalOccurrencesReplaced = 0;
const skippedFiles = []; // >2000 LOC
const fileStats = []; // { file, count }

for (const filePath of files) {
  // Excluir archivos ya migrados
  if (EXCLUDED_PATHS.has(filePath)) {
    continue;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const lineCount = countLines(original);

  // Skip >2000 LOC
  if (lineCount > MAX_LINES) {
    skippedFiles.push({ file: filePath, lines: lineCount });
    continue;
  }

  let modified = original;
  let occurrences = 0;
  let searchFrom = 0;

  while (true) {
    const idx = modified.indexOf("bg-white", searchFrom);
    if (idx === -1) break;

    const charAfter = modified[idx + "bg-white".length] || "";

    // Saltar bg-whitesmoke o cualquier otro sufijo de palabra (letra o guión)
    if (/[a-zA-Z-]/.test(charAfter)) {
      searchFrom = idx + 1;
      continue;
    }

    // Saltar bg-white/N (opacidad — el char siguiente es '/')
    if (charAfter === "/") {
      searchFrom = idx + 1;
      continue;
    }

    // Saltar si ya hay dark: cerca
    if (hasDarkNearby(modified, idx)) {
      searchFrom = idx + "bg-white".length;
      continue;
    }

    // Hacer el reemplazo
    modified =
      modified.slice(0, idx) +
      REPLACEMENT +
      modified.slice(idx + "bg-white".length);

    occurrences++;
    // Avanzar pasando el texto ya reemplazado
    searchFrom = idx + REPLACEMENT.length;
  }

  if (occurrences > 0) {
    fs.writeFileSync(filePath, modified, "utf8");
    totalFilesModified++;
    totalOccurrencesReplaced += occurrences;
    fileStats.push({ file: filePath, count: occurrences });
  }
}

// ─── Reporte ──────────────────────────────────────────────────────────────────

console.log("\n========================================");
console.log("  migrate-bg-white-admin — REPORTE");
console.log("========================================");
console.log(`Archivos scaneados   : ${files.length}`);
console.log(`Archivos modificados : ${totalFilesModified}`);
console.log(`Ocurrencias reemplaz.: ${totalOccurrencesReplaced}`);

if (skippedFiles.length > 0) {
  console.log(`\nArchivos SKIPPED (>2000 LOC) — revisión manual:`);
  for (const s of skippedFiles) {
    const rel = path.relative(process.cwd(), s.file);
    console.log(`  ${rel}  (${s.lines} líneas)`);
  }
}

// Top 10 con más cambios
const top = fileStats
  .sort((a, b) => b.count - a.count)
  .slice(0, 10);

if (top.length > 0) {
  console.log("\nTop archivos con más reemplazos:");
  for (const s of top) {
    const rel = path.relative(process.cwd(), s.file);
    console.log(`  ${s.count.toString().padStart(3)}  ${rel}`);
  }
}

console.log("\nListo. Verificar con:");
console.log(
  '  grep -rn "bg-white" components/admin/ --include="*.tsx" | grep -v "dark:" | wc -l'
);
console.log("========================================\n");
