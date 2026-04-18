#!/usr/bin/env node
/**
 * migrate-to-ds.mjs — Transformaciones bulk idempotentes para ADR-075.
 *
 * Aplica un set de transformaciones seguras que reducen violations del DS
 * sin cambiar comportamiento ni semantica visual.
 *
 * Transformaciones aplicadas:
 *   1. text-gray-900 / text-gray-{700,800}      → text-[var(--text-primary)]
 *   2. text-gray-{500,600}                      → text-[var(--text-secondary)]
 *   3. text-gray-{300,400}                      → text-[var(--text-tertiary)]
 *   4. from "lucide-react"                      → from "@buleje/design-system/icons"
 *                                                 (solo en components/admin/** y app/admin/**,
 *                                                  excluye shared/, layout/, packages/design-system)
 *   5. REPORTE (no cambia): text-blue-{500,600}, bg-blue-{500,600}
 *      — se listan para decision manual porque pueden ser accent de brand.
 *
 * Flags:
 *   --dry-run     (default) solo reporta, NO cambia archivos
 *   --apply       aplica cambios
 *   --report FILE escribe reporte detallado a FILE
 *
 * @example
 *   node scripts/migrate-to-ds.mjs --dry-run
 *   node scripts/migrate-to-ds.mjs --apply --report reports/migration-applied.txt
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const REPORT_IDX = args.indexOf("--report");
const REPORT_FILE = REPORT_IDX >= 0 ? args[REPORT_IDX + 1] : null;

if (!APPLY) {
  console.log("DRY RUN — no se escriben archivos. Usa --apply para aplicar.\n");
}

// ── Transformaciones idempotentes ─────────────────────────────────────────────
const TRANSFORMS = [
  // Order matters: primero los mas especificos (900/800/700), luego 600/500, luego 400/300.
  {
    id: "text-gray-900-to-primary",
    pattern: /(?<![\w-])text-gray-900(?!\w)/g,
    replacement: "text-[var(--text-primary)]",
  },
  {
    id: "text-gray-800-to-primary",
    pattern: /(?<![\w-])text-gray-800(?!\w)/g,
    replacement: "text-[var(--text-primary)]",
  },
  {
    id: "text-gray-700-to-primary",
    pattern: /(?<![\w-])text-gray-700(?!\w)/g,
    replacement: "text-[var(--text-primary)]",
  },
  {
    id: "text-gray-600-to-secondary",
    pattern: /(?<![\w-])text-gray-600(?!\w)/g,
    replacement: "text-[var(--text-secondary)]",
  },
  {
    id: "text-gray-500-to-secondary",
    pattern: /(?<![\w-])text-gray-500(?!\w)/g,
    replacement: "text-[var(--text-secondary)]",
  },
  {
    id: "text-gray-400-to-tertiary",
    pattern: /(?<![\w-])text-gray-400(?!\w)/g,
    replacement: "text-[var(--text-tertiary)]",
  },
  {
    id: "text-gray-300-to-tertiary",
    pattern: /(?<![\w-])text-gray-300(?!\w)/g,
    replacement: "text-[var(--text-tertiary)]",
  },
];

// Solo se aplica en archivos admin. Excluye DS, shared/ y layout/.
const LUCIDE_TRANSFORM = {
  id: "lucide-import-to-ds",
  // Soporta tanto single como double quotes.
  pattern: /from\s+(["'])lucide-react\1/g,
  replacement: 'from "@buleje/design-system/icons"',
};

// ── Sprint B1: h1/h2/h3 con clases de diseño → DS typography ──────────────────
// Heuristica: si el className incluye tokens de tamaño/peso/leading/tracking,
// se considera "decorativo" y se reemplaza por el primitive del DS.
// Si el className es SOLO layout (text-center, ml-auto, flex, etc.) se deja.
const DESIGN_CLASS_RE = /\b(text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|fs-[\w-]+|\[length:var[^\]]*\])|font-(?:thin|light|normal|medium|semibold|bold|extrabold|black)|leading-(?:none|tight|snug|normal|relaxed|loose|\[var[^\]]*\])|tracking-(?:tighter|tight|normal|wide|wider|widest|\[var[^\]]*\]))\b/;

const HEADING_MAP = {
  h1: "PageTitle",
  h2: "SectionTitle",
  h3: "CardTitle",
};

// Archivos donde NO migrar headings (customer-facing / editoriales / primitives / stories)
const HEADING_EXCLUDE = [
  /packages[\\/]design-system[\\/]/,
  /components[\\/]landing[\\/]/,
  /components[\\/]admin[\\/]shared[\\/]/,
  /components[\\/]admin[\\/]layout[\\/]/,
  /\.stories\.tsx?$/,
  /app[\\/]\(store\)[\\/]/,
  /app[\\/]marketplace[\\/]/,
  /components[\\/]store[\\/]/,
  /components[\\/]customer[\\/]/,
  /app[\\/]t[\\/]/,
];

/**
 * Transforma <h[1-3] className="..."> → <DSComp className="...">
 * Reglas:
 *  - Si className incluye clases de diseño (size/weight/leading/tracking) → migrar.
 *  - Si className NO las incluye (solo layout) → dejar.
 *  - Preservar otros attrs (id, role, data-*).
 *  - Preservar className no-diseño (remove solo las decorativas si viable, o dejar todas).
 *  - Return: { content, count } con numero de reemplazos.
 *
 * NOTA: preservamos el className completo — el DS hace cn() y tailwind-merge
 * reconciliará si hay colisión. Esto evita romper layouts custom.
 */
