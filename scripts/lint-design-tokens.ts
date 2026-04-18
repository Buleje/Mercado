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
 *   tsx scripts/lint-design-tokens.ts                   # Full scan (admin + store)
 *   tsx scripts/lint-design-tokens.ts --staged          # Solo staged files
 *   tsx scripts/lint-design-tokens.ts --warn            # Emite warnings, no falla
 *   tsx scripts/lint-design-tokens.ts --design-strict   # ADR-075: reglas DS upgradean a error
 *
 * Exit codes: 0 = clean, 1 = violations found
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";

const MODE_STAGED = process.argv.includes("--staged");
const MODE_WARN = process.argv.includes("--warn");
const MODE_DESIGN_STRICT = process.argv.includes("--design-strict");
const FILE_ARGS = process.argv.slice(2).filter((a) => !a.startsWith("--"));

type Rule = {
  id: string;
  pattern: RegExp;
  message: string;
  severity: "error" | "warning";
  /** Si true, la regla solo aplica a admin/** (no store/customer). */
  adminOnly?: boolean;
  /** Si se provee, la severidad se eleva a "error" cuando MODE_DESIGN_STRICT=true. */
  strictUpgrade?: boolean;
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
  // ── Neutral surfaces hardcoded (ADR-074) ───────────────────────────────────
  // Detecta pares light/dark gray/white que deberian usar surface-* tokens.
  {
    id: "warn-hardcoded-neutral-surface-pair",
    pattern: /bg-(white|gray-50|gray-100)\s+dark:bg-gray-(800|900|950)/g,
    message: "Pareja bg-white/gray + dark:bg-gray hardcoded (ADR-074). Usa bg-[var(--surface-canvas|sunken|raised)].",
    severity: "warning",
  },
  {
    id: "warn-hardcoded-neutral-border-pair",
    pattern: /border-gray-(100|200|300)\s+dark:border-gray-(700|800|900)/g,
    message: "Borde gray hardcoded (ADR-074). Usa border-[var(--rule-soft|base)].",
    severity: "warning",
  },
  {
    id: "warn-hardcoded-neutral-text-pair",
    pattern: /text-gray-(500|600|700|800|900)\s+dark:text-(white|gray-(100|200|300|400))/g,
    message: "Par text-gray hardcoded (ADR-074). Usa text-[var(--text-primary|secondary|tertiary)].",
    severity: "warning",
  },
  // ── DS Single Source of Truth (ADR-075) ────────────────────────────────────
  // Admin-only strict rules. En --design-strict estas suben a error.
  {
    id: "ds-no-text-gray-admin",
    // text-gray-{400..900} (monocromo — saltar 100-300 que se usan para dividers/placeholders)
    pattern: /(?<![\w:-])text-gray-(400|500|600|700|800|900)(?!\w)/g,
    message:
      "Usa text-[var(--text-primary|secondary|tertiary)] o <BodyText/Caption/Label> del DS (ADR-075).",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-decorative-color-admin",
    // text/bg-{red,blue,emerald,green,amber,yellow,orange,purple,violet,pink,indigo,sky,cyan}-{400-700}
    pattern:
      /(?<![\w:-])(text|bg)-(red|blue|emerald|green|amber|yellow|orange|purple|violet|pink|indigo|sky|cyan)-(400|500|600|700)(?!\w)/g,
    message:
      "Usa --data-{success,warning,error,info} o <IconBadge intent=...>/StatCard emphasis=... del DS (ADR-075).",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-direct-lucide-import",
    pattern: /from\s+["']lucide-react["']/g,
    message:
      "Import iconos desde '@buleje/design-system/icons' (ADR-075). El DS re-exporta todos los iconos necesarios con tree-shake.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-style-color-inline",
    // style={{ color: ..., background: ..., borderColor: ... }} — SOLO si el valor NO es var(--...)
    // (para no prohibir tokens CSS legitimos). Detectamos colores hex/rgb/rgba/hsl literales.
    pattern:
      /style=\{\{[^}]*\b(color|background|backgroundColor|borderColor)\s*:\s*["']?(#[0-9a-fA-F]{3,8}|rgb|rgba|hsl)/g,
    message:
      "Usa className con tokens CSS (--text-*, --surface-*, --rule-*, --data-*) en lugar de style inline con literales (ADR-075).",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-inline-alert-pattern",
    // bg-{yellow,red,green,blue,amber}-50 + border-{same}-{200,300} en la misma linea.
    pattern:
      /bg-(yellow|red|green|blue|amber)-(50|100)\s+[^"]*border-(yellow|red|green|blue|amber)-(200|300)/g,
    message:
      "Usa <InfoAlert/WarningAlert/ErrorAlert/SuccessAlert> del DS (ADR-075) en lugar del patron bg-{color}-50 + border-{color}-200 inline.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  // ── Sprint B4: typography/style/table/loader DS adoption (ADR-075) ───────
  {
    id: "ds-no-heading-with-design-class",
    // <h1|h2|h3 con text-*/font-*/leading-*/tracking-* en className → usar PageTitle/SectionTitle/CardTitle.
    pattern:
      /<h[1-3]\s+[^>]*className=(?:"[^"]*(?:\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)|\bfont-(?:thin|light|normal|medium|semibold|bold|extrabold|black)|\bleading-|\btracking-)[^"]*"|\{`[^`]*(?:\btext-|\bfont-|\bleading-|\btracking-)[^`]*`\})/g,
    message:
      "Usa <PageTitle/SectionTitle/CardTitle> del DS (ADR-075) en lugar de <h1/h2/h3> con clases de diseño.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: true,
  },
  {
    id: "ds-no-style-inline-any-color",
    // style={{ color|backgroundColor|borderColor|fontSize: cualquier literal }} — incluye var(...) para forzar className.
    // Diferencia con ds-no-style-color-inline: éste incluye var(...) y fontSize.
    pattern:
      /style=\{\{[^}]*\b(color|backgroundColor|borderColor|fontSize)\s*:\s*["'](?:var\([^)]+\)|#[0-9a-fA-F]{3,8}|\d+)/g,
    message:
      "Usa className con tokens CSS (--text-*, --surface-*, --rule-*) o primitives del DS (ADR-075) — evitar style inline estático.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: false,
  },
  {
    id: "ds-no-raw-table-in-admin",
    // <table ...> sin className usando `overflow` cerca → sugerencia DataTable.
    // Detectamos <table> JSX directo (no HTML string dentro de template).
    pattern: /<table\s+className=/g,
    message:
      "Considera migrar a <DataTable> del DS (ADR-075) para tablas con estilo consistente. Si es un caso legítimo (cabeceras custom, spans), ignora esta regla.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: false,
  },
  {
    id: "ds-no-raw-loader-block-in-admin",
    // Loader2 de bloque (h-6 w-6 o mayor) con animate-spin → usar LoadingState.
    // Inline spinners en botones (h-3/h-4) son aceptables y NO disparan la regla.
    pattern: /<Loader2\s+[^>]*className=["'][^"']*\bh-(?:6|7|8|10|12|16)[^"']*animate-spin/g,
    message:
      "Usa <LoadingState> del DS (ADR-075) en lugar de <Loader2 animate-spin> a nivel bloque — unifica spinner y copy.",
    severity: "warning",
    adminOnly: true,
    strictUpgrade: false,
  },
];

const WHITELIST_PATTERNS: Array<{ file: RegExp; allowedRules: string[] }> = [
  { file: /shared[\\/]AdminTabBar\.tsx$/, allowedRules: ["no-decorative-gradient"] },
  { file: /BannerEditor\.tsx$/, allowedRules: ["no-decorative-gradient"] },
  // DS primitives — shared/ y packages/design-system/** pueden importar lucide-react directo.
  { file: /packages[\\/]design-system[\\/]/, allowedRules: ["ds-no-direct-lucide-import", "ds-no-style-color-inline"] },
  { file: /components[\\/]admin[\\/]shared[\\/]/, allowedRules: ["ds-no-direct-lucide-import"] },
  { file: /components[\\/]admin[\\/]layout[\\/]/, allowedRules: ["ds-no-direct-lucide-import"] },
  // Tenant branding (store-customizer) legitimamente usa style inline para preview de colores del tenant.
  { file: /StoreCustomizer\.tsx$/, allowedRules: ["ds-no-style-color-inline", "ds-no-style-inline-any-color"] },
  { file: /StoreCreativeMode\.tsx$/, allowedRules: ["ds-no-style-color-inline", "ds-no-style-inline-any-color"] },
  { file: /ThemeCustomizer\.tsx$/, allowedRules: ["ds-no-style-color-inline", "ds-no-style-inline-any-color"] },
  { file: /BannerEditor\.tsx$/, allowedRules: ["ds-no-style-color-inline", "ds-no-style-inline-any-color"] },
];

function isAdminPath(file: string): boolean {
  const p = file.replace(/\\/g, "/");
  return p.includes("/components/admin/") || p.includes("/app/admin/");
}

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

function isInScope(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  return (
    p.includes("components/admin") ||
    p.includes("components/superadmin") ||
    p.includes("components/store") ||
    p.includes("components/ui-system") ||
    p.includes("components/customer") ||
    p.includes("app/admin/") ||
    p.includes("app/superadmin/") ||
    p.includes("app/t/")
  );
}

function getTargetFiles(): string[] {
  if (FILE_ARGS.length > 0) {
    return FILE_ARGS
      .map((f) => resolve(process.cwd(), f))
      .filter((f) => existsSync(f) && (f.endsWith(".tsx") || f.endsWith(".ts")))
      .filter(isInScope);
  }
  if (MODE_STAGED) {
    try {
      const out = execSync("git diff --cached --name-only --diff-filter=ACMR", { encoding: "utf8" });
      return out
        .split("\n")
        .filter((f) => f && (f.endsWith(".tsx") || f.endsWith(".ts")))
        .filter(isInScope)
        .map((f) => resolve(process.cwd(), f))
        .filter((f) => existsSync(f));
    } catch {
      return [];
    }
  }
  const roots = [
    join(process.cwd(), "components", "admin"),
    join(process.cwd(), "components", "superadmin"),
    join(process.cwd(), "components", "store"),
    join(process.cwd(), "components", "ui-system"),
    join(process.cwd(), "components", "customer"),
    join(process.cwd(), "app", "admin"),
    join(process.cwd(), "app", "superadmin"),
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
  const fileIsAdmin = isAdminPath(file);
  for (const rawRule of RULES) {
    if (isWhitelisted(file, rawRule.id)) continue;
    if (rawRule.adminOnly && !fileIsAdmin) continue;
    // Strict mode upgrade: cuando corremos --design-strict, las reglas con
    // strictUpgrade=true se elevan a error (CI gate duro).
    const rule: Rule =
      MODE_DESIGN_STRICT && rawRule.strictUpgrade
        ? { ...rawRule, severity: "error" }
        : rawRule;
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
