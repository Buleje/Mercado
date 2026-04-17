#!/usr/bin/env tsx
/**
 * migrate-decorative-colors.ts — Migrador bulk de paleta decorativa a tokens (ADR-068).
 *
 * Transforma patrones comunes de colores arbitrarios (indigo/violet/purple/pink/fuchsia/rose)
 * a tokens del sistema de diseno. Escanea components/admin, components/store, app/t.
 *
 * Usos:
 *   tsx scripts/migrate-decorative-colors.ts           # Dry run (muestra diff)
 *   tsx scripts/migrate-decorative-colors.ts --apply   # Aplica cambios
 *   tsx scripts/migrate-decorative-colors.ts --stats   # Solo cuenta ocurrencias
 *
 * Patrones migrados:
 *   bg-X-(50|100) + text-X-(600|700) → bg-sunken + text-primary (badges)
 *   bg-X-(50|100) + dark:bg-X-9X0    → bg-sunken (tinted panels)
 *   text-X-(500|600|700)              → text-secondary (icons/labels)
 *   dark:text-X-(300|400)             → dark:text-foreground (dark labels)
 *   hover:text-X-\d+                  → hover:text-primary
 *   ring-X-\d+                        → ring-rule-base
 *   border-X-(100|200|300) + dark:X   → border-rule-base
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MODE_APPLY = process.argv.includes("--apply");
const MODE_STATS = process.argv.includes("--stats");

const DECORATIVE = "(indigo|violet|purple|pink|fuchsia|rose)";

type Rule = {
  id: string;
  pattern: RegExp;
  replacement: string;
};

const RULES: Rule[] = [
  {
    id: "badge-pair-light-dark",
    pattern: new RegExp(
      `bg-${DECORATIVE}-(100|200)\\s+text-${DECORATIVE}-(600|700|800)\\s+dark:bg-${DECORATIVE}-9\\d0\\/\\d+\\s+dark:text-${DECORATIVE}-(300|400)`,
      "g",
    ),
    replacement: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  },
  {
    id: "badge-pair-light-only",
    pattern: new RegExp(
      `bg-${DECORATIVE}-(100|200)\\s+text-${DECORATIVE}-(600|700|800)`,
      "g",
    ),
    replacement: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  },
  {
    id: "tinted-panel-light-dark",
    pattern: new RegExp(
      `bg-${DECORATIVE}-(50|100)\\s+dark:bg-${DECORATIVE}-9\\d0\\/\\d+`,
      "g",
    ),
    replacement: "bg-[var(--surface-sunken)]",
  },
  {
    id: "tinted-panel-light",
    pattern: new RegExp(`bg-${DECORATIVE}-(50|100)(?![\\d\\/])`, "g"),
    replacement: "bg-[var(--surface-sunken)]",
  },
  {
    id: "dark-text-color",
    pattern: new RegExp(`dark:text-${DECORATIVE}-(100|200|300|400)`, "g"),
    replacement: "dark:text-[var(--text-primary)]",
  },
  {
    id: "dark-bg-tint",
    pattern: new RegExp(`dark:bg-${DECORATIVE}-(700|800|900)(?!\\/)`, "g"),
    replacement: "dark:bg-[var(--surface-sunken)]",
  },
  {
    id: "light-text-color",
    pattern: new RegExp(`(?<![\\w:-])text-${DECORATIVE}-(500|600|700|800)(?![\\w\\[])`, "g"),
    replacement: "text-[var(--text-secondary)]",
  },
  {
    id: "text-color-light-scale",
    pattern: new RegExp(`(?<![\\w:-])text-${DECORATIVE}-(100|200|300|400)(?![\\w\\[])`, "g"),
    replacement: "text-[var(--text-tertiary)]",
  },
  {
    id: "text-color-dark-scale",
    pattern: new RegExp(`(?<![\\w:-])text-${DECORATIVE}-900(?![\\w\\[])`, "g"),
    replacement: "text-[var(--text-primary)]",
  },
  {
    id: "hover-text-color",
    pattern: new RegExp(`hover:text-${DECORATIVE}-\\d{2,3}`, "g"),
    replacement: "hover:text-[var(--text-primary)]",
  },
  {
    id: "dark-hover-text",
    pattern: new RegExp(`dark:hover:text-${DECORATIVE}-\\d{2,3}`, "g"),
    replacement: "dark:hover:text-[var(--text-primary)]",
  },
  {
    id: "border-tint-light-dark",
    pattern: new RegExp(
      `border-${DECORATIVE}-(100|200|300)\\s+dark:border-${DECORATIVE}-(8\\d0|9\\d0)(\\/\\d+)?`,
      "g",
    ),
    replacement: "border-[var(--rule-base)]",
  },
  {
    id: "ring-color",
    pattern: new RegExp(`ring-${DECORATIVE}-\\d{2,3}(\\/\\d+)?`, "g"),
    replacement: "ring-[var(--rule-base)]",
  },
  {
    id: "hover-bg-tint-light-dark",
    pattern: new RegExp(
      `hover:bg-${DECORATIVE}-(50|100)\\s+dark:hover:bg-${DECORATIVE}-9\\d0\\/\\d+`,
      "g",
    ),
    replacement: "hover:bg-[var(--surface-sunken)]",
  },
  {
    id: "hover-bg-tint-light",
    pattern: new RegExp(`hover:bg-${DECORATIVE}-(50|100)(?![\\d\\/])`, "g"),
    replacement: "hover:bg-[var(--surface-sunken)]",
  },
  {
    id: "focus-border-color",
    pattern: new RegExp(`focus:border-${DECORATIVE}-\\d{2,3}`, "g"),
    replacement: "focus:border-[var(--text-primary)]",
  },
  {
    id: "focus-ring-color",
    pattern: new RegExp(`focus:ring-${DECORATIVE}-\\d{2,3}(\\/\\d+)?`, "g"),
    replacement: "focus:ring-[var(--text-primary)]",
  },
  {
    id: "focus-text-color",
    pattern: new RegExp(`focus:text-${DECORATIVE}-\\d{2,3}`, "g"),
    replacement: "focus:text-[var(--text-primary)]",
  },
  {
    id: "group-hover-bg",
    pattern: new RegExp(`group-hover:bg-${DECORATIVE}-(50|100)(?![\\d\\/])`, "g"),
    replacement: "group-hover:bg-[var(--surface-sunken)]",
  },
  {
    id: "group-hover-text",
    pattern: new RegExp(`group-hover:text-${DECORATIVE}-\\d{2,3}`, "g"),
    replacement: "group-hover:text-[var(--text-primary)]",
  },
  // ── Border tokens (ADR-069 Fase 2) ─────────────────────────────────────────
  // Borders grises pesados se migran a rule-base / rule-soft semanticos.
  {
    id: "border-gray-light-dark",
    pattern: /border-gray-(100|200|300)\s+dark:border-gray-(700|800|900)(\/\d+)?/g,
    replacement: "border-[var(--rule-base)]",
  },
  {
    id: "border-gray-soft",
    pattern: /(?<![\w:-])border-gray-100(?![\w\[\d])/g,
    replacement: "border-[var(--rule-soft)]",
  },
  {
    id: "border-gray-base",
    pattern: /(?<![\w:-])border-gray-(200|300)(?![\w\[\d])/g,
    replacement: "border-[var(--rule-base)]",
  },
  // NOTA: border-gray-400/500 se deja sin tocar (el token --rule-strong es casi
  // negro, no sustituye directo a gray-500 semanticamente).
  {
    id: "dark-border-gray",
    pattern: /dark:border-gray-(700|800|900)(\/\d+)?/g,
    replacement: "dark:border-[var(--rule-base)]",
  },
  // ── Typography tokens (ADR-070) ────────────────────────────────────────────
  {
    id: "text-arbitrary-6px-10px",
    pattern: /text-\[([6-9]|10)px\]/g,
    replacement: "text-[length:var(--ts-2xs)]",
  },
  {
    id: "text-arbitrary-11px-12px",
    pattern: /text-\[(11|12)px\]/g,
    replacement: "text-[length:var(--ts-xs)]",
  },
  {
    id: "text-arbitrary-13px-15px",
    pattern: /text-\[(13|14|15)px\]/g,
    replacement: "text-[length:var(--ts-sm)]",
  },
  {
    id: "text-arbitrary-16px-17px",
    pattern: /text-\[(16|17)px\]/g,
    replacement: "text-[length:var(--ts-base)]",
  },
  {
    id: "text-arbitrary-18px-19px",
    pattern: /text-\[(18|19)px\]/g,
    replacement: "text-[length:var(--ts-lg)]",
  },
  {
    id: "text-arbitrary-20px-21px",
    pattern: /text-\[(20|21)px\]/g,
    replacement: "text-[length:var(--ts-xl)]",
  },
  {
    id: "font-black-to-extrabold",
    pattern: /(?<![\w:-])font-black(?!\w)/g,
    replacement: "font-extrabold",
  },
  {
    id: "tracking-arbitrary-wide",
    pattern: /tracking-\[0\.0[4-9]em\]/g,
    replacement: "tracking-[var(--ls-wide)]",
  },
  {
    id: "tracking-arbitrary-wider",
    pattern: /tracking-\[0\.[1-3]\d?em\]/g,
    replacement: "tracking-[var(--ls-wider)]",
  },
  {
    id: "tracking-arbitrary-tight",
    pattern: /tracking-\[-0\.0[123]em\]/g,
    replacement: "tracking-[var(--ls-tight)]",
  },
  // ── Motion tokens (ADR-071) ──────────────────────────────────────────────
  {
    id: "duration-tailwind-micro",
    pattern: /\bduration-75\b/g,
    replacement: "duration-[var(--dur-micro)]",
  },
  {
    id: "duration-tailwind-fast",
    pattern: /\bduration-(100|150)\b/g,
    replacement: "duration-[var(--dur-fast)]",
  },
  {
    id: "duration-tailwind-base",
    pattern: /\bduration-(200|300)\b/g,
    replacement: "duration-[var(--dur-base)]",
  },
  {
    id: "duration-tailwind-slow",
    pattern: /\bduration-(400|500)\b/g,
    replacement: "duration-[var(--dur-slow)]",
  },
  {
    id: "duration-tailwind-slower",
    pattern: /\bduration-(700|1000)\b/g,
    replacement: "duration-[var(--dur-slower)]",
  },
  {
    id: "duration-arbitrary-micro",
    pattern: /duration-\[([1-9]\d?)ms\]/g,
    replacement: "duration-[var(--dur-micro)]",
  },
  {
    id: "duration-arbitrary-fast",
    pattern: /duration-\[(1\d{2})ms\]/g,
    replacement: "duration-[var(--dur-fast)]",
  },
  {
    id: "duration-arbitrary-base",
    pattern: /duration-\[(2\d{2}|3\d{2})ms\]/g,
    replacement: "duration-[var(--dur-base)]",
  },
  {
    id: "duration-arbitrary-slow",
    pattern: /duration-\[([45]\d{2})ms\]/g,
    replacement: "duration-[var(--dur-slow)]",
  },
  {
    id: "duration-arbitrary-slower",
    pattern: /duration-\[([6-9]\d{2}|1\d{3})ms\]/g,
    replacement: "duration-[var(--dur-slower)]",
  },
  // ── Shadow tokens (ADR-072) ──────────────────────────────────────────────
  {
    id: "shadow-arbitrary-sm",
    pattern: /shadow-\[0_[12]px_[^\]]+\]/g,
    replacement: "shadow-[var(--shadow-sm)]",
  },
  {
    id: "shadow-arbitrary-md",
    pattern: /shadow-\[0_[468]px_[^\]]+\]/g,
    replacement: "shadow-[var(--shadow-md)]",
  },
  {
    id: "shadow-arbitrary-lg",
    pattern: /shadow-\[0_(12|16|20)px_[^\]]+\]/g,
    replacement: "shadow-[var(--shadow-lg)]",
  },
  {
    id: "shadow-arbitrary-xl",
    pattern: /shadow-\[0_(24|32|48)px_[^\]]+\]/g,
    replacement: "shadow-[var(--shadow-xl)]",
  },
  {
    id: "shadow-2xl-to-xl",
    pattern: /(?<![\w-])shadow-2xl(?!\w)/g,
    replacement: "shadow-[var(--shadow-xl)]",
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

function getTargetFiles(): string[] {
  const roots = [
    join(process.cwd(), "components", "admin"),
    join(process.cwd(), "components", "store"),
    join(process.cwd(), "components", "ui-system"),
    join(process.cwd(), "components", "customer"),
    join(process.cwd(), "app", "t"),
    join(process.cwd(), "packages", "design-system", "src"),
  ];
  return roots.flatMap((r) => walkDir(r));
}

type FileResult = {
  file: string;
  before: string;
  after: string;
  changes: Map<string, number>;
};

function migrate(file: string): FileResult {
  const before = readFileSync(file, "utf8");
  let after = before;
  const changes = new Map<string, number>();
  for (const rule of RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    const matches = after.match(re);
    if (matches) {
      changes.set(rule.id, matches.length);
      after = after.replace(re, rule.replacement);
    }
  }
  return { file, before, after, changes };
}

function main(): void {
  const files = getTargetFiles();
  const results: FileResult[] = [];
  for (const f of files) {
    const r = migrate(f);
    if (r.before !== r.after) results.push(r);
  }

  if (MODE_STATS) {
    const byRule = new Map<string, number>();
    for (const r of results) {
      for (const [rule, count] of r.changes) {
        byRule.set(rule, (byRule.get(rule) ?? 0) + count);
      }
    }
    console.log("Ocurrencias por regla:");
    for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count.toString().padStart(4)}  ${rule}`);
    }
    console.log(`\nTotal archivos impactables: ${results.length}/${files.length}`);
    return;
  }

  if (results.length === 0) {
    console.log(`Sin cambios: ${files.length} archivos escaneados, 0 patrones aplicables`);
    return;
  }

  if (!MODE_APPLY) {
    console.log(`DRY RUN (usa --apply para modificar):\n`);
    for (const r of results) {
      const rel = r.file.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, "");
      const total = [...r.changes.values()].reduce((s, n) => s + n, 0);
      console.log(`  ${total.toString().padStart(3)}  ${rel}`);
    }
    console.log(`\nTotal: ${results.length} archivos, ${[...results].reduce((s, r) => s + [...r.changes.values()].reduce((a, b) => a + b, 0), 0)} cambios`);
    return;
  }

  for (const r of results) writeFileSync(r.file, r.after, "utf8");
  const total = results.reduce((s, r) => s + [...r.changes.values()].reduce((a, b) => a + b, 0), 0);
  console.log(`Aplicado: ${total} cambios en ${results.length} archivos.`);
}

main();
