#!/usr/bin/env tsx
/**
 * lint-design-tokens.ts — Guardarail de ADR-068 (armonia estricta).
 *
 * Escanea components/admin y tienda publica por violaciones del sistema de diseno:
 * - Gradientes decorativos (bg-linear-to-* / bg-gradient-to-*) fuera de whitelist.
 * - Shadows coloridos (shadow-{color}-{num}).
 * - Clases inexistentes / deprecated (ej. bg-gradient-to-* en Tailwind v4).
 *
 * Whitelist de gradientes funcionales (NO decorativos):
 * - Scroll fade overlays (AdminTabBar)
 * - Image-over-text overlays (BannerEditor)
 *
 * Uso:
 *   tsx scripts/lint-design-tokens.ts              # Full scan (admin + store)
 *   tsx scripts/lint-design-tokens.ts --staged     # Solo staged files
 *   tsx scripts/lint-design-tokens.ts --warn       # Emite warnings, no falla
 *
 * Exit codes: 0 = clean, 1 = violations found
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";

const MODE_STAGED = process.argv.includes("--staged");
const MODE_WARN = process.argv.includes("--warn");
const FILE_ARGS = process.argv.slice(2).filter((a) => !a.startsWith("--"));

type Rule = {
  id: string;
  pattern: RegExp;
  message: string;
  severity: "error" | "warning";
};

const RULES: Rule[] = [
  {
    id: "no-decorative-gradient",
    pattern: /bg-(linear|gradient)-to-[a-z]+\s+from-(indigo|purple|violet|pink|fuchsia|rose|emerald|cyan|teal|amber|orange|yellow|red|green|blue|sky|slate)-\d{2,3}/g,
    message: "Gradiente decorativo prohibido (ADR-068). Usa bg-[var(--surface-sunken)], bg-[var(--text-primary)], o tokens semanticos.",
    severity: "error",
  },
  {
    id: "no-legacy-gradient-prefix",
    pattern: /bg-gradient-to-[a-z]+/g,
    message: "bg-gradient-to-* es Tailwind v3. En v4 usa bg-linear-to-* (solo si es gradiente funcional whitelisted).",
    severity: "error",
  },
  {
    id: "no-colored-shadow",
    pattern: /shadow-(indigo|purple|violet|pink|fuchsia|rose|emerald|cyan|teal|amber|orange|yellow|blue|sky)-\d{2,3}/g,
    message: "Sombra colorida decorativa prohibida. Usa shadow-sm/shadow-md neutros.",
    severity: "error",
  },
  {
    id: "no-decorative-text-color",
    pattern: /\btext-(indigo|violet|purple|pink|fuchsia|rose)-\d{2,3}\b/g,
    message: "Color de texto decorativo violeta/rosa prohibido (ADR-068). Usa text-[var(--text-primary|secondary|tertiary)] o tokens semanticos.",
    severity: "error",
  },
  // ── Typography tokens (ADR-070) ──────────────────────────────────────────────
  {
    id: "no-arbitrary-text-size",
    pattern: /text-\[\d{1,2}(\.\d+)?px\](?!\w)/g,
    message: "Tamano de texto arbitrario prohibido (ADR-070). Usa text-[length:var(--ts-2xs|xs|sm|base|lg|xl|2xl|3xl)] o text-xs/sm/base/lg/xl/2xl/3xl. Display headlines (>= 100px) estan permitidos.",
    severity: "error",
  },
  {
    id: "no-arbitrary-tracking",
    pattern: /tracking-\[[^\]]*em\]/g,
    message: "Letter-spacing arbitrario prohibido (ADR-070). Usa tracking-[var(--ls-tight|normal|wide|wider)] o tokens tracking-tight/normal/wide/wider.",
    severity: "error",
  },
  {
    id: "warn-font-black",
    pattern: /(?<![\w:-])font-black(?!\w)/g,
    message: "font-black prohibido — usa font-extrabold (ADR-070: exclusivo para KPI values).",
    severity: "warning",
  },
  // ── Motion tokens (ADR-071) ──────────────────────────────────────────────
  {
    id: "no-arbitrary-duration-ms",
    pattern: /duration-\[\d+ms\](?!\w)/g,
    message: "Duration arbitraria prohibida (ADR-071). Usa duration-[var(--dur-micro|fast|base|slow|slower)].",
    severity: "error",
  },
  {
    id: "warn-tailwind-duration",
    pattern: /(?<![\w:-])duration-(75|100|150|200|300|400|500|700|1000)\b/g,
    message: "Usa tokens semanticos (var(--dur-*)) en lugar de duration-Xms literales (ADR-071).",
    severity: "warning",
  },
  // ── Shadow tokens (ADR-072) ──────────────────────────────────────────────
  {
    id: "no-arbitrary-shadow",
    pattern: /shadow-\[0_\d+px_[^\]]+\](?!\w)/g,
    message: "Shadow arbitrario prohibido (ADR-072). Usa shadow-[var(--shadow-sm|md|lg|xl)] o escalas Tailwind estandar.",
    severity: "error",
  },
  {
    id: "warn-shadow-2xl",
    pattern: /(?<![\w-])shadow-2xl(?!\w)/g,
    message: "shadow-2xl es excesivo. Usa shadow-[var(--shadow-xl)] (ADR-072).",
    severity: "warning",
  },
];

const WHITELIST_PATTERNS: Array<{ file: RegExp; allowedRules: string[] }> = [
  { file: /shared[\\/]AdminTabBar\.tsx$/, allowedRules: ["no-decorative-gradient"] },
  { file: /BannerEditor\.tsx$/, allowedRules: ["no-decorative-gradient"] },
];

function isWhitelisted(file: string, ruleId: string): boolean {
  return WHITELIST_PATTERNS.some(
    (w) => w.file.test(file) && w.allowedRules.includes(ruleId),
  );
}

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
  if (FILE_ARGS.length > 0) {
    return FILE_ARGS
      .map((f) => resolve(process.cwd(), f))
      .filter((f) => existsSync(f) && (f.endsWith(".tsx") || f.endsWith(".ts")))
      .filter(
        (f) =>
          f.includes("components/admin") ||
          f.includes("components\\admin") ||
          f.includes("components/store") ||
          f.includes("components\\store") ||
          f.includes("components/ui-system") ||
          f.includes("components\\ui-system") ||
          f.includes("components/customer") ||
          f.includes("components\\customer") ||
          f.includes("app/t/") ||
          f.includes("app\\t\\"),
      );
  }
  if (MODE_STAGED) {
    try {
      const out = execSync("git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" });
      return out
        .split("\n")
        .filter((f) => f && (f.endsWith(".tsx") || f.endsWith(".ts")))
        .filter((f) => f.includes("components/admin") || f.includes("components/store") || f.includes("components/ui-system") || f.includes("components/customer") || f.includes("app/t/"))
        .map((f) => resolve(process.cwd(), f))
        .filter((f) => existsSync(f));
    } catch {
      return [];
    }
  }
  const roots = [
    join(process.cwd(), "components", "admin"),
    join(process.cwd(), "components", "store"),
    join(process.cwd(), "components", "ui-system"),
    join(process.cwd(), "components", "customer"),
    join(process.cwd(), "app", "t"),
  ];
  return roots.flatMap((r) => walkDir(r));
}

type Finding = {
  file: string;
  line: number;
  col: number;
  rule: Rule;
  match: string;
};

function scan(file: string): Finding[] {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  const findings: Finding[] = [];
  for (const rule of RULES) {
    if (isWhitelisted(file, rule.id)) continue;
    lines.forEach((line, idx) => {
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        findings.push({ file, line: idx + 1, col: m.index + 1, rule, match: m[0] });
      }
    });
  }
  return findings;
}

function main(): void {
  const files = getTargetFiles();
  const all: Finding[] = [];
  for (const f of files) all.push(...scan(f));

  const errors = all.filter((f) => f.rule.severity === "error");
  const warnings = all.filter((f) => f.rule.severity === "warning");

  if (all.length === 0) {
    console.log(`Design tokens clean: 0 violations in ${files.length} files`);
    process.exit(0);
  }

  const byFile = new Map<string, Finding[]>();
  for (const f of all) {
    const arr = byFile.get(f.file) ?? [];
    arr.push(f);
    byFile.set(f.file, arr);
  }

  for (const [file, list] of byFile) {
    const rel = file.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, "");
    console.log(`\n${rel}`);
    for (const f of list) {
      const prefix = f.rule.severity === "error" ? "ERROR" : "WARN ";
      console.log(`  [${prefix}] line ${f.line}:${f.col} — ${f.rule.id}`);
      console.log(`          match: ${f.match}`);
      console.log(`          ${f.rule.message}`);
    }
  }

  console.log("\n---");
  console.log(`Total: ${errors.length} errors, ${warnings.length} warnings, ${byFile.size} files`);

  if (MODE_WARN) process.exit(0);
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
