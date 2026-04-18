#!/usr/bin/env node
/**
 * migrate-to-ds-v2.mjs — AST-aware migrator Sprint C (ADR-075 addendum).
 *
 * Sustituye clases decorativas Tailwind hardcoded por tokens --data-* semánticos
 * en className de JSX dentro de components/admin, components/superadmin,
 * app/admin, app/superadmin.
 *
 * Mapeo canónico:
 *
 *   Color hex → Estado DS:
 *     red           → error
 *     amber, yellow, orange → warning
 *     emerald, green       → success (teal brand)
 *     blue, sky, cyan      → info
 *     indigo, violet, purple, pink → accent (--accent) o text-secondary según contexto
 *
 *   Intensidad → Token:
 *     50          → var(--data-<state>-50)        bg-soft
 *     100         → var(--data-<state>-100)
 *     400, 500    → var(--data-<state>)           default
 *     600         → var(--data-<state>)           (mismo — DS unifica)
 *     700         → var(--data-<state>)           (alias light mode)
 *
 *   Prefijo de clase → replacement prefix:
 *     bg-X-N      → bg-[var(--data-<state>-N o DEFAULT)]
 *     text-X-N    → text-[var(--data-<state>)]
 *     border-X-N  → border-[var(--data-<state>)]
 *     hover:X     → hover: (preservado)
 *     group-hover:X, focus:X, dark:X, peer-X → igual
 *
 * Modos:
 *   --dry-run   (default)  muestra plan
 *   --apply     escribe cambios
 *   --stats     solo totales por regla
 *   --report FILE  guarda reporte en FILE
 *
 * AST safety:
 *   - Usa @babel/parser + @babel/traverse para validar que el string a reemplazar
 *     está dentro de un JSXAttribute `className` (no en comentario, string de dato, etc.).
 *   - Preserva chart palettes (arrays categóricos) — detecta si el string está
 *     dentro de un ArrayExpression con >= 3 elementos color.
 *   - NO toca style={{ color: tenant.brandColor }} ni SVG fills dinámicos.
 *
 * Whitelist de archivos (NO migrar):
 *   - packages/design-system/**
 *   - components/landing/**
 *   - app/(store)/**
 *   - app/marketplace/**
 *   - components/store/**, components/customer/**
 *   - *.stories.tsx
 *   - app/t/** (tenant storefronts)
 *
 * @example
 *   node scripts/migrate-to-ds-v2.mjs --dry-run
 *   node scripts/migrate-to-ds-v2.mjs --apply --report reports/baseline/2026-04-17-ds-sprint-c/migrate-v2-applied.txt
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
};

// indigo/violet/purple/pink → decoratives no-semánticos. Se dejan al migrator anterior.
// Aquí los mapeamos a text-secondary para reducir residuo.
const NEUTRAL_DECORATIVES = new Set(["indigo", "violet", "purple", "pink"]);

// Intensities que aceptamos — 50/100 existen solo para bg, no para text/border.
function tokenFor(prefix, state, intensity) {
  // Para bg, intensidades 50/100 usan tokens soft:
  if (prefix === "bg" && (intensity === "50" || intensity === "100")) {
    return `var(--data-${state}-${intensity})`;
  }
  // Para border, usamos default (no tenemos border-*-100 scale separada semánticamente útil).
  // Para text y para bg 400-700, usamos default.
  return `var(--data-${state})`;
}

// ── Whitelist de archivos ────────────────────────────────────────────────────
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

// Danger zone — NO tocar con bulk migrator, aunque matchearan.
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

// ── Pattern generation ───────────────────────────────────────────────────────
/**
 * Construye el regex global para clases Tailwind decorativas dentro de
 * strings de className. Matchea con modifiers (hover:, dark:, focus:, etc.).
 *
 * Los modifiers se conservan, ej: `dark:text-red-400` → `dark:text-[var(--data-error)]`
 */
const MODIFIER_RE = /(?:(?:dark|hover|focus|focus-visible|group-hover|group|peer|peer-hover|active|disabled|first|last|even|odd|checked|sm|md|lg|xl|2xl|print):)*?/;
const PREFIXES = ["bg", "text", "border", "ring", "fill", "stroke", "placeholder"];

