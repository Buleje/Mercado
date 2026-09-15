#!/usr/bin/env node
/**
 * post-tool-lint.mjs — PostToolUse hook para Edit/Write/MultiEdit.
 *
 * Corre eslint --fix sobre el archivo tocado. NO corre tsc sobre TODO
 * el proyecto (eso mata el flow) — solo valida sintaxis TS/JS del
 * archivo recién modificado.
 *
 * Es ASYNC (settings.json lo declara con async: true) → no bloquea
 * la respuesta de Claude. Si algo falla, escribe warning al stderr
 * pero no retorna exit 2 (no queremos bloquear edits por lint fails
 * cosmetic — solo los rechazamos en commit via husky pre-commit).
 *
 * Optimización: solo corre en archivos .ts/.tsx/.js/.jsx reales del
 * proyecto. Skipea node_modules, .next, dist, .claude/, docs/.
 *
 * Referencia: https://code.claude.com/docs/en/hooks
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, relative, extname } from "node:path";

const LINTABLE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = [
  "node_modules",
  ".next",
  "dist",
  "build",
  ".claude/worktrees",
  "docs",
  ".husky",
  "coverage",
  "prisma/generated",
  "lib/generated",
];

function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function shouldSkip(relPath) {
  return SKIP_DIRS.some((d) => relPath.startsWith(d + "/") || relPath === d);
}

function isLintable(filePath) {
  return LINTABLE_EXT.has(extname(filePath));
}

// ── Main ────────────────────────────────────────────────────────────────
const input = readInput();
if (!input) process.exit(0);

const tool = input.tool_name;
if (!["Edit", "Write", "MultiEdit"].includes(tool)) {
  process.exit(0);
}

const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

if (!isLintable(filePath)) {
  process.exit(0);
}

const projectRoot =
  process.env.CLAUDE_PROJECT_DIR ||
  process.env.BSM_PROJECT_ROOT ||
  process.cwd();
const abs = resolve(filePath);
const rel = relative(projectRoot, abs).replace(/\\/g, "/");

if (rel.startsWith("..") || shouldSkip(rel)) {
  process.exit(0);
}

try {
  // eslint --fix silencioso sobre UN solo archivo.
  // Usamos --no-error-on-unmatched-pattern por si el path no matchea
  // algún glob de la config de eslint.
  execSync(
    `npx --no eslint --fix --quiet --no-error-on-unmatched-pattern "${rel}"`,
    {
      cwd: projectRoot,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 20_000,
    }
  );

  if (process.env.BSM_HOOKS_DEBUG === "1") {
    process.stderr.write(`✅ post-tool-lint: ${rel} OK\n`);
  }
} catch (err) {
  // NO bloqueamos. Solo avisamos.
  const stderr = (err.stderr?.toString?.() ?? "").trim();
  if (stderr && process.env.BSM_HOOKS_DEBUG === "1") {
    process.stderr.write(`⚠️  post-tool-lint: ${rel}\n${stderr}\n`);
  }
}

process.exit(0);
