#!/usr/bin/env tsx
/**
 * fix-migration-artifacts.ts — Arregla artifacts de migrate-decorative-colors.ts.
 *
 * Bug: el regex `bg-X-(50|100)(?!\/)` matcheaba `bg-violet-500` (porque el `50` en
 * `500` pasaba el negative lookahead). Resultado: `bg-[var(--surface-sunken)]0`.
 *
 * Este script restaura la semantica correcta (colores solidos de enfasis → text-primary)
 * y se corre UNA VEZ despues de la migracion fallida. Luego el script principal ya
 * tiene el fix `(?![\\d\\/])` para prevenir repeticion.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MODE_APPLY = process.argv.includes("--apply");

const FIXES: Array<{ pattern: RegExp; replacement: string; id: string }> = [
  // bg-[var(--surface-sunken)]0/10 → bg-[var(--text-primary)]/10 (tinted emphasis)
  {
    id: "artifact-bg-opacity",
    pattern: /bg-\[var\(--surface-sunken\)\]0\/(\d+)/g,
    replacement: "bg-[var(--text-primary)]/$1",
  },
  // bg-[var(--surface-sunken)]0 → bg-[var(--text-primary)] (solid emphasis)
  {
    id: "artifact-bg-solid",
    pattern: /bg-\[var\(--surface-sunken\)\]0\b/g,
    replacement: "bg-[var(--text-primary)]",
  },
  // text-[var(--text-secondary)]0 → text-[var(--text-primary)]
  {
    id: "artifact-text-secondary-sol",
    pattern: /text-\[var\(--text-secondary\)\]0\b/g,
    replacement: "text-[var(--text-primary)]",
  },
  // text-[var(--text-primary)]0 → text-[var(--text-primary)]
  {
    id: "artifact-text-primary-sol",
    pattern: /text-\[var\(--text-primary\)\]0\b/g,
    replacement: "text-[var(--text-primary)]",
  },
  // dark:bg-[var(--surface-sunken)]0/\d+ → dark:bg-[var(--text-primary)]/\d+
  {
    id: "artifact-dark-bg",
    pattern: /dark:bg-\[var\(--surface-sunken\)\]0\/(\d+)/g,
    replacement: "dark:bg-[var(--text-primary)]/$1",
  },
];

function walkDir(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkDir(full, acc);
    else if (st.isFile() && (full.endsWith(".tsx") || full.endsWith(".ts"))) acc.push(full);
  }
  return acc;
}

function main(): void {
  const roots = [
    join(process.cwd(), "components"),
    join(process.cwd(), "app"),
  ];
  const files = roots.flatMap((r) => walkDir(r));
  let totalFiles = 0;
  let totalFixes = 0;
  const perRule = new Map<string, number>();

  for (const file of files) {
    const before = readFileSync(file, "utf8");
    let after = before;
    for (const fix of FIXES) {
      const matches = after.match(fix.pattern);
      if (matches) {
        perRule.set(fix.id, (perRule.get(fix.id) ?? 0) + matches.length);
        after = after.replace(fix.pattern, fix.replacement);
      }
    }
    if (before !== after) {
      totalFiles++;
      totalFixes += [...perRule.values()].reduce((s, n) => s + n, 0) - totalFixes;
      if (MODE_APPLY) writeFileSync(file, after, "utf8");
    }
  }

  console.log("Fixes por regla:");
  for (const [id, count] of [...perRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(3)}  ${id}`);
  }
  console.log(`\nArchivos: ${totalFiles}, fixes totales: ${[...perRule.values()].reduce((s, n) => s + n, 0)}`);
  if (!MODE_APPLY) console.log("\nDRY RUN — usa --apply para modificar");
}

main();