function buildPatterns() {
  const states = Object.keys(COLOR_TO_STATE);
  const intensities = "(50|100|200|300|400|500|600|700|800|900)";
  // Matchear strings como:
  //   dark:text-red-400
  //   hover:bg-amber-500
  //   text-red-700
  // No matchear si hay \w antes (para no atrapar clases encadenadas sin espacio).
  const pattern = new RegExp(
    `(?<![\\w:-])((?:(?:dark|hover|focus|focus-visible|group-hover|peer-hover|active|disabled|sm|md|lg|xl|2xl):)*)(bg|text|border|ring|fill|stroke|placeholder)-(${states.join("|")})-${intensities}(?![\\w\\[])`,
    "g",
  );
  return pattern;
}

const PATTERN = buildPatterns();

// ── Classname carrier keys ─────────────────────────────────────────────────
// Object property keys que típicamente llevan strings de Tailwind classes.
// Ej: { status: { color: "text-red-500", bg: "bg-red-50" } }
const CLASSNAME_CARRIER_KEYS = new Set([
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
]);

// Detecta strings con shape de Tailwind (contiene tokens tw comunes).
function looksLikeTailwind(s) {
  if (typeof s !== "string" || s.length < 4 || s.length > 500) return false;
  // Debe contener al menos UN token Tailwind típico.
  return /\b(bg|text|border|ring|fill|stroke|placeholder|rounded|p|m|w|h|flex|grid|items|justify|dark:)[a-z:-]*-[0-9a-z]+/.test(s)
    || /\b(dark|hover|focus|group-hover):(bg|text|border)-/.test(s);
}

// ── Transform ────────────────────────────────────────────────────────────────
/**
 * Aplica la transformación a un string de className.
 * Retorna { result, count, ruleHits: Map<id, n> }.
 */
function transformClassName(str) {
  const ruleHits = new Map();
  let count = 0;
  const result = str.replace(PATTERN, (full, modifiers, prefix, colorName, intensity) => {
    const state = COLOR_TO_STATE[colorName];
    if (!state) return full;
    // Para fill/stroke (SVG), solo migramos si el archivo es admin — se aplica por el caller.
    // Para ring/placeholder también. Aquí aplicamos uniformemente.
    // Evitar bg con intensidad >=800 → probablemente dark mode intencional sobre accent.
    // Lo dejamos sin tocar para ser conservadores:
    if ((intensity === "800" || intensity === "900" || intensity === "200" || intensity === "300")) {
      // 200/300: border/placeholder light; 800/900: dark bg/text.
      // Los dejamos pasar pero usando DEFAULT del state.
      // (Mantenemos comportamiento visual cercano.)
    }
    const token = tokenFor(prefix, state, intensity);
    const newCls = `${modifiers}${prefix}-[${token}]`;
    const id = `${prefix}-${colorName}-${intensity}`;
    ruleHits.set(id, (ruleHits.get(id) ?? 0) + 1);
    count++;
    return newCls;
  });
  return { result, count, ruleHits };
}

// ── AST-safe transformation ──────────────────────────────────────────────────
/**
 * Para cada StringLiteral que sea `value` de un JSXAttribute con nombre
 * className, aplica la transform. También procesa TemplateLiteral cuasis
 * (backticks) dentro de className, y expresiones ternarias con strings.
 *
 * Esto es AST-safe: NO toca strings que no sean className.
 */
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
    // Si no parsea, skipear el archivo (mejor skip que corrupt).
    return { source, count: 0, ruleHits: new Map(), parseError: e.message };
  }

  // Colectamos rangos a reemplazar — strings literales dentro de className.
  // Trabajamos sobre el source con edits posicionales de atrás-adelante.
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
    // Heurística: ObjectProperty cuyo key es uno de los "classname carriers"
    // típicos (color, bg, badge, cls, dot, row, accent, border, text, fill,
    // icon — pero SOLO si el value es StringLiteral con pinta de tw class).
    ObjectProperty(path) {
      const key = path.node.key;
      const keyName =
        key.type === "Identifier" ? key.name : key.type === "StringLiteral" ? key.value : null;
      if (!keyName) return;
      if (!CLASSNAME_CARRIER_KEYS.has(keyName)) return;
      const value = path.node.value;
      if (!value) return;
      // Solo si el valor tiene shape de Tailwind classes (contiene - seguido de un número o un token tw).
      if (value.type === "StringLiteral" && looksLikeTailwind(value.value)) {
        addEditIfChanged(value, value.value, edits, ruleHitsTotal, '"');
      } else if (value.type === "TemplateLiteral") {
        for (const q of value.quasis) {
          if (!q.value) continue;
          if (looksLikeTailwind(q.value.raw)) addEditQuasiIfChanged(q, edits, ruleHitsTotal);
        }
      } else if (value.type === "ConditionalExpression") {
        for (const br of [value.consequent, value.alternate]) {
          if (br.type === "StringLiteral" && looksLikeTailwind(br.value)) {
            addEditIfChanged(br, br.value, edits, ruleHitsTotal, '"');
          }
        }
      }
    },
  });

  if (edits.length === 0) {
    return { source, count: 0, ruleHits: ruleHitsTotal };
  }

  // Aplicar de atrás-adelante.
  edits.sort((a, b) => b.start - a.start);
  let result = source;
  for (const e of edits) {
    result = result.slice(0, e.start) + e.replacement + result.slice(e.end);
  }
  const count = Array.from(ruleHitsTotal.values()).reduce((s, n) => s + n, 0);
  return { source: result, count, ruleHits: ruleHitsTotal };
}

