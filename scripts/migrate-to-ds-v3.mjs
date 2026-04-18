#!/usr/bin/env node
/**
 * migrate-to-ds-v3.mjs — AST-aware migrator Sprint D (ADR-075 addendum).
 *
 * Extiende v2 con carriers adicionales y mapping de decoratives neutrales:
 *
 *  1. Carrier keys ampliados:
 *     - barColor, tierColor, tagColor, spinnerColor
 *     - intentClass, tagClass, dotClass, headerClass
 *     - header, cell, ringClass, chipClass
 *     - tone, toneClass, toneBg, toneText
 *
 *  2. VariableDeclarator tracking:
 *     - const alertClass = isX ? "bg-red-50 ..." : "bg-gray-50";  → ternario ambas ramas.
 *     - const pillCls = "bg-amber-50 border-amber-200 ...";       → string literal top-level.
 *     - const TONE_CLASSES = { error: "bg-red-50 ...", ... };     → object expression.
 *
 *  3. Map NEUTRAL_DECORATIVES (indigo/violet/purple/pink) → info.
 *     (v2 los dejaba sin tocar — en Sprint D se unifican a info para cerrar residuo.)
 *
 *  4. Intensidad 400 explicita (v2 ya la soporta, pero el mapper para bg-*-400
 *     devolvia DEFAULT sin considerar que el visual era "soft" — en v3 usamos
 *     el DEFAULT del state igualmente, comportamiento correcto).
 *
 * Whitelist + danger zone preservados identicos a v2.
 *
 * Modos:
 *   --dry-run (default) / --apply / --stats / --report FILE
 *
 * @example
 *   node scripts/migrate-to-ds-v3.mjs --dry-run
 *   node scripts/migrate-to-ds-v3.mjs --apply --report reports/baseline/2026-04-17-ds-sprint-d/migrate-v3.txt
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";

const traverse = _traverse.default ?? _traverse;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const STATS_ONLY = args.includes("--stats");
const REPORT_IDX = args.indexOf("--report");
const REPORT_FILE = REPORT_IDX >= 0 ? args[REPORT_IDX + 1] : null;

// ── Mapping decorative color → DS state ──────────────────────────────────────
// Diferencia con v2: en v3 NEUTRAL_DECORATIVES mapean a "info" en lugar
// de dejarse sin tocar. Esto cierra el residuo de ds-no-decorative-color-admin.
const COLOR_TO_STATE = {
  red: "error",
  amber: "warning",
  yellow: "warning",
  orange: "warning",
  emerald: "success",
  green: "success",
  blue: "info",
  sky: "info",
  cyan: "info",
  // Promoted from NEUTRAL_DECORATIVES → info (Sprint D):
  indigo: "info",
  violet: "info",
  purple: "info",
  pink: "info",
};

function tokenFor(prefix, state, intensity) {
  if (prefix === "bg" && (intensity === "50" || intensity === "100")) {
    return `var(--data-${state}-${intensity})`;
  }
  return `var(--data-${state})`;
}

// ── Whitelist / danger zone ──────────────────────────────────────────────────
const EXCLUDE = [
  /packages[\\/]design-system[\\/]/,
  /components[\\/]landing[\\/]/,
  /components[\\/]store[\\/]/,
  /components[\\/]customer[\\/]/,
  /app[\\/]\(store\)[\\/]/,
  /app[\\/]marketplace[\\/]/,
  /app[\\/]t[\\/]/,
  /\.stories\.tsx?$/,
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
];

const DANGER_ZONE = [
  /components[\\/]checkout[\\/]/,
  /CheckoutModal\.tsx$/,
  /lib[\\/]db[\\/]orders\.db\.ts$/,
  /lib[\\/]auth[\\/]role-permissions\.ts$/,
  /^.*proxy\.ts$/,
  /lib[\\/]middleware[\\/]/,
  /prisma[\\/]schema\.prisma$/,
  /contexts[\\/]cart-context\.tsx$/,
];

function isExcluded(file) {
  return EXCLUDE.some((r) => r.test(file)) || DANGER_ZONE.some((r) => r.test(file));
}

// ── Pattern ────────────────────────────────────────────────────────────────
function buildPatterns() {
  const states = Object.keys(COLOR_TO_STATE);
  const intensities = "(50|100|200|300|400|500|600|700|800|900)";
  const pattern = new RegExp(
    `(?<![\\w:-])((?:(?:dark|hover|focus|focus-visible|group-hover|peer-hover|active|disabled|sm|md|lg|xl|2xl):)*)(bg|text|border|ring|fill|stroke|placeholder)-(${states.join("|")})-${intensities}(?![\\w\\[])`,
    "g",
  );
  return pattern;
}
const PATTERN = buildPatterns();

// ── Carrier keys (v3 extendido) ──────────────────────────────────────────────
const CLASSNAME_CARRIER_KEYS = new Set([
  // v2 keys
  "className", "class",
  "color", "bg", "badge", "cls", "dot", "row", "accent",
  "border", "text", "fill", "stroke",
  "iconClass", "iconColor", "iconBg",
  "textClass", "bgClass", "borderClass",
  "active", "inactive", "hover",
  "light", "dark",
  "success", "warning", "error", "info",
  "primary", "secondary",
  "pill", "chip", "tag", "tile",
  "variant", "style", "theme",
  "headerClass", "cellClass", "rowClass",
  "selectedClass", "hoverClass",
  // v3 new carriers
  "barColor", "tierColor", "tagColor", "spinnerColor",
  "intentClass", "tagClass", "dotClass", "header",
  "cell", "ringClass", "chipClass",
  "tone", "toneClass", "toneBg", "toneText",
  "chipBg", "chipText", "chipBorder",
  "pillBg", "pillText",
  "indicator", "indicatorClass", "indicatorColor",
  "status", "statusClass",
  "btnClass", "buttonClass",
]);

function looksLikeTailwind(s) {
  if (typeof s !== "string" || s.length < 4 || s.length > 500) return false;
  return /\b(bg|text|border|ring|fill|stroke|placeholder|rounded|p|m|w|h|flex|grid|items|justify|dark:)[a-z:-]*-[0-9a-z]+/.test(s)
    || /\b(dark|hover|focus|group-hover):(bg|text|border)-/.test(s);
}

function transformClassName(str) {
  const ruleHits = new Map();
  let count = 0;
  const result = str.replace(PATTERN, (full, modifiers, prefix, colorName, intensity) => {
    const state = COLOR_TO_STATE[colorName];
    if (!state) return full;
    const token = tokenFor(prefix, state, intensity);
    const newCls = `${modifiers}${prefix}-[${token}]`;
    const id = `${prefix}-${colorName}-${intensity}`;
    ruleHits.set(id, (ruleHits.get(id) ?? 0) + 1);
    count++;
    return newCls;
  });
  return { result, count, ruleHits };
}

// ── AST transform ────────────────────────────────────────────────────────────
function transformFile(source, filePath) {
  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: [
        "jsx",
        "typescript",
        "decorators-legacy",
        "classProperties",
        "classPrivateProperties",
        "classPrivateMethods",
      ],
      errorRecovery: true,
    });
  } catch (e) {
    return { source, count: 0, ruleHits: new Map(), parseError: e.message };
  }

  const edits = [];
  const ruleHitsTotal = new Map();

  traverse(ast, {
    JSXAttribute(path) {
      const name = path.node.name;
      if (!name || name.type !== "JSXIdentifier" || name.name !== "className") return;
      const value = path.node.value;
      if (!value) return;
      visitClassNameValue(value, edits, ruleHitsTotal);
    },
    ObjectProperty(path) {
      const key = path.node.key;
      const keyName =
        key.type === "Identifier" ? key.name : key.type === "StringLiteral" ? key.value : null;
      if (!keyName) return;
      if (!CLASSNAME_CARRIER_KEYS.has(keyName)) return;
      const value = path.node.value;
      if (!value) return;
      if (value.type === "StringLiteral" && looksLikeTailwind(value.value)) {
        addEditIfChanged(value, value.value, edits, ruleHitsTotal, '"');
      } else if (value.type === "TemplateLiteral") {
        for (const q of value.quasis) {
          if (!q.value) continue;
          if (looksLikeTailwind(q.value.raw)) addEditQuasiIfChanged(q, edits, ruleHitsTotal);
        }
      } else if (value.type === "ConditionalExpression") {
        visitExpression(value, edits, ruleHitsTotal);
      } else if (value.type === "LogicalExpression") {
        visitExpression(value, edits, ruleHitsTotal);
      } else if (value.type === "ObjectExpression") {
        // Nested object: { vip: { barColor: "bg-yellow-400" } }
        visitExpression(value, edits, ruleHitsTotal);
      } else if (value.type === "CallExpression") {
        visitExpression(value, edits, ruleHitsTotal);
      }
    },
    // ── NEW: VariableDeclarator con classname patterns ───────────────────────
    // Ejemplo:
    //   const alertClass = isError ? "bg-red-50" : "bg-gray-50";
    //   const TONE_CLASSES = { error: "...", success: "..." };  (ya cubierto por ObjectProperty)
    //   const pillCls = "bg-amber-50 border-amber-200 ...";
    VariableDeclarator(path) {
      const id = path.node.id;
      if (!id || id.type !== "Identifier") return;
      const name = id.name;
      // Heuristica: variables con sufijo Class/Cls/Color/Classes/Tones etc.
      if (!/(Class|Cls|Color|Classes|Tones|Theme|Style|Variant|Intent|Pill|Badge|Chip|Tag|Dot|Bg|Bar)s?$/i.test(name)) {
        return;
      }
      const init = path.node.init;
      if (!init) return;
      if (init.type === "StringLiteral" && looksLikeTailwind(init.value)) {
        addEditIfChanged(init, init.value, edits, ruleHitsTotal, '"');
      } else if (
        init.type === "ConditionalExpression" ||
        init.type === "LogicalExpression" ||
        init.type === "TemplateLiteral" ||
        init.type === "CallExpression" ||
        init.type === "ObjectExpression"
      ) {
        visitExpression(init, edits, ruleHitsTotal);
      }
    },
  });

  if (edits.length === 0) {
    return { source, count: 0, ruleHits: ruleHitsTotal };
  }

  edits.sort((a, b) => b.start - a.start);
  // Dedup edits por start (en caso de que múltiples visitors visiten el mismo nodo).
  const seenStarts = new Set();
  const dedupEdits = [];
  for (const e of edits) {
    const key = `${e.start}-${e.end}`;
    if (seenStarts.has(key)) continue;
    seenStarts.add(key);
    dedupEdits.push(e);
  }

  let result = source;
  for (const e of dedupEdits) {
    result = result.slice(0, e.start) + e.replacement + result.slice(e.end);
  }
  const count = Array.from(ruleHitsTotal.values()).reduce((s, n) => s + n, 0);
  return { source: result, count, ruleHits: ruleHitsTotal };
}

function visitClassNameValue(value, edits, ruleHitsTotal) {
  if (!value) return;
  if (value.type === "StringLiteral") {
    addEditIfChanged(value, value.value, edits, ruleHitsTotal, '"');
    return;
  }
  if (value.type === "JSXExpressionContainer") {
    visitExpression(value.expression, edits, ruleHitsTotal);
  }
}

function visitExpression(expr, edits, ruleHitsTotal) {
  if (!expr) return;
  switch (expr.type) {
    case "StringLiteral":
      addEditIfChanged(expr, expr.value, edits, ruleHitsTotal, '"');
      return;
    case "TemplateLiteral":
      for (const q of expr.quasis) {
        if (!q.value || typeof q.value.raw !== "string") continue;
        addEditQuasiIfChanged(q, edits, ruleHitsTotal);
      }
      for (const e of expr.expressions) visitExpression(e, edits, ruleHitsTotal);
      return;
    case "ConditionalExpression":
      visitExpression(expr.consequent, edits, ruleHitsTotal);
      visitExpression(expr.alternate, edits, ruleHitsTotal);
      return;
    case "LogicalExpression":
      visitExpression(expr.left, edits, ruleHitsTotal);
      visitExpression(expr.right, edits, ruleHitsTotal);
      return;
    case "CallExpression":
      for (const arg of expr.arguments) {
        if (arg.type === "SpreadElement") visitExpression(arg.argument, edits, ruleHitsTotal);
        else visitExpression(arg, edits, ruleHitsTotal);
      }
      return;
    case "ArrayExpression": {
      const colorEls = expr.elements.filter(
        (el) => el && el.type === "StringLiteral" && /^#[0-9a-fA-F]{3,8}$/.test(el.value),
      );
      if (colorEls.length >= 3) return;
      for (const el of expr.elements) {
        if (el) visitExpression(el, edits, ruleHitsTotal);
      }
      return;
    }
    case "ObjectExpression":
      for (const p of expr.properties) {
        if (p.type === "ObjectProperty") {
          // Aplicamos transform al value si es string/template/ternary literal,
          // respetando la heuristica "looksLikeTailwind".
          const v = p.value;
          if (v.type === "StringLiteral" && looksLikeTailwind(v.value)) {
            addEditIfChanged(v, v.value, edits, ruleHitsTotal, '"');
          } else {
            visitExpression(v, edits, ruleHitsTotal);
          }
        }
      }
      return;
    default:
      return;
  }
}

function addEditIfChanged(node, stringValue, edits, ruleHitsTotal, quote) {
  const { result, count, ruleHits } = transformClassName(stringValue);
  if (count === 0) return;
  const escaped = result.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), `\\${quote}`);
  const replacement = `${quote}${escaped}${quote}`;
  edits.push({ start: node.start, end: node.end, replacement });
  for (const [k, v] of ruleHits) {
    ruleHitsTotal.set(k, (ruleHitsTotal.get(k) ?? 0) + v);
  }
}

function addEditQuasiIfChanged(quasi, edits, ruleHitsTotal) {
  const raw = quasi.value.raw;
  const { result, count, ruleHits } = transformClassName(raw);
  if (count === 0) return;
  edits.push({
    start: quasi.start,
    end: quasi.end,
    replacement: result,
  });
  for (const [k, v] of ruleHits) {
    ruleHitsTotal.set(k, (ruleHitsTotal.get(k) ?? 0) + v);
  }
}

// ── File discovery ─────────────────────────────────────────────────────────
const ROOTS = [
  "components/admin",
  "components/superadmin",
  "app/admin",
  "app/superadmin",
];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile() && (full.endsWith(".tsx") || full.endsWith(".ts"))) acc.push(full);
  }
  return acc;
}

function getTargetFiles() {
  const files = ROOTS.flatMap((r) => walk(resolve(process.cwd(), r)));
  return files.filter((f) => !isExcluded(f));
}

// ── Main ─────────────────────────────────────────────────────────────────
function main() {
  const files = getTargetFiles();
  const results = [];
  const globalRuleHits = new Map();
  const parseErrors = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const { source: newSource, count, ruleHits, parseError } = transformFile(source, file);
    if (parseError) {
      parseErrors.push({ file, error: parseError });
      continue;
    }
    if (count === 0) continue;
    results.push({ file, before: source, after: newSource, count, ruleHits });
    for (const [k, v] of ruleHits) {
      globalRuleHits.set(k, (globalRuleHits.get(k) ?? 0) + v);
    }
  }

  const lines = [];
  const totalChanges = results.reduce((s, r) => s + r.count, 0);
  lines.push(`migrate-to-ds-v3 — ${APPLY ? "APPLY" : "DRY RUN"}`);
  lines.push(`Archivos escaneados: ${files.length}`);
  lines.push(`Archivos con cambios: ${results.length}`);
  lines.push(`Total reemplazos: ${totalChanges}`);
  lines.push(`Parse errors: ${parseErrors.length}`);
  lines.push("");
  lines.push("Top reglas:");
  const sortedRules = [...globalRuleHits.entries()].sort((a, b) => b[1] - a[1]);
  for (const [rule, n] of sortedRules.slice(0, 40)) {
    lines.push(`  ${String(n).padStart(5)}  ${rule}`);
  }
  lines.push("");
  if (!STATS_ONLY) {
    lines.push("Archivos afectados (top 40):");
    const top = [...results].sort((a, b) => b.count - a.count).slice(0, 40);
    for (const r of top) {
      const rel = r.file.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, "");
      lines.push(`  ${String(r.count).padStart(4)}  ${rel}`);
    }
  }
  if (parseErrors.length > 0) {
    lines.push("");
    lines.push("Parse errors (skipped):");
    for (const pe of parseErrors.slice(0, 20)) {
      const rel = pe.file.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, "");
      lines.push(`  ${rel}: ${pe.error}`);
    }
  }

  const report = lines.join("\n");
  console.log(report);
  if (REPORT_FILE) {
    writeFileSync(REPORT_FILE, report, "utf8");
    console.log(`\nReport guardado en ${REPORT_FILE}`);
  }

  if (!APPLY) {
    console.log("\n(dry-run — usar --apply para escribir cambios)");
    return;
  }

  for (const r of results) {
    writeFileSync(r.file, r.after, "utf8");
  }
  console.log(`\nAplicados ${totalChanges} cambios en ${results.length} archivos.`);
}

main();
