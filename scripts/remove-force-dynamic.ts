/**
 * scripts/remove-force-dynamic.ts
 *
 * Hotfix 2026-04-09: Next.js 16.1.6 con `cacheComponents: true` en next.config.ts
 * NO soporta `export const dynamic = "force-dynamic"` en route handlers ni layouts.
 * Lanza: "Route segment config 'dynamic' is not compatible with
 *         nextConfig.cacheComponents. Please remove it."
 *
 * Solución oficial (next-cache-components docs):
 *   "dynamic = 'force-dynamic'" → REMOVE (default behavior)
 *
 * Next 16 auto-detecta que una ruta es dinámica cuando el código lee cookies/
 * headers/searchParams. No hace falta el export explícito.
 *
 * Este script:
 *   1. Busca todos los .ts/.tsx que tengan `export const dynamic = "force-dynamic"`
 *   2. Remueve la línea + el comentario previo si lo explica
 *   3. Reporta qué archivos fueron modificados
 *
 * NO toca archivos .md (esos los actualizamos aparte: CLAUDE.md, PR template, agents).
 *
 * Run: npx tsx scripts/remove-force-dynamic.ts
 */

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const FORCE_DYNAMIC_REGEX = /^export const dynamic\s*=\s*["']force-dynamic["'];?\s*$/;

function findFilesRecursive(dir: string, results: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .next, .git, lib/generated, .husky,
      // y CRITICAMENTE .claude/worktrees (agentes corriendo en paralelo)
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === ".git" ||
        entry.name === "generated" ||
        entry.name === ".husky" ||
        entry.name === "worktrees"
      ) {
        continue;
      }
      findFilesRecursive(full, results);
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        results.push(full);
      }
    }
  }
  return results;
}

function processFile(filepath: string): {
  modified: boolean;
  linesRemoved: number;
} {
  const content = fs.readFileSync(filepath, "utf8");
  const lines = content.split(/\r?\n/);

  const newLines: string[] = [];
  let linesRemoved = 0;
  let skipBlankAfter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match línea del export
    if (FORCE_DYNAMIC_REGEX.test(line.trim())) {
      linesRemoved++;

      // Remover también el comentario previo si menciona force-dynamic o dinámico
      // Patrones típicos:
      //   // force-dynamic: el tenantId viene del header x-tenant-id...
      //   // Force dynamic rendering (reads cookies)
      //   // Fuerza rendering dinámico por acceso a cookies/headers
      if (newLines.length > 0) {
        const prevIdx = newLines.length - 1;
        const prev = newLines[prevIdx].trim();
        if (
          prev.startsWith("//") &&
          /(force-dynamic|force dynamic|dinámic|dynamic render|no cache|sin cache)/i.test(prev)
        ) {
          newLines.pop();
          linesRemoved++;
        }
      }

      skipBlankAfter = true;
      continue;
    }

    // Si la línea previa era el export, y esta es blanca, también la quitamos
    if (skipBlankAfter && line.trim() === "") {
      linesRemoved++;
      skipBlankAfter = false;
      continue;
    }

    skipBlankAfter = false;
    newLines.push(line);
  }

  const modified = linesRemoved > 0;
  if (modified) {
    fs.writeFileSync(filepath, newLines.join("\n"));
  }

  return { modified, linesRemoved };
}

async function main() {
  console.log("🔧 Hotfix Next 16 cacheComponents — remover export const dynamic = 'force-dynamic'\n");

  const files = findFilesRecursive(REPO_ROOT);
  console.log(`📂 Escaneados ${files.length} archivos .ts/.tsx\n`);

  let modifiedCount = 0;
  let totalLinesRemoved = 0;
  const modifiedFiles: string[] = [];

  for (const file of files) {
    const { modified, linesRemoved } = processFile(file);
    if (modified) {
      modifiedCount++;
      totalLinesRemoved += linesRemoved;
      const rel = path.relative(REPO_ROOT, file);
      modifiedFiles.push(rel);
    }
  }

  console.log(`✅ Archivos modificados: ${modifiedCount}`);
  console.log(`   Líneas removidas:    ${totalLinesRemoved}\n`);

  if (modifiedFiles.length > 0 && modifiedFiles.length <= 30) {
    console.log("Archivos tocados:");
    for (const f of modifiedFiles) console.log(`  · ${f}`);
  } else if (modifiedFiles.length > 30) {
    console.log(`Primeros 10 archivos tocados (de ${modifiedFiles.length} totales):`);
    for (const f of modifiedFiles.slice(0, 10)) console.log(`  · ${f}`);
    console.log(`  ... y ${modifiedFiles.length - 10} más`);
  }

  console.log("\n📌 Próximo paso: npx tsc --noEmit (debería pasar) + git diff --stat");
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