function migrateHeadings(content, filePath) {
  if (HEADING_EXCLUDE.some((rx) => rx.test(filePath))) return { content, counts: {} };
  const counts = { h1: 0, h2: 0, h3: 0 };
  const usedComps = new Set();
  // Match openings: <h1 ... > | <h1 .../> (con atributos, multi-línea).
  const headingRe = /<(h[123])([\s\S]*?)(\s*\/?>)/g;
  let newContent = content.replace(headingRe, (full, tag, attrs, closer) => {
    // Solo procesar si tiene className.
    const classMatch = attrs.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
    if (!classMatch) return full;
    const classStr = classMatch[1] ?? classMatch[2] ?? "";
    if (!DESIGN_CLASS_RE.test(classStr)) return full;
    const comp = HEADING_MAP[tag];
    if (!comp) return full;
    counts[tag] = (counts[tag] ?? 0) + 1;
    usedComps.add(comp);
    // Reemplaza tag opening → <DSComp attrs... closer
    // Reemplaza closing tag </h1> a </DSComp> se hace aparte abajo.
    return `<${comp}${attrs}${closer}`;
  });
  // Reemplazo de closing tags debe ser 1:1 con los opens transformados.
  // Estrategia: reemplazar </h1></h2></h3> en orden, siempre que haya
  // count en counts. Balanceamos con una mini-pila.
  // Implementacion simple: recorrer newContent y tag stack en paralelo.
  if (counts.h1 + counts.h2 + counts.h3 === 0) return { content: newContent, counts };
  // Re-procesar: encontrar pares <PageTitle ...> ... </h1> y reemplazar </h1> por </PageTitle>.
  // Usamos un parser lineal que cuenta aperturas.
  newContent = balanceClosers(newContent, counts);
  // Auto-agregar import DS si se usó algún comp.
  if (usedComps.size > 0) {
    newContent = ensureDSImport(newContent, Array.from(usedComps));
  }
  return { content: newContent, counts };
}

/**
 * Recorre content y para cada apertura <PageTitle|SectionTitle|CardTitle
 * buscamos su </h1|</h2|</h3 de cierre (respetando anidamiento del mismo tag original)
 * y lo reemplazamos por el closing del DS comp.
 *
 * Simplificación: como las transformaciones se hacen sobre código bien formado,
 * y los headings no se anidan (h1 dentro de h1 es invalido), hacemos un pase
 * linear emparejando el primer closer compatible después de cada opener.
 */