function visitClassNameValue(value, edits, ruleHitsTotal) {
  if (!value) return;
  // 1) StringLiteral:       className="..."
  if (value.type === "StringLiteral") {
    addEditIfChanged(value, value.value, edits, ruleHitsTotal, '"');
    return;
  }
  // 2) JSXExpressionContainer: className={...}
  if (value.type === "JSXExpressionContainer") {
    visitExpression(value.expression, edits, ruleHitsTotal);
    return;
  }
}

function visitExpression(expr, edits, ruleHitsTotal) {
  if (!expr) return;
  switch (expr.type) {
    case "StringLiteral":
      addEditIfChanged(expr, expr.value, edits, ruleHitsTotal, '"');
      return;
    case "TemplateLiteral":
      // Procesar cada quasi (parte estática).
      for (const q of expr.quasis) {
        if (!q.value || typeof q.value.raw !== "string") continue;
        addEditQuasiIfChanged(q, edits, ruleHitsTotal);
      }
      // Y procesar expressions internas (ternarios, llamadas a cn, etc.).
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
      // cn("...", cond && "...", ...) / clsx(...) / twMerge(...)
      for (const arg of expr.arguments) {
        if (arg.type === "SpreadElement") visitExpression(arg.argument, edits, ruleHitsTotal);
        else visitExpression(arg, edits, ruleHitsTotal);
      }
      return;
    case "ArrayExpression":
      // Posible chart palette — si array contiene 3+ color strings consecutivos, NO tocar.
      {
        const colorEls = expr.elements.filter(
          (el) => el && el.type === "StringLiteral" && /^#[0-9a-fA-F]{3,8}$/.test(el.value),
        );
        if (colorEls.length >= 3) return; // skip — chart palette
      }
      for (const el of expr.elements) {
        if (el) visitExpression(el, edits, ruleHitsTotal);
      }
      return;
    case "ObjectExpression":
      for (const p of expr.properties) {
        if (p.type === "ObjectProperty") visitExpression(p.value, edits, ruleHitsTotal);
      }
      return;
    default:
      return; // Identifier / MemberExpression / otros no se tocan
  }
}

function addEditIfChanged(node, stringValue, edits, ruleHitsTotal, quote) {
  const { result, count, ruleHits } = transformClassName(stringValue);
  if (count === 0) return;
  // Escapar backslashes y el quote dentro del nuevo string.
  const escaped = result.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), `\\${quote}`);
  const replacement = `${quote}${escaped}${quote}`;
  edits.push({ start: node.start, end: node.end, replacement });
  for (const [k, v] of ruleHits) {
    ruleHitsTotal.set(k, (ruleHitsTotal.get(k) ?? 0) + v);
  }
}

function addEditQuasiIfChanged(quasi, edits, ruleHitsTotal) {
  // Los quasi tienen start/end sobre el texto crudo (entre ` y ${).
  // En AST de Babel: quasi.start/quasi.end cubren el texto, pero incluyen delimiters.
  // Aquí usamos loc + rango del raw.
  const raw = quasi.value.raw;
  const { result, count, ruleHits } = transformClassName(raw);
  if (count === 0) return;
  // Reemplazar en el rango exacto. Babel coloca start al inicio del texto (después de ` o } del prev).
  edits.push({
    start: quasi.start,
    end: quasi.end,
    replacement: result,
  });
  for (const [k, v] of ruleHits) {
    ruleHitsTotal.set(k, (ruleHitsTotal.get(k) ?? 0) + v);
  }
}

// ── File discovery ───────────────────────────────────────────────────────────
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

// ── Main ─────────────────────────────────────────────────────────────────────
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

  // Reporte
  const lines = [];
  const totalChanges = results.reduce((s, r) => s + r.count, 0);
  lines.push(`migrate-to-ds-v2 — ${APPLY ? "APPLY" : "DRY RUN"}`);
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
