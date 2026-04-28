#!/usr/bin/env node
/**
 * post-edit-typography-lint — detecta texto diminuto, filtros flacos
 * y tokens hardcoded gray-* sin dark variant en componentes UI cliente.
 *
 * Triggers en Edit/Write/MultiEdit sobre:
 *   - components/marketplace/**
 *   - components/store/**
 *   - app/marketplace/**
 *   - app/(store)/**
 *
 * Severity: WARNING (non-blocking). Sólo emite mensaje al stderr para que
 * el agente lo vea en el siguiente turno y aplique el skill bsm-typography-rules.
 *
 * Reglas (basadas en .claude/skills/bsm-typography-rules/SKILL.md):
 *   - text-2xs / text-[length:var(--ts-2xs)] → SOLO en kicker/sparkline/badge
 *   - text-xs en p/span de body → debería ser text-sm o text-base
 *   - h-8/h-9 en input/button con role=combobox → debería ser h-12 mín
 *   - border (no border-2) en filtros → flat look
 *   - text-gray-{500,600,700,900} sin dark: → no respeta dark mode
 *   - bg-gray-50/100 sin dark: → idem
 */
import fs from "node:fs";
import path from "node:path";

const TRIGGER_GLOBS = [
  /^components\/marketplace\//,
  /^components\/store\//,
  /^app\/marketplace\//,
  /^app\/\(store\)\//,
];

const SKIP_FILES = [
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /\.stories\.tsx?$/,
];

const RULES = [
  {
    id: "tiny-body-text",
    pattern: /<(p|span|div)[^>]*\bclassName=["'][^"']*\b(text-2xs|text-\[10px\]|text-\[length:var\(--ts-2xs\)\])\b[^"']*["'][^>]*>(?!\s*(\{?\d|S\/|\$|%|·|\*|↗|↘))/g,
    message: "text-2xs/10px en body — usar mín text-xs (badge/kicker) o text-sm (body)",
  },
  {
    id: "gray-no-dark-text",
    pattern: /\btext-gray-(500|600|700|800|900)\b(?![^"]*dark:text-)/g,
    message: "text-gray-N sin dark: variant — usar var(--text-secondary|primary|tertiary)",
  },
  {
    id: "gray-no-dark-bg",
    pattern: /\bbg-(gray|slate|neutral)-(50|100|200)\b(?![^"]*dark:bg-)/g,
    message: "bg-gray-N sin dark: variant — usar var(--surface-sunken|raised)",
  },
  {
    id: "border-1px-filter",
    pattern: /<(input|select|button)[^>]*\bclassName=["'][^"']*\bborder\b(?!-[2-9])(?![^"']*\brounded-2xl\b)[^"']*["'][^>]*role=["'](search|combobox)/g,
    message: "Filtro con border 1px — debería ser border-2 + rounded-2xl",
  },
];

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(raw);
    const toolName = payload?.tool_name ?? "";
    if (!["Edit", "Write", "MultiEdit"].includes(toolName)) return process.exit(0);

    const filePath = payload?.tool_input?.file_path ?? "";
    if (!filePath) return process.exit(0);

    const rel = path.relative(process.cwd(), filePath);
    if (!TRIGGER_GLOBS.some((re) => re.test(rel))) return process.exit(0);
    if (SKIP_FILES.some((re) => re.test(rel))) return process.exit(0);
    if (!fs.existsSync(filePath)) return process.exit(0);

    const content = fs.readFileSync(filePath, "utf8");
    const issues = [];

    for (const rule of RULES) {
      const matches = content.match(rule.pattern);
      if (matches && matches.length > 0) {
        issues.push({ id: rule.id, count: matches.length, message: rule.message, sample: matches[0]?.slice(0, 80) });
      }
    }

    if (issues.length === 0) return process.exit(0);

    process.stderr.write(`\n[typography-lint] ${rel} — ${issues.length} regla(s) violadas:\n`);
    for (const i of issues) {
      process.stderr.write(`  · [${i.id}] ${i.count}× — ${i.message}\n    Sample: ${i.sample}\n`);
    }
    process.stderr.write(`  Skill: /bsm-typography-rules para ver mínimos por contexto.\n\n`);
  } catch (err) {
    // silencioso
  }
  process.exit(0);
});