function balanceClosers(content, _counts) {
  const DS_TAGS = ["PageTitle", "SectionTitle", "CardTitle"];
  const ORIG_MAP = { PageTitle: "h1", SectionTitle: "h2", CardTitle: "h3" };
  // Estrategia segura y correcta: recorremos con una pila que trackea aperturas.
  const result = [];
  let i = 0;
  const stack = [];
  while (i < content.length) {
    // Check closer </hN>
    if (content[i] === "<" && content[i + 1] === "/") {
      const closerMatch = /^<\/(h[123])\s*>/.exec(content.slice(i));
      if (closerMatch) {
        const htag = closerMatch[1];
        // Si el top de la pila es un DS comp cuyo original es htag, cerrar con DS.
        const top = stack[stack.length - 1];
        if (top && ORIG_MAP[top] === htag) {
          result.push(`</${top}>`);
          stack.pop();
          i += closerMatch[0].length;
          continue;
        }
        // Si no, dejar tal cual (heading no migrado).
        result.push(closerMatch[0]);
        i += closerMatch[0].length;
        continue;
      }
    }
    // Check opener <PageTitle | <SectionTitle | <CardTitle
    if (content[i] === "<") {
      let matchedTag = null;
      for (const t of DS_TAGS) {
        if (content.startsWith(`<${t}`, i) && /[\s>/]/.test(content[i + t.length + 1] ?? "")) {
          matchedTag = t;
          break;
        }
      }
      if (matchedTag) {
        // encontrar el > que cierra la apertura (respetando {} y "")
        let j = i + 1;
        let depth = 0;
        let inSingle = false;
        let inDouble = false;
        let inBacktick = false;
        while (j < content.length) {
          const ch = content[j];
          if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
          else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
          else if (!inSingle && !inDouble && ch === "`") inBacktick = !inBacktick;
          else if (!inSingle && !inDouble && !inBacktick) {
            if (ch === "{") depth++;
            else if (ch === "}") depth--;
            else if (ch === ">" && depth === 0) break;
          }
          j++;
        }
        // ¿self-closing?
        const opener = content.slice(i, j + 1);
        const selfClosing = /\/\s*>$/.test(opener);
        result.push(opener);
        if (!selfClosing) stack.push(matchedTag);
        i = j + 1;
        continue;
      }
    }
    result.push(content[i]);
    i++;
  }
  return result.join("");
}

function ensureDSImport(content, comps) {
  const needed = comps.filter(
    (c) => !new RegExp(`import\\s+[^;]*\\b${c}\\b[^;]*from\\s+["']@buleje/design-system["']`).test(content),
  );
  if (needed.length === 0) return content;
  // ¿Ya hay un import del DS? Ampliar la lista de nombres.
  const existingRe = /import\s+\{([^}]+)\}\s+from\s+(["'])@buleje\/design-system\2/;
  const existing = content.match(existingRe);
  if (existing) {
    const currNames = existing[1].split(",").map((s) => s.trim()).filter(Boolean);
    const merged = Array.from(new Set([...currNames, ...comps])).sort();
    const replaced = content.replace(
      existingRe,
      `import { ${merged.join(", ")} } from "@buleje/design-system"`,
    );
    return replaced;
  }
  // Insertar nuevo import debajo de "use client"; (si existe) o al principio.
  const importLine = `import { ${comps.sort().join(", ")} } from "@buleje/design-system";\n`;
  const useClientMatch = content.match(/^("use client";\s*\n)/);
  if (useClientMatch) {
    return content.replace(useClientMatch[0], `${useClientMatch[0]}${importLine}`);
  }
  // ¿Primer import? Insertar antes.
  const firstImport = content.match(/^(import\s+[\s\S]*?;\s*\n)/m);
  if (firstImport) {
    return importLine + content;
  }
  return importLine + content;
}

// ── Sprint B2: style inline simple → className tokens ─────────────────────────
/**
 * Transforma casos determinísticos:
 *   style={{ color: "var(--X)" }}        → className="text-[var(--X)]"
 *   style={{ backgroundColor: "var(--X)" }}→ className="bg-[var(--X)]"
 *   style={{ borderColor: "var(--X)" }}  → className="border-[var(--X)]"
 *
 * Solo procesa style inline con UN único par prop:literal — no toca dinámicos.
 *
 * IMPORTANTE: para no pisar className existente, SOLO aplica cuando el elemento
 * YA tiene className="..." — en ese caso fusiona. Si no tiene className, agrega uno.
 *
 * Restricciones:
 *  - Solo literales string "var(--...)" o "#hex" simples.
 *  - No toca expresiones JS (ternarios, variables, compute).
 *  - No toca SVG elementos (heuristica: skip si el tag es svg/path/circle/rect/etc).
 */
const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "line", "polygon", "polyline", "ellipse", "g", "defs", "linearGradient", "radialGradient", "stop", "use", "text", "tspan"]);

function migrateInlineStyles(content, filePath) {
  if (HEADING_EXCLUDE.some((rx) => rx.test(filePath))) return { content, count: 0 };
  // Pattern: style={{ PROP: "VALUE" }} donde PROP es color|backgroundColor|borderColor
  // y VALUE es literal string con var(--...) o #hex.
  // Captura el elemento circundante para poder fusionar className.
  // Hacemos un pase simple via regex múltiple.
  let count = 0;
  const STYLE_SIMPLE_RE = /style=\{\{\s*(color|backgroundColor|borderColor)\s*:\s*(["'])(var\(--[\w-]+\)|#[0-9a-fA-F]{3,8})\2\s*,?\s*\}\}/g;
  const PROP_TO_TW = {
    color: "text",
    backgroundColor: "bg",
    borderColor: "border",
  };
  // Estrategia: buscar matches de STYLE_SIMPLE_RE. Para cada uno, ver si el tag
  // tiene className cerca. Usaremos una pasada: para cada match, escaneamos
  // hacia atrás hasta el '<' más reciente del mismo tag, buscamos className.
  const matches = [];
  let m;
  while ((m = STYLE_SIMPLE_RE.exec(content)) !== null) {
    matches.push({ index: m.index, length: m[0].length, prop: m[1], value: m[3] });
  }
  // Aplicar de atrás hacia adelante para no invalidar índices.
  matches.reverse();
  let result = content;
  for (const mt of matches) {
    // Encontrar el '<' tag opening más cercano hacia atrás.
    let tagStart = mt.index;
    while (tagStart > 0 && result[tagStart] !== "<") tagStart--;
    if (result[tagStart] !== "<") continue;
    // Extraer tag name
    const tagNameMatch = /^<([A-Za-z][\w.-]*)/.exec(result.slice(tagStart));
    if (!tagNameMatch) continue;
    const tagName = tagNameMatch[1];
    // Skip SVG y elementos custom que empiezan con mayus pero puedan esperar style prop (ej. Cell de Recharts).
    if (SVG_TAGS.has(tagName)) continue;
    // Heuristica conservadora: skip si es mayúscula (componente custom que podría interpretar style custom).
    if (/^[A-Z]/.test(tagName)) continue;
    // Encontrar el '>' del tag opening
    let tagEnd = tagStart;
    let depth = 0;
    let inSingle = false, inDouble = false, inBacktick = false;
    while (tagEnd < result.length) {
      const ch = result[tagEnd];
      if (!inDouble && !inBacktick && ch === "'") inSingle = !inSingle;
      else if (!inSingle && !inBacktick && ch === '"') inDouble = !inDouble;
      else if (!inSingle && !inDouble && ch === "`") inBacktick = !inBacktick;
      else if (!inSingle && !inDouble && !inBacktick) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        else if (ch === ">" && depth === 0) break;
      }
      tagEnd++;
    }
    if (result[tagEnd] !== ">") continue;
    const tagFragment = result.slice(tagStart, tagEnd + 1);
    // Verificar que el match del style esté dentro de este tag (no de uno anidado).
    if (mt.index < tagStart || mt.index + mt.length > tagEnd + 1) continue;
    const tw = PROP_TO_TW[mt.prop];
    const newClass = `${tw}-[${mt.value}]`;
    // ¿Ya tiene className="..."?
    const classRe = /className="([^"]*)"/;
    let newTag;
    if (classRe.test(tagFragment)) {
      newTag = tagFragment.replace(classRe, (_full, existingCls) => {
        if (existingCls.split(/\s+/).includes(newClass)) return `className="${existingCls}"`;
        return `className="${existingCls} ${newClass}"`;
      });
      // Remover el style inline
      newTag = newTag.replace(result.slice(mt.index, mt.index + mt.length).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "").replace(/\s{2,}/g, " ").replace(/\s+>/, ">");
    } else {
      // Agregar className y remover style. Calcular posición relativa del match dentro del tag.
      const styleStart = mt.index - tagStart;
      const before = tagFragment.slice(0, styleStart);
      const after = tagFragment.slice(styleStart + mt.length);
      newTag = `${before}className="${newClass}"${after}`.replace(/\s{2,}/g, " ").replace(/\s+>/, ">");
    }
    result = result.slice(0, tagStart) + newTag + result.slice(tagEnd + 1);
    count++;
  }
  return { content: result, count };
}

// Lista no-cambiante solo para reporte
const REPORT_ONLY_PATTERNS = [
  {
    id: "text-blue-decorative",
    pattern: /(?<![\w-])(text|bg)-blue-(500|600)(?!\w)/g,
    advice: "Posible accent/brand — decide manualmente si debe ser tokenizado",
  },
];

// ── File discovery ────────────────────────────────────────────────────────────
const ADMIN_ROOTS = [
  "components/admin",
  "app/admin",
];

// Archivos donde se permite lucide-react directo (DS primitives, sidebar legacy etc.)
const LUCIDE_EXCLUDE = [
  /packages[\\/]design-system[\\/]/,
  /components[\\/]admin[\\/]shared[\\/]/,
  /components[\\/]admin[\\/]layout[\\/]/,
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

const files = ADMIN_ROOTS.flatMap((r) => walk(resolve(process.cwd(), r)));

// ── Run ───────────────────────────────────────────────────────────────────────
const summary = {
  totalFiles: files.length,
  filesChanged: 0,
  filesByTransform: {},
  totalReplacements: 0,
  lucideFilesChanged: 0,
  headingsChanged: 0,
  headingsByTag: { h1: 0, h2: 0, h3: 0 },
  stylesRewritten: 0,
  reportOnlyHits: 0,
  reportOnlyByFile: new Map(),
};

const detailsByFile = new Map();

for (const file of files) {
  let content = readFileSync(file, "utf8");
  const original = content;
  const localHits = {};

  // Step 1: text-gray-* transforms.
  for (const t of TRANSFORMS) {
    const matches = content.match(t.pattern);
    if (matches) {
      localHits[t.id] = matches.length;
      content = content.replace(t.pattern, t.replacement);
    }
  }

  // Step 2: lucide-import only in non-excluded admin files.
  const isExcluded = LUCIDE_EXCLUDE.some((rx) => rx.test(file));
  if (!isExcluded) {
    const lucideMatches = content.match(LUCIDE_TRANSFORM.pattern);
    if (lucideMatches) {
      localHits[LUCIDE_TRANSFORM.id] = lucideMatches.length;
      content = content.replace(LUCIDE_TRANSFORM.pattern, LUCIDE_TRANSFORM.replacement);
      summary.lucideFilesChanged++;
    }
  }

  // Step 2b (Sprint B1): h1/h2/h3 → DS typography.
  const headingResult = migrateHeadings(content, file);
  if (headingResult.counts.h1 + headingResult.counts.h2 + headingResult.counts.h3 > 0) {
    content = headingResult.content;
    for (const tag of ["h1", "h2", "h3"]) {
      const n = headingResult.counts[tag] ?? 0;
      if (n > 0) {
        localHits[`heading-${tag}-to-ds`] = n;
        summary.headingsByTag[tag] += n;
        summary.headingsChanged += n;
      }
    }
  }

  // Step 2c (Sprint B2): style={{ color|bg|border }} simple → className.
  const styleResult = migrateInlineStyles(content, file);
  if (styleResult.count > 0) {
    content = styleResult.content;
    localHits["style-inline-to-class"] = styleResult.count;
    summary.stylesRewritten += styleResult.count;
  }

  // Step 3: REPORT-ONLY patterns (no change).
  for (const r of REPORT_ONLY_PATTERNS) {
    const hits = content.match(r.pattern);
    if (hits) {
      const list = summary.reportOnlyByFile.get(file) ?? [];
      list.push({ id: r.id, count: hits.length, advice: r.advice });
      summary.reportOnlyByFile.set(file, list);
      summary.reportOnlyHits += hits.length;
    }
  }

  if (content !== original) {
    summary.filesChanged++;
    detailsByFile.set(file, localHits);
    for (const [id, n] of Object.entries(localHits)) {
      summary.filesByTransform[id] = (summary.filesByTransform[id] ?? 0) + n;
      summary.totalReplacements += n;
    }
    if (APPLY) {
      writeFileSync(file, content, "utf8");
    }
  }
}

// ── Output ────────────────────────────────────────────────────────────────────
const lines = [];
lines.push(`# Migration to DS — ${APPLY ? "APPLIED" : "DRY RUN"}`);
lines.push(`Scanned: ${summary.totalFiles} files in ${ADMIN_ROOTS.join(", ")}`);
lines.push(`Files changed: ${summary.filesChanged}`);
lines.push(`Total replacements: ${summary.totalReplacements}`);
lines.push(`Lucide imports rewritten: ${summary.lucideFilesChanged}`);
lines.push(`Headings migrated to DS: ${summary.headingsChanged} (h1=${summary.headingsByTag.h1}, h2=${summary.headingsByTag.h2}, h3=${summary.headingsByTag.h3})`);
lines.push(`Inline styles rewritten to className: ${summary.stylesRewritten}`);
lines.push("");
lines.push("## By transform");
for (const [id, count] of Object.entries(summary.filesByTransform).sort((a, b) => b[1] - a[1])) {
  lines.push(`  ${id}: ${count}`);
}
lines.push("");
lines.push(`## Report-only patterns (require manual decision): ${summary.reportOnlyHits} hits`);
if (summary.reportOnlyByFile.size > 0) {
  lines.push("");
  for (const [file, items] of summary.reportOnlyByFile) {
    const rel = file.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, "");
    lines.push(`  ${rel}`);
    for (const it of items) {
      lines.push(`    - ${it.id}: ${it.count} (${it.advice})`);
    }
  }
}

const output = lines.join("\n");
console.log(output);
if (REPORT_FILE) {
  writeFileSync(REPORT_FILE, output, "utf8");
  console.log(`\nReport written to ${REPORT_FILE}`);
}
